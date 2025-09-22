import React, { useMemo, useState } from "react";
import monthLabels from "../../../shared/monthLabels.json";
import { Input } from "./ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import type { Posting, ApiResponse, OffBlockExplanation } from "@/types";

interface Props {
  apiResponse: ApiResponse;
  residentMcr: string;
  postingMap: Record<string, Posting>;
}

const UnfilledMonthsDiagnostics: React.FC<Props> = ({
  apiResponse,
  residentMcr,
  postingMap,
}) => {
  const [diagFilter, setDiagFilter] = useState("");

  const diag = useMemo<OffBlockExplanation[]>(() => {
    const map = apiResponse?.diagnostics?.off_explanations_by_resident || {};
    return (map[residentMcr] ?? []) as OffBlockExplanation[];
  }, [apiResponse, residentMcr]);

  if (!Array.isArray(diag) || diag.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="font-semibold">Unfilled Months Diagnostics</div>
      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-600">Filter postings:</label>
        <Input
          value={diagFilter}
          onChange={(e) => setDiagFilter(e.target.value)}
          placeholder="e.g. Derm or Gastro"
          className="max-w-xs"
        />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-center">Month</TableHead>
            <TableHead className="text-center">Feasible Postings</TableHead>
            <TableHead className="text-center">Common Blocks</TableHead>
            {diagFilter && (
              <TableHead className="text-center">Filter Matches</TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {diag.map((entry) => {
            const b = Number(entry.month_block ?? entry.block);
            const feasibleCount = (entry.feasible_postings || []).length;
            const reasonsBy = entry.reasons_by_posting || {};

            // aggregate reason counts across postings
            const counts: Record<string, number> = {} as any;
            Object.values(reasonsBy).forEach((lst: any) => {
              (Array.isArray(lst) ? lst : []).forEach((r: any) => {
                counts[r] = (counts[r] || 0) + 1;
              });
            });
            const top = Object.entries(counts)
              .sort((a, b) => Number(b[1]) - Number(a[1]))
              .slice(0, 3)
              .map(([k, v]) => `${k} (${v})`);

            const matches = diagFilter
              ? Object.entries(reasonsBy)
                  .filter(([code]) =>
                    code.toLowerCase().includes(diagFilter.toLowerCase())
                  )
                  .slice(0, 5)
                  .map(([code, reasons]: any) => {
                    const name = postingMap[code]?.posting_name || code;
                    const rlist = (Array.isArray(reasons) ? reasons : []).join(
                      ", "
                    );
                    return `${name}: ${rlist || "no obvious block"}`;
                  })
              : [];

            return (
              <TableRow key={`off-${residentMcr}-${b}`}>
                <TableCell className="text-center">
                  {monthLabels[b - 1]}
                </TableCell>
                <TableCell className="text-center">{feasibleCount}</TableCell>
                <TableCell className="text-center text-xs text-gray-700">
                  {top.length > 0 ? top.join(", ") : "-"}
                </TableCell>
                {diagFilter && (
                  <TableCell className="text-xs text-gray-700">
                    {matches.length > 0
                      ? matches.join(" \u2022 ")
                      : "No matches"}
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};

export default UnfilledMonthsDiagnostics;
