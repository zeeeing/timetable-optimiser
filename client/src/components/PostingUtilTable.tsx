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
  CardAction,
  CardContent,
  CardTitle,
  CardDescription,
} from "./ui/card";
import { monthLabels } from "@/lib/constants";
import { Badge } from "./ui/badge";

const PostingUtilTable: React.FC<{
  postingUtil: PostingUtil[];
}> = ({ postingUtil }) => {
  // get block utlisation for a specific block
  const getBlockUtilisation = (postingCode: string, blockNumber: number) => {
    const utilPerBlockArr = postingUtil.find(
      (p) => p.posting_code === postingCode
    )?.util_per_block;
    return (
      utilPerBlockArr?.find((b) => b.month_block === blockNumber) ?? {
        month_block: blockNumber,
        filled: 0,
        capacity: 0,
        is_over_capacity: false,
      }
    );
  };

  // get all unique posting codes sorted
  const postingCodesSorted = postingUtil
    .map((p) => p.posting_code)
    .sort((a, b) => a.localeCompare(b));

  return (
    <Card className="bg-gray-50">
      <CardHeader>
        <CardTitle>Posting Utilisation By Department & Month</CardTitle>
        <CardDescription>
          Displaying utilisation across all blocks for{" "}
          {postingCodesSorted.length} postings.
        </CardDescription>
        <CardAction>
          <Badge variant="secondary" className="text-md">
            AY2025/2026
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="bg-white rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Posting Code</TableHead>
                {monthLabels.map((month) => (
                  <TableHead key={month} className="text-center">
                    {month}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {postingCodesSorted.map((postingCode, idx) => {
                return (
                  <TableRow
                    key={postingCode}
                    className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}
                  >
                    <TableCell>{postingCode}</TableCell>
                    {monthLabels.map((_, index) => {
                      const blockNumber = index + 1;
                      const { filled, capacity, is_over_capacity } =
                        getBlockUtilisation(postingCode, blockNumber);

                      return (
                        <TableCell
                          key={`${postingCode}-${blockNumber}`}
                          className={`text-center ${
                            is_over_capacity ? "bg-red-100 text-red-800" : ""
                          }`}
                        >
                          {filled != null ? `${filled} / ${capacity}` : "-"}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};

export default PostingUtilTable;
