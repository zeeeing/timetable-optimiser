import React, { useMemo, useState } from "react";
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
import { Input } from "./ui/input";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "./ui/select";
import {
  useReactTable,
  type ColumnDef,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type SortingState,
  getPaginationRowModel,
  flexRender,
} from "@tanstack/react-table";
import monthLabels from "../../../shared/monthLabels.json";
import { cn } from "@/lib/utils";
import {
  ChevronsUpDownIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "lucide-react";

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
  const { residents, resident_history, statistics, postings } = apiResponse;
  const optimisationScores = statistics.cohort.optimisation_scores;

  // filter by current year history (memoized)
  const currentYearHistory = useMemo(
    () => resident_history.filter((h) => h.is_current_year),
    [resident_history]
  );

  // map of residents to postings per block (memoized)
  const residentPostings: { [key: string]: { [key: number]: string } } =
    useMemo(() => {
      const map: { [key: string]: { [key: number]: string } } = {};
      residents.forEach((resident) => {
        map[resident.mcr] = {};
      });

      currentYearHistory.forEach((history) => {
        if (map[history.mcr]) {
          const code = history.posting_code;
          const isLeave = history.is_leave;
          const leaveType = history.leave_type;

          const display = isLeave
            ? leaveType && code
              ? `${leaveType} (${code})`
              : leaveType
            : code;
          map[history.mcr][history.block] = display as string;
        }
      });

      return map;
    }, [residents, currentYearHistory]);

  // get all unique resident years (memoized)
  const years = useMemo(
    () =>
      Array.from(new Set(residents.map((r) => r.resident_year))).sort(
        (a, b) => a - b
      ),
    [residents]
  );

  // map score by mcr to keep correct score after sorting/filtering
  const scoreByMcr = useMemo(() => {
    const m = new Map<string, number>();
    residents.forEach((r, idx) => m.set(r.mcr, optimisationScores[idx] ?? 0));
    return m;
  }, [residents, optimisationScores]);

  // posting codes list for filter UI
  const postingCodes = useMemo(
    () =>
      Array.from(new Set((postings ?? []).map((p) => p.posting_code))).sort(),
    [postings]
  );

  // raw posting code by resident/block (memoized) — use for matching/highlighting
  const postingCodeByMcrBlock = useMemo(() => {
    const map: Record<string, Record<number, string | undefined>> = {};
    residents.forEach((r) => (map[r.mcr] = {}));
    currentYearHistory.forEach((h) => {
      if (map[h.mcr]) {
        map[h.mcr][h.block] = h.posting_code;
      }
    });
    return map;
  }, [residents, currentYearHistory]);

  // set of posting codes per resident for current year (excluding leave)
  const codeSetByMcr = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    residents.forEach((r) => (map[r.mcr] = new Set<string>()));
    currentYearHistory.forEach((h) => {
      if (!h.is_leave && h.posting_code && map[h.mcr]) {
        map[h.mcr].add(h.posting_code);
      }
    });
    return map;
  }, [residents, currentYearHistory]);

  // table state
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [postingFilter, setPostingFilter] = useState<string>("all");

  const filteredResidents = useMemo(() => {
    if (!postingFilter || postingFilter === "all") return residents;
    return residents.filter((r) => codeSetByMcr[r.mcr]?.has(postingFilter));
  }, [residents, codeSetByMcr, postingFilter]);

  // columns
  const columns = useMemo<ColumnDef<(typeof residents)[number]>[]>(() => {
    return [
      {
        id: "pin",
        header: () => "Pin",
        cell: ({ row }) => (
          <Checkbox
            checked={pinnedMcrs?.has(row.original.mcr) ?? false}
            onCheckedChange={() => onTogglePin?.(row.original.mcr)}
            aria-label={`Pin ${row.original.name}`}
            className="data-[state=checked]:bg-blue-600"
          />
        ),
        enableSorting: false,
        enableGlobalFilter: false,
      },
      {
        accessorKey: "mcr",
        header: ({ column }) => (
          <button
            className="inline-flex items-center gap-1"
            onClick={column.getToggleSortingHandler()}
            aria-label="Sort by MCR"
          >
            MCR
            {!column.getIsSorted() && <ChevronsUpDownIcon size="13" />}
            {column.getIsSorted() === "asc" && <ChevronUpIcon size="13" />}
            {column.getIsSorted() === "desc" && <ChevronDownIcon size="13" />}
          </button>
        ),
      },
      {
        accessorKey: "name",
        header: ({ column }) => (
          <button
            className="inline-flex items-center gap-1"
            onClick={column.getToggleSortingHandler()}
            aria-label="Sort by Resident Name"
          >
            Resident
            {!column.getIsSorted() && <ChevronsUpDownIcon size="13" />}
            {column.getIsSorted() === "asc" && <ChevronUpIcon size="13" />}
            {column.getIsSorted() === "desc" && <ChevronDownIcon size="13" />}
          </button>
        ),
      },
      {
        accessorKey: "resident_year",
        header: ({ column }) => (
          <button
            className="inline-flex items-center gap-1"
            onClick={column.getToggleSortingHandler()}
            aria-label="Sort by Year"
          >
            RY
            {!column.getIsSorted() && <ChevronsUpDownIcon size="13" />}
            {column.getIsSorted() === "asc" && <ChevronUpIcon size="13" />}
            {column.getIsSorted() === "desc" && <ChevronDownIcon size="13" />}
          </button>
        ),
      },
      {
        id: "score",
        accessorFn: (row) => scoreByMcr.get(row.mcr) ?? 0,
        header: ({ column }) => (
          <button
            className="inline-flex items-center gap-1"
            onClick={column.getToggleSortingHandler()}
            aria-label="Sort by Optimisation Score"
          >
            Opt. Score
            {!column.getIsSorted() && <ChevronsUpDownIcon size="13" />}
            {column.getIsSorted() === "asc" && <ChevronUpIcon size="13" />}
            {column.getIsSorted() === "desc" && <ChevronDownIcon size="13" />}
          </button>
        ),
        cell: ({ getValue }) => (
          <div className="text-center">{getValue<number>()}</div>
        ),
      },
      // month columns
      ...monthLabels.map((label, i) => ({
        id: `month-${i + 1}`,
        header: () => <div className="text-center">{label}</div>,
        cell: ({ row }: any) => (
          <div className="text-center">
            {residentPostings[row.original.mcr]?.[i + 1] || "-"}
          </div>
        ),
        enableSorting: false,
        enableGlobalFilter: false,
      })),
      {
        id: "ccr",
        header: () => <div className="text-center">Done CCR?</div>,
        cell: ({ row }) => (
          <div className="text-center">
            {row.original.ccr_status.posting_code ?? "-"}
          </div>
        ),
        enableSorting: false,
        enableGlobalFilter: false,
      },
    ];
  }, [pinnedMcrs, onTogglePin, residentPostings, scoreByMcr]);

  // table properties
  const table = useReactTable({
    data: filteredResidents,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

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
        <div className="flex justify-between items-center gap-4 flex-wrap">
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
            <Select
              value={postingFilter}
              onValueChange={(v) => setPostingFilter(v)}
            >
              <SelectTrigger size="sm">
                <SelectValue placeholder="Filter by posting" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Postings</SelectItem>
                {postingCodes.map((code) => (
                  <SelectItem key={code} value={code}>
                    {code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Search by MCR, name, or year"
              value={globalFilter}
              onChange={(e) => table.setGlobalFilter(e.target.value)}
              className="h-8 w-64"
            />
          </div>
        </div>

        <div className="bg-white rounded-md border">
          <Table>
            {/* table headers */}
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id}>
                  {hg.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      className={
                        header.column.id === "score" ? "text-center" : undefined
                      }
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>

            {/* table cells */}
            <TableBody>
              {table.getRowModel().rows.map((row, idx) => (
                <TableRow
                  key={row.id}
                  className={cn(
                    idx % 2 === 0 ? "bg-white" : "bg-gray-50",
                    "has-[[aria-checked=true]]:bg-blue-100"
                  )}
                >
                  {row.getVisibleCells().map((cell) => {
                    const colId = cell.column.id as string;
                    let cellClass: string | undefined;
                    if (colId?.startsWith("month-")) {
                      const monthIndex = Number(colId.split("-")[1]); // 1-based
                      const rawCode =
                        postingCodeByMcrBlock[(row as any).original.mcr]?.[
                          monthIndex
                        ];
                      const isPostingMatch =
                        postingFilter !== "all" && rawCode === postingFilter;
                      cellClass = cn(isPostingMatch && "bg-red-200");
                    }
                    return (
                      <TableCell key={cell.id} className={cellClass}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* pagination controls */}
          <div className="flex items-center justify-between p-2">
            <div className="flex items-center gap-2">
              <span className="text-sm">Rows per page</span>
              <Select
                value={String(table.getState().pagination.pageSize)}
                onValueChange={(v) => table.setPageSize(Number(v))}
              >
                <SelectTrigger size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[10, 20, 50, 100].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span>
                Page {table.getState().pagination.pageIndex + 1} of{" "}
                {table.getPageCount()}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default PlanningOverviewTable;
