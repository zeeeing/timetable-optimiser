import React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "./ui/card";

type ScoreEntry = {
  residentName: string;
  score: number;
};

type Props = {
  scores: ScoreEntry[];
};

const OptimisationScoreTable: React.FC<Props> = ({ scores }) => {
  // Sort scores in descending order
  const sortedScores = [...scores].sort((a, b) => b.score - a.score);

  return (
    <Card>
      <CardContent className="max-h-[350px] overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Resident</TableHead>
              <TableHead className="text-center">Optimisation Score</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedScores.map((entry, index) => (
              <TableRow key={`${entry.residentName}-${index}`}>
                <TableCell>{entry.residentName}</TableCell>
                <TableCell className="text-center">{entry.score}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

export default OptimisationScoreTable;
