import React from "react";
import type { PostingUtil } from "../types";
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
  CardHeader,
  CardContent,
  CardTitle,
  CardDescription,
} from "./ui/card";

const PostingStatistics: React.FC<{
  postingUtil: PostingUtil[];
}> = ({ postingUtil }) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Posting Utilisation</CardTitle>
        <CardDescription>
          Number of Postings: {postingUtil.length}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-left">Posting Code</TableHead>
              <TableHead className="text-left">Filled</TableHead>
              <TableHead className="text-left">Capacity / Month</TableHead>
              <TableHead className="text-left">In Top 3 Demand</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {postingUtil
              .sort((a, b) => a.posting_code.localeCompare(b.posting_code))
              .map((util, idx) => (
                <TableRow
                  key={util.posting_code}
                  className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}
                >
                  <TableCell className="px-3 py-2 text-sm">
                    {util.posting_code}
                  </TableCell>
                  <TableCell className="px-3 py-2 text-sm">
                    {util.filled}
                  </TableCell>
                  <TableCell className="px-3 py-2 text-sm">
                    {util.capacity}
                  </TableCell>
                  <TableCell className="px-3 py-2 text-sm">
                    {util.demand_top3}
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

export default PostingStatistics;
