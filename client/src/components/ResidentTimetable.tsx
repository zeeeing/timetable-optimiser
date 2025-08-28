import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  restrictToHorizontalAxis,
  restrictToFirstScrollableAncestor,
  restrictToWindowEdges,
} from "@dnd-kit/modifiers";

import type { Resident, ResidentHistory, Posting, Violation } from "../types";
import monthLabels from "../../../shared/monthLabels.json";
import { areSchedulesEqual, moveByInsert } from "@/lib/utils";
import { useApiResponseContext } from "@/context/ApiResponseContext";
import { validateSchedule, saveSchedule } from "@/api/api";

import ErrorAlert from "./ErrorAlert";
import ConstraintsAccordion from "./ConstraintsAccordion";
import SortableBlockCell from "./SortableBlockCell";

import { Badge } from "./ui/badge";
import UnfilledMonthsDiagnostics from "./UnfilledMonthsDiagnostics";
import { Button } from "./ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { Tooltip, TooltipTrigger, TooltipContent } from "./ui/tooltip";
import { Info, ChevronLeft, ChevronRight, Loader2Icon } from "lucide-react";
import { CCR_POSTINGS } from "@/lib/constants";

type BlockMap = Record<number, ResidentHistory>;

interface Props {
  resident: Resident;
  onPrev: () => void;
  onNext: () => void;
  disablePrev: boolean;
  disableNext: boolean;
}

const ResidentTimetable: React.FC<Props> = ({
  resident,
  onPrev,
  onNext,
  disablePrev,
  disableNext,
}) => {
  const { apiResponse, setApiResponse } = useApiResponseContext();
  const [isSaving, setIsSaving] = useState(false);
  const [violations, setViolations] = useState<Violation[]>([]);

  // required so that popover does not get "eaten" by the DnD overlay
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 1,
      },
    })
  );

  const {
    postingMap,
    preferenceMap,
    srPreferenceMap,
    pastYearBlockPostings,
    initialCurrentYearBlockPostings,
    electiveCounts,
    currentYearItemIds,
    optimisationScoreRaw,
    optimisationScoreNormalised,
    residentIndex,
  } = useMemo(() => {
    const postingMap: Record<string, Posting> = (
      apiResponse?.postings ?? []
    ).reduce((m, p) => {
      m[p.posting_code] = p;
      return m;
    }, {} as Record<string, Posting>);

    const allHistory = (apiResponse?.resident_history ?? []).filter(
      (h) => h.mcr === resident.mcr
    );

    const currentYear = allHistory.filter((h) => h.is_current_year === true);
    const pastYear = allHistory.filter((h) => h.is_current_year === false);

    const initialCurrentYearBlockPostings = currentYear.reduce<BlockMap>(
      (m, a) => {
        m[a.block] = a;
        return m;
      },
      {}
    );

    const pastYearBlockPostings = pastYear.reduce<
      Record<number, Record<number, ResidentHistory>>
    >((m, a) => {
      (m[a.year] ??= {})[a.block] = a;
      return m;
    }, {});

    const preferenceMap = (apiResponse?.resident_preferences ?? [])
      .filter((p) => p.mcr === resident.mcr && p.posting_code)
      .reduce<Record<number, string>>((m, p) => {
        m[p.preference_rank] = p.posting_code;
        return m;
      }, {});

    const srPreferenceMap = (apiResponse?.resident_sr_preferences ?? [])
      .filter((p) => p.mcr === resident.mcr && p.base_posting)
      .reduce<Record<number, string>>((m, p) => {
        m[p.preference_rank] = p.base_posting;
        return m;
      }, {});

    const electiveCounts = allHistory
      .filter((h) => postingMap[h.posting_code]?.posting_type === "elective")
      .reduce<Record<string, number>>((acc, h) => {
        acc[h.posting_code] = (acc[h.posting_code] ?? 0) + 1;
        return acc;
      }, {});

    const currentYearItemIds = monthLabels.map((_, i) => String(i + 1));

    const residentIndex =
      apiResponse?.residents?.findIndex((r) => r.mcr === resident.mcr) ?? -1;
    const optimisationScoreRaw =
      apiResponse?.statistics?.cohort?.optimisation_scores?.[residentIndex];
    const optimisationScoreNormalised =
      apiResponse?.statistics?.cohort?.optimisation_scores_normalised?.[
        residentIndex
      ];

    return {
      postingMap,
      preferenceMap,
      srPreferenceMap,
      pastYearBlockPostings,
      initialCurrentYearBlockPostings,
      electiveCounts,
      currentYearItemIds,
      optimisationScoreRaw,
      optimisationScoreNormalised,
      residentIndex,
    };
  }, [apiResponse, resident.mcr]);

  // define current evolving state for current year block postings
  const [currentYearBlockPostings, setCurrentYearBlockPostings] =
    useState<BlockMap>(initialCurrentYearBlockPostings);
  // reference the original postings for comparison to current state
  const originalBlockPostings = useRef<BlockMap>(
    initialCurrentYearBlockPostings
  );
  // track which blocks have been edited
  const [editedBlocks, setEditedBlocks] = useState<Set<number>>(new Set());

  // boolean value to track if edits were made
  const hasEdits = useMemo(
    () =>
      !areSchedulesEqual(
        currentYearBlockPostings,
        originalBlockPostings.current
      ),
    [currentYearBlockPostings]
  );

  const handleDragEnd = (event: DragEndEvent) => {
    if (isSaving) return;
    const { active, over } = event;
    if (!over) return;

    const from = parseInt(String(active.id), 10);
    const to = parseInt(String(over.id), 10);
    if (Number.isNaN(from) || Number.isNaN(to) || from === to) return;

    setCurrentYearBlockPostings((prev) => {
      // insert and move other postings
      const updated = moveByInsert(prev, from, to);

      // recompute edited blocks vs baseline snapshot
      const newEdited = new Set<number>();
      for (let i = 1; i <= 12; i++) {
        const orig = originalBlockPostings.current[i]?.posting_code ?? "";
        const curr = updated[i]?.posting_code ?? "";
        if (orig !== curr) newEdited.add(i);
      }
      setEditedBlocks(newEdited);

      return updated;
    });
  };

  const handleCancel = () => {
    setCurrentYearBlockPostings(originalBlockPostings.current);
    setEditedBlocks(new Set());
    setViolations([]);
  };

  const handleSelectPosting = (blockNumber: number, newPostingCode: string) => {
    if (isSaving) return;
    setCurrentYearBlockPostings((prev) => {
      const updated: BlockMap = { ...prev } as BlockMap;

      const existing: ResidentHistory = updated[blockNumber];
      const inferredYear =
        existing?.year ||
        Object.values(initialCurrentYearBlockPostings)[0]?.year ||
        0;
      updated[blockNumber] = existing
        ? { ...existing, posting_code: newPostingCode }
        : {
            mcr: resident.mcr,
            year: inferredYear,
            block: blockNumber,
            posting_code: newPostingCode,
            is_current_year: true,
          };

      // recompute edited blocks vs baseline snapshot
      const newEdited = new Set<number>();
      for (let i = 1; i <= 12; i++) {
        const orig = originalBlockPostings.current[i]?.posting_code ?? "";
        const curr = updated[i]?.posting_code ?? "";
        if (orig !== curr) newEdited.add(i);
      }
      setEditedBlocks(newEdited);

      return updated;
    });
  };

  const handleSave = async () => {
    if (isSaving || !resident) return;
    if (!hasEdits) return;

    setIsSaving(true);
    try {
      const current_year = Array.from({ length: 12 }, (_, i) => {
        const block = i + 1;
        const a = currentYearBlockPostings[block];
        return a?.posting_code ? { block, posting_code: a.posting_code } : null;
      }).filter(Boolean) as { block: number; posting_code: string }[];

      // 1. validate
      const validated = await validateSchedule({
        resident_mcr: resident.mcr,
        current_year,
      });
      setViolations(validated.success ? [] : validated.violations || []);
      if (!validated.success) return; // show violations, abort save

      // 2. save response if validated
      const updatedApi = await saveSchedule({
        resident_mcr: resident.mcr,
        current_year,
      });
      setApiResponse(updatedApi);
      // clear alerts on successful save
      setViolations([]);
    } catch (err: any) {
      const msg =
        err?.response?.data?.errors?.join(", ") ||
        err?.response?.data?.error ||
        err?.message ||
        "Validation failed";
      console.error(msg);
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    setCurrentYearBlockPostings(initialCurrentYearBlockPostings);
    originalBlockPostings.current = initialCurrentYearBlockPostings;
    setEditedBlocks(new Set());
  }, [initialCurrentYearBlockPostings]);

  useEffect(() => {
    console.log(srPreferenceMap);
  }, [srPreferenceMap]);

  return (
    <Card className="bg-gray-50">
      {/* resident information */}
      <CardHeader>
        <CardTitle>Resident Information & Timetable</CardTitle>
        <CardDescription className="flex gap-8 items-center">
          <p>
            Name: {resident.name} ({resident.mcr})
          </p>
          <p>
            Current Resident Year:{" "}
            <Badge
              variant="outline"
              className="bg-blue-200 text-blue-800 text-md"
            >
              {resident.resident_year}
            </Badge>
          </p>
        </CardDescription>
        <CardAction className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="text-md bg-yellow-100 text-yellow-800 flex items-center gap-1"
          >
            Optimisation Score:{" "}
            {residentIndex >= 0 ? optimisationScoreNormalised : "-"}
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-pointer">
                  <Info size={16} />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-3xs">
                <div className="flex flex-col justify-center items-center text-center">
                  <p>
                    This score reflects how well this resident's timetable
                    matches their preferences and programme goals, normalised to
                    the top-performing resident in the cohort (100% = best score
                    achieved).
                  </p>
                  <br />
                  <span>
                    (Raw Score:{" "}
                    {residentIndex >= 0 ? optimisationScoreRaw : "-"})
                  </span>
                </div>
              </TooltipContent>
            </Tooltip>
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            onClick={onPrev}
            disabled={disablePrev}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onNext}
            disabled={disableNext}
          >
            <ChevronRight />
          </Button>
        </CardAction>
      </CardHeader>

      {/* resident timetable */}
      <CardContent>
        <div className="bg-white rounded-md border p-2">
          <DndContext
            modifiers={[
              restrictToHorizontalAxis, // lock movement to X only
              restrictToFirstScrollableAncestor, // prevent pulling the page/container vertically
              restrictToWindowEdges, // keep overlay within viewport
            ]}
            onDragEnd={isSaving ? undefined : handleDragEnd}
            sensors={sensors}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-left">Year</TableHead>
                  {monthLabels.map((month) => (
                    <TableHead key={month} className="text-center">
                      {month}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Past years */}
                {Object.keys(pastYearBlockPostings)
                  .sort((a, b) => parseInt(a) - parseInt(b))
                  .map((year) => {
                    const yearPostings = pastYearBlockPostings[parseInt(year)];
                    return (
                      <TableRow key={`year-${year}`}>
                        <TableCell className="font-medium text-gray-600">
                          Year {year}
                        </TableCell>
                        {monthLabels.map((month, index) => {
                          const blockNumber = index + 1;
                          const assignment = yearPostings[blockNumber];
                          const posting = assignment
                            ? postingMap[assignment.posting_code]
                            : null;

                          return (
                            <TableCell key={month} className="text-center">
                              {assignment ? (
                                <div className="space-y-1">
                                  <div className="font-medium text-sm text-gray-600">
                                    {assignment.posting_code}
                                  </div>
                                  <Badge
                                    className={`${
                                      posting?.posting_code &&
                                      CCR_POSTINGS.includes(
                                        posting.posting_code
                                      )
                                        ? "bg-purple-100 text-purple-800"
                                        : posting?.posting_type === "core"
                                        ? "bg-orange-100 text-orange-800"
                                        : "bg-green-100 text-green-800"
                                    }`}
                                    variant="outline"
                                  >
                                    {posting?.posting_code &&
                                    CCR_POSTINGS.includes(posting.posting_code)
                                      ? "CCR"
                                      : posting?.posting_type.toUpperCase() ||
                                        ""}
                                  </Badge>
                                </div>
                              ) : (
                                <span className="text-gray-300 text-sm">-</span>
                              )}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    );
                  })}

                {/* Current year */}
                <SortableContext
                  items={currentYearItemIds}
                  strategy={horizontalListSortingStrategy}
                >
                  <TableRow className="bg-blue-100 hover:bg-blue-100">
                    <TableCell className="font-semibold">
                      Current Year
                    </TableCell>
                    {monthLabels.map((month, index) => {
                      const blockNumber = index + 1;
                      const postingAssignment =
                        currentYearBlockPostings[blockNumber];

                      return (
                        <SortableBlockCell
                          key={month}
                          blockNumber={blockNumber}
                          postingAssignment={postingAssignment}
                          edited={editedBlocks.has(blockNumber)}
                          postingMap={postingMap}
                          onSelectPosting={(code) =>
                            handleSelectPosting(blockNumber, code)
                          }
                        />
                      );
                    })}
                  </TableRow>
                </SortableContext>
              </TableBody>
            </Table>
          </DndContext>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button
            variant="ghost"
            className="cursor-pointer"
            onClick={handleCancel}
            disabled={!hasEdits || isSaving}
          >
            Cancel
          </Button>
          <Button
            className="bg-green-600 text-white hover:bg-green-700 cursor-pointer"
            onClick={handleSave}
            disabled={!hasEdits || isSaving}
          >
            {isSaving ? (
              <Loader2Icon>Validating & Saving...</Loader2Icon>
            ) : (
              "Save"
            )}
          </Button>
        </div>
      </CardContent>

      {/* validation results */}
      <CardContent className="flex gap-6">
        <div className="flex flex-col gap-2 w-1/2">
          {violations.length > 0 ? (
            <ErrorAlert
              message="Violations"
              description={violations.map(
                (v) => `[${v.code}] ${v.description}`
              )}
              variantType="destructive"
            />
          ) : (
            <>
              {resident.violations && resident.violations.length > 0 && (
                <ErrorAlert
                  message="Violations"
                  description={resident.violations.map(
                    (v) => `[${v.code}] ${v.description}`
                  )}
                />
              )}
              {(!resident.violations || resident.violations.length === 0) && (
                <ErrorAlert message="No violations." />
              )}
            </>
          )}
        </div>
        <div className="w-1/2">
          <ConstraintsAccordion />
        </div>
      </CardContent>

      {/* resident statistics */}
      <CardContent className="flex flex-col md:flex-row justify-between gap-6">
        <div className="flex gap-6">
          {/* core postings completed */}
          <div className="flex flex-col gap-2">
            {Object.entries(resident.core_blocks_completed)
              .sort((a, b) => a[0].localeCompare(b[0]))
              .map(([key, value]) => (
                <div key={key}>
                  <Badge variant="outline" className="text-sm">
                    {key} : {value}
                  </Badge>
                </div>
              ))}
          </div>

          {/* ccr status */}
          <div className="flex flex-col gap-2">
            <Badge
              variant="outline"
              className={`text-sm ${
                resident.ccr_status.completed
                  ? "bg-green-100 text-green-800"
                  : "bg-red-100 text-red-800"
              }`}
            >
              CCR Completed : {resident.ccr_status.completed ? "YES" : "NO"}
            </Badge>
            <Badge variant="outline" className="text-sm">
              CCR Posting : {resident.ccr_status.posting_code}
            </Badge>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-6">
          {/* resident preferences */}
          <Card>
            <CardContent>
              <div className="flex justify-center mb-2">
                <Badge variant="secondary" className="text-sm">
                  Total Elective Preferences:{" "}
                  {
                    Object.values(preferenceMap).filter(
                      (code) => code.trim() !== ""
                    ).length
                  }
                </Badge>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-center">Rank</TableHead>
                    <TableHead className="text-center">Elective Code</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(preferenceMap).map(([rank, postingCode]) => (
                    <TableRow key={rank}>
                      <TableCell className="text-center">{rank}</TableCell>
                      <TableCell className="text-center">
                        {postingCode.length > 0 ? postingCode : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* SR base preferences */}
          <Card>
            <CardContent>
              <div className="flex justify-center mb-2">
                <Badge variant="secondary" className="text-sm">
                  Total SR Preferences:{" "}
                  {
                    (Object.values(srPreferenceMap) as string[]).filter(
                      (base) => base.trim() !== ""
                    ).length
                  }
                </Badge>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-center">Rank</TableHead>
                    <TableHead className="text-center">Department</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(Object.entries(srPreferenceMap) as [string, string][]).map(
                    ([rank, base]) => (
                      <TableRow key={rank}>
                        <TableCell className="text-center">{rank}</TableCell>
                        <TableCell className="text-center">
                          {base && base.length > 0 ? base : "-"}
                        </TableCell>
                      </TableRow>
                    )
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* electives completed */}
          <Card>
            <CardContent>
              <div className="flex justify-center mb-2">
                <Badge variant="secondary" className="text-sm">
                  Total Electives Completed:{" "}
                  {resident.unique_electives_completed.length}
                </Badge>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-center">Elective Name</TableHead>
                    <TableHead className="text-center">Month(s)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(electiveCounts).map(([code, count]) => (
                    <TableRow key={code}>
                      <TableCell className="text-center">
                        {postingMap[code]?.posting_name || code}
                      </TableCell>
                      <TableCell className="text-center">{count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </CardContent>

      {/* diagnostics for OFF (unassigned) months */}
      {apiResponse?.diagnostics && (
        <CardContent>
          <UnfilledMonthsDiagnostics
            apiResponse={apiResponse}
            residentMcr={resident.mcr}
            postingMap={postingMap}
          />
        </CardContent>
      )}
    </Card>
  );
};

export default ResidentTimetable;
