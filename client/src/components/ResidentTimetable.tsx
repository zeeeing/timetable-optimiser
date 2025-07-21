import React from "react";
import type { Resident, ApiResponse } from "../types";
import { monthLabels } from "../lib/constants";
import {
  Table,
  TableBody,
  // TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { Badge } from "./ui/badge";

const ResidentTimetable: React.FC<{
  resident: Resident;
  apiResponse: ApiResponse;
}> = ({ resident, apiResponse }) => {
  // all postings for current resident
  const allPostings = apiResponse.resident_history.filter(
    (h) => h.mcr === resident.mcr
  );

  // current year optimised postings
  const currentYearPostings = allPostings.filter(
    (h) => h.is_current_year === true
  );

  // past year postings
  const pastYearPostings = allPostings.filter(
    (h) => h.is_current_year === false
  );

  // create posting map: look up by posting code
  const postingMap = apiResponse.postings.reduce((map, posting) => {
    map[posting.posting_code] = posting;
    return map;
  }, {} as Record<string, (typeof apiResponse.postings)[0]>);

  // create block to posting map for current year
  const currentYearBlockPostings = currentYearPostings.reduce(
    (map, assignment) => {
      map[assignment.block] = assignment;
      return map;
    },
    {} as Record<number, (typeof currentYearPostings)[0]>
  );

  // create year to block to posting nested map for past years
  const pastYearBlockPostings = pastYearPostings.reduce((map, assignment) => {
    if (!map[assignment.year]) {
      map[assignment.year] = {};
    }
    map[assignment.year][assignment.block] = assignment;
    return map;
  }, {} as Record<number, Record<number, (typeof pastYearPostings)[0]>>);

  return (
    <div className="bg-gray-50 rounded-lg p-6 space-y-6">
      {/* resident information */}
      <div className="flex flex-col space-y-4">
        <h2 className="text-lg font-semibold text-gray-800">
          Resident Information
        </h2>
        <div className="flex justify-between">
          <div className="flex flex-col gap-2">
            <p>
              Name: {resident.name} ({resident.mcr})
            </p>
            <p>
              Resident Year:{" "}
              <Badge variant="outline" className="bg-blue-200 text-md">
                {resident.resident_year}
              </Badge>
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 w-lg">
            <div className="space-x-2 space-y-2">
              {Object.entries(resident.core_blocks_completed)
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([key, value]) => (
                  <Badge variant="outline" className="text-sm">
                    {key} : {value}
                  </Badge>
                ))}
            </div>
            <div className="flex flex-col gap-2 items-end">
              <Badge variant="outline" className="text-sm">
                Total Electives Completed: {resident.unique_electives_completed}
              </Badge>
              <Badge
                variant="outline"
                className={`text-sm ${
                  resident.ccr_status.completed
                    ? "bg-green-100 text-green-800"
                    : "bg-red-100 text-red-800"
                }`}
              >
                CCR Completed :{" "}
                {resident.ccr_status.completed ? "YES" : "NO"}
              </Badge>
              <Badge variant="outline" className="text-sm">
                CCR Posting : {resident.ccr_status.posting_code}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* timetable */}
      <div className="rounded-md border">
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
              .sort((a, b) => parseInt(b) - parseInt(a))
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
                                  posting?.posting_type === "core"
                                    ? "bg-orange-100 text-orange-800"
                                    : "bg-green-100 text-green-800"
                                }`}
                                variant="outline"
                              >
                                {posting?.posting_type.toUpperCase() || ""}
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
                            posting?.posting_type === "core"
                              ? "bg-orange-100 text-orange-800"
                              : "bg-green-100 text-green-800"
                          }`}
                          variant="outline"
                        >
                          {posting?.posting_type.toUpperCase() || ""}
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
    </div>
  );
};

export default ResidentTimetable;
