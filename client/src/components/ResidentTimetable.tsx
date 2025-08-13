import React, { useState, useEffect, useMemo, useRef } from "react";
import { DndContext, type DragEndEvent } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  SortableContext,
  useSortable,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  restrictToHorizontalAxis,
  restrictToFirstScrollableAncestor,
  restrictToWindowEdges,
} from "@dnd-kit/modifiers";

import type { Resident, ResidentHistory, Posting } from "../types";
import monthLabels from "../../../shared/monthLabels.json";
import { cn } from "@/lib/utils";
import { areSchedulesEqual, moveByInsert } from "@/lib/utils";
import { useApiResponseContext } from "@/context/ApiResponseContext";

import ErrorAlert from "./ErrorAlert";
import ConstraintsAccordion from "./ConstraintsAccordion";

import { Badge } from "./ui/badge";
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

  const {
    postingMap,
    preferenceMap,
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
      .filter((p) => p.mcr === resident.mcr)
      .reduce<Record<number, string>>((m, p) => {
        m[p.preference_rank] = p.posting_code;
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
      pastYearBlockPostings,
      initialCurrentYearBlockPostings,
      electiveCounts,
      currentYearItemIds,
      optimisationScoreRaw,
      optimisationScoreNormalised,
      residentIndex,
    };
  }, [apiResponse, resident.mcr]);

  // definte local states
  const [currentYearBlockPostings, setCurrentYearBlockPostings] =
    useState<BlockMap>(initialCurrentYearBlockPostings);
  const originalBlockPostings = useRef<BlockMap>(
    initialCurrentYearBlockPostings
  );
  const [editedBlocks, setEditedBlocks] = useState<Set<number>>(new Set());

  const hasEdits = useMemo(
    () =>
      !areSchedulesEqual(
        currentYearBlockPostings,
        originalBlockPostings.current
      ),
    [currentYearBlockPostings]
  );

  useEffect(() => {
    setCurrentYearBlockPostings(initialCurrentYearBlockPostings);
    originalBlockPostings.current = initialCurrentYearBlockPostings;
    setEditedBlocks(new Set());
  }, [initialCurrentYearBlockPostings]);

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
  };

  const handleSave = async () => {
    if (!apiResponse) return;

    setIsSaving(true);
    try {
      // remove this resident's current year rows
      const withoutResidentCurrent =
        apiResponse.resident_history.filter(
          (h) => !(h.mcr === resident.mcr && h.is_current_year)
        ) ?? [];

      // add updated current year rows
      const newCurrentYearRows: ResidentHistory[] = [];
      for (let block = 1; block <= 12; block++) {
        const a = currentYearBlockPostings[block];
        if (a) {
          newCurrentYearRows.push({ ...a, block, is_current_year: true });
        }
      }

      const nextApi = {
        ...apiResponse,
        resident_history: [...withoutResidentCurrent, ...newCurrentYearRows],
      };

      setApiResponse(nextApi); // update apiResponse context
      originalBlockPostings.current = currentYearBlockPostings; // lock in the new baseline
      setEditedBlocks(new Set());
    } finally {
      setIsSaving(false);
    }
  };

  interface SortableBlockCellProps {
    blockNumber: number;
    postingAssignment?: ResidentHistory;
    edited: boolean;
  }

  const SortableBlockCell: React.FC<SortableBlockCellProps> = ({
    blockNumber,
    postingAssignment,
    edited,
  }) => {
    // posting info
    const posting: Posting | null = postingAssignment
      ? postingMap[postingAssignment.posting_code]
      : null;

    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
      isOver,
    } = useSortable({ id: blockNumber.toString() });

    const style: React.CSSProperties = {
      transform: transform ? CSS.Transform.toString(transform) : undefined,
      transition,
    };

    const badgeClass =
      posting?.posting_code === resident.ccr_status.posting_code
        ? "bg-purple-100 text-purple-800"
        : posting?.posting_type === "core"
        ? "bg-orange-100 text-orange-800"
        : "bg-green-100 text-green-800";

    return (
      <TableCell
        className={cn(
          "text-center hover:bg-blue-200",
          edited && "bg-yellow-100 hover:bg-yellow-200",
          isOver && "bg-blue-200"
        )}
      >
        <div
          ref={setNodeRef}
          style={style}
          {...listeners}
          {...attributes}
          className={cn(
            "space-y-1 cursor-grab",
            isDragging && "cursor-grabbing"
          )}
        >
          {postingAssignment ? (
            <>
              <div className="font-medium text-sm text-blue-800">
                {postingAssignment.posting_code}
              </div>
              <Badge className={badgeClass} variant="outline">
                {posting?.posting_code === resident.ccr_status.posting_code
                  ? "CCR"
                  : posting?.posting_type.toUpperCase() || ""}
              </Badge>
            </>
          ) : (
            <span className="text-gray-400 text-sm">-</span>
          )}
        </div>
      </TableCell>
    );
  };

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
                    matches their preferences and program goals, normalised to
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
                                    posting?.posting_code ===
                                    resident.ccr_status.posting_code
                                      ? "bg-purple-100 text-purple-800"
                                      : posting?.posting_type === "core"
                                      ? "bg-orange-100 text-orange-800"
                                      : "bg-green-100 text-green-800"
                                  }`}
                                  variant="outline"
                                >
                                  {posting?.posting_code ===
                                  resident.ccr_status.posting_code
                                    ? "CCR"
                                    : posting?.posting_type.toUpperCase() || ""}
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
              <DndContext
                modifiers={[
                  restrictToHorizontalAxis, // lock movement to X only
                  restrictToFirstScrollableAncestor, // prevent pulling the page/container vertically
                  restrictToWindowEdges, // keep overlay within viewport
                ]}
                onDragEnd={isSaving ? undefined : handleDragEnd}
              >
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
                        />
                      );
                    })}
                  </TableRow>
                </SortableContext>
              </DndContext>
            </TableBody>
          </Table>
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

      {/* constraints (violations and penalties) */}
      <CardContent className="flex gap-6">
        <div className="flex flex-col gap-2 w-1/2">
          {resident.constraints.filter((c) => c.type === "violation").length >
            0 && (
            <ErrorAlert
              message="Violations"
              description={resident.constraints
                .filter((c) => c.type === "violation")
                .map((c) => c.description)}
            />
          )}
          {resident.constraints.filter((c) => c.type === "penalty").length >
            0 && (
            <ErrorAlert
              message="Penalties"
              description={resident.constraints
                .filter((c) => c.type === "penalty")
                .map((c) => c.description)}
            />
          )}
          {resident.constraints.length == 0 && (
            <ErrorAlert message="No violations or penalties incurred." />
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
                  Total Preferences:{" "}
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
                    <TableHead className="text-center">Preference</TableHead>
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
    </Card>
  );
};

export default ResidentTimetable;
