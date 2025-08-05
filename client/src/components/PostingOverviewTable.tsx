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
} from "./ui/card";
import { Badge } from "./ui/badge";
import type { ApiResponse } from "../types";
import monthLabels from "../../../shared/monthLabels.json";

interface PostingOverviewTableProps {
  apiResponse: ApiResponse;
}

const PostingOverviewTable: React.FC<PostingOverviewTableProps> = ({
  apiResponse,
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

  return (
    <Card className="bg-gray-50">
      <CardHeader>
        <CardTitle>Planning Overview</CardTitle>
        <CardAction>
          <Badge variant="secondary" className="text-sm">
            AY2025/2026
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>MCR</TableHead>
              <TableHead>Resident</TableHead>
              <TableHead>RY</TableHead>
              <TableHead className="text-center">Optimisation Score</TableHead>
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
              <TableRow key={resident.mcr}>
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
                <TableCell>{resident.ccr_status.posting_code ?? "-"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

export default PostingOverviewTable;
