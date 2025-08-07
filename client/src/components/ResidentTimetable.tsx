import React from "react";
import type { Resident, ApiResponse } from "../types";
import monthLabels from "../../../shared/monthLabels.json";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { Badge } from "./ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Tooltip, TooltipTrigger, TooltipContent } from "./ui/tooltip";
import { Info } from "lucide-react";
import ErrorAlert from "./ErrorAlert";

const ResidentTimetable: React.FC<{
  resident: Resident;
  apiResponse: ApiResponse;
}> = ({ resident, apiResponse }) => {
  // all postings
  const allResidentHistory = apiResponse.resident_history.filter(
    (h) => h.mcr === resident.mcr
  );

  // current year assigned postings
  const currentYearPostings = allResidentHistory.filter(
    (h) => h.is_current_year === true
  );

  // past year postings
  const pastYearPostings = allResidentHistory.filter(
    (h) => h.is_current_year === false
  );

  // create [posting_code : posting_info] map
  const postingMap = apiResponse.postings.reduce((map, posting) => {
    map[posting.posting_code] = posting;
    return map;
  }, {} as Record<string, (typeof apiResponse.postings)[0]>);

  // create [block : resident current year assignment] map
  const currentYearBlockPostings = currentYearPostings.reduce(
    (map, assignment) => {
      map[assignment.block] = assignment;
      return map;
    },
    {} as Record<number, (typeof currentYearPostings)[0]>
  );

  // create [year : [block : resident history]] nested map for past years
  const pastYearBlockPostings = pastYearPostings.reduce((map, assignment) => {
    if (!map[assignment.year]) {
      map[assignment.year] = {};
    }
    map[assignment.year][assignment.block] = assignment;
    return map;
  }, {} as Record<number, Record<number, (typeof pastYearPostings)[0]>>);

  // create preference map
  const preferenceMap = apiResponse.resident_preferences
    .filter((p) => p.mcr === resident.mcr)
    .reduce((map, preference) => {
      map[preference.preference_rank] = preference.posting_code;
      return map;
    }, {} as Record<number, string>);

  // get optimisation score
  const residentIndex = apiResponse.residents.findIndex(
    (r) => r.mcr === resident.mcr
  );
  const optimisationScoreNormalised =
    apiResponse.statistics.cohort.optimisation_scores_normalised[residentIndex];
  const optimisationScoreRaw =
    apiResponse.statistics.cohort.optimisation_scores[residentIndex];

  return (
    <Card className="bg-gray-50 overflow-scroll">
      {/* resident information */}
      <CardHeader>
        <CardTitle>Resident Information</CardTitle>
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
        <CardAction>
          <Badge
            variant="outline"
            className="text-md bg-yellow-100 text-yellow-800 flex items-center gap-1"
          >
            Optimisation Score: {optimisationScoreNormalised}
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
                  {optimisationScoreRaw !== undefined && (
                    <span>(Raw Score: {optimisationScoreRaw})</span>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          </Badge>
        </CardAction>
      </CardHeader>

      {/* resident timetable */}
      <CardContent>
        <div className="bg-white rounded-md overflow-auto p-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-left">Year</TableHead>
                {monthLabels.map((month) => (
                  <TableHead key={month} className="text-center w-3xs">
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
              <TableRow className="bg-blue-100 hover:bg-blue-200">
                <TableCell className="font-semibold">Current Year</TableCell>
                {monthLabels.map((month, index) => {
                  const blockNumber = index + 1;
                  const assignment = currentYearBlockPostings[blockNumber];
                  const posting = assignment
                    ? postingMap[assignment.posting_code]
                    : null;

                  return (
                    <TableCell key={month} className="text-center">
                      {assignment ? (
                        <div className="space-y-1">
                          <div className="font-medium text-sm text-blue-800">
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
                        <span className="text-gray-400 text-sm">-</span>
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>

      {/* constraints (violations and penalties) */}
      <CardContent className="flex flex-col gap-2">
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
                  {Object.entries(
                    allResidentHistory
                      .filter(
                        (h) =>
                          postingMap[h.posting_code]?.posting_type ===
                            "elective" &&
                          resident.unique_electives_completed.includes(
                            h.posting_code
                          )
                      )
                      .reduce((acc, h) => {
                        acc[h.posting_code] = (acc[h.posting_code] || 0) + 1;
                        return acc;
                      }, {} as Record<string, number>)
                  ).map(([code, count]) => (
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
