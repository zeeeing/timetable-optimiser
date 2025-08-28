import React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardAction,
  CardDescription,
} from "./ui/card";
import { Badge } from "./ui/badge";
import type { ApiResponse } from "../types";
import { Checkbox } from "./ui/checkbox";
import { Button } from "./ui/button";
import monthLabels from "../../../shared/monthLabels.json";
import { cn } from "@/lib/utils";

interface PlanningOverviewTableProps {
  apiResponse: ApiResponse;
  pinnedMcrs?: Set<string>;
  setPinnedMcrs: (set: Set<string>) => void;
  onTogglePin?: (mcr: string) => void;
  onPinAllYear?: (year: number) => void;
  onUnpinAllYear?: (year: number) => void;
}

const PlanningOverviewTable: React.FC<PlanningOverviewTableProps> = ({
  apiResponse,
  pinnedMcrs,
  setPinnedMcrs,
  onTogglePin,
  onPinAllYear,
  onUnpinAllYear,
}) => {
  const { residents, resident_history, statistics } = apiResponse;
  const optimisationScores = statistics.cohort.optimisation_scores;

  // filter by current year history
  const currentYearHistory = resident_history.filter((h) => h.is_current_year);

  // map of residents to postings per block
  const residentPostings: { [key: string]: { [key: number]: string } } = {};
  residents.forEach((resident) => {
    residentPostings[resident.mcr] = {};
  });

  // fill in postings for each resident and block
  currentYearHistory.forEach((history) => {
    if (residentPostings[history.mcr]) {
      residentPostings[history.mcr][history.block] = history.posting_code;
    }
  });

  // get all unique resident years
  const years = Array.from(new Set(residents.map((r) => r.resident_year))).sort(
    (a, b) => a - b
  );

  return (
    <Card className="bg-gray-50">
      <CardHeader>
        <CardTitle>Planning Overview</CardTitle>
        <CardDescription>
          Pin residents to save their assignments.
        </CardDescription>
        <CardAction>
          <Badge variant="secondary" className="text-sm">
            AY2025/2026
          </Badge>
        </CardAction>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Pin By Year (toggle) */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            {years.map((yr) => {
              const list = residents.filter((r) => r.resident_year === yr);
              const allPinned =
                list.length > 0 && list.every((r) => pinnedMcrs?.has(r.mcr));
              return (
                <div key={yr} className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant={allPinned ? "secondary" : "outline"}
                    onClick={() =>
                      allPinned ? onUnpinAllYear?.(yr) : onPinAllYear?.(yr)
                    }
                  >
                    {allPinned ? "Unpin All" : "Pin All"} Year {yr}
                  </Button>
                </div>
              );
            })}
          </div>
          <div className="flex gap-2 items-center">
            <span className="text-sm text-gray-600">
              Selected: {pinnedMcrs?.size}
            </span>
            <Button
              variant="ghost"
              className="cursor-pointer"
              onClick={() => setPinnedMcrs(new Set())}
            >
              Clear All Pins
            </Button>
          </div>
        </div>

        {/* Table Overview */}
        <div className="bg-white rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pin</TableHead>
                <TableHead>MCR</TableHead>
                <TableHead>Resident</TableHead>
                <TableHead>RY</TableHead>
                <TableHead className="text-center">
                  Optimisation Score
                </TableHead>
                {monthLabels.map((month) => (
                  <TableHead key={month} className="text-center">
                    {month}
                  </TableHead>
                ))}
                <TableHead className="text-center">Done CCR?</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {residents.map((resident, index) => (
                <TableRow
                  key={resident.mcr}
                  className={cn(
                    index % 2 === 0 ? "bg-white" : "bg-gray-50",
                    "has-[[aria-checked=true]]:bg-blue-100"
                  )}
                >
                  <TableCell>
                    <Checkbox
                      checked={pinnedMcrs?.has(resident.mcr) ?? false}
                      onCheckedChange={() => onTogglePin?.(resident.mcr)}
                      aria-label={`Pin ${resident.name}`}
                      className="data-[state=checked]:bg-blue-600"
                    />
                  </TableCell>
                  <TableCell>{resident.mcr}</TableCell>
                  <TableCell className="font-medium">{resident.name}</TableCell>
                  <TableCell>{resident.resident_year}</TableCell>
                  <TableCell className="text-center">
                    {optimisationScores[index]}
                  </TableCell>
                  {monthLabels.map((month, index) => (
                    <TableCell key={month} className="text-center">
                      {residentPostings[resident.mcr][index + 1] || "-"}
                    </TableCell>
                  ))}
                  <TableCell className="text-center">
                    {resident.ccr_status.posting_code ?? "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};

export default PlanningOverviewTable;
