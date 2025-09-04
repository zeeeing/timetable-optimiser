import React, { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import type { Posting, ResidentHistory } from "../types";
import { cn } from "@/lib/utils";
import { CCR_POSTINGS } from "@/lib/constants";

import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { TableCell } from "./ui/table";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { ChevronsUpDownIcon, CheckIcon, TrashIcon } from "lucide-react";

interface SortableBlockCellProps {
  blockNumber: number;
  postingAssignment?: ResidentHistory;
  edited: boolean;
  postingMap: Record<string, Posting>;
  onSelectPosting?: (code: string) => void;
}

const SortableBlockCell: React.FC<SortableBlockCellProps> = ({
  blockNumber,
  postingAssignment,
  edited,
  postingMap,
  onSelectPosting,
}) => {
  const [open, setOpen] = useState<boolean>(false);

  const posting = postingAssignment
    ? postingMap[postingAssignment.posting_code]
    : null;

  const code = posting?.posting_code;
  const isLeave = postingAssignment?.is_leave;
  const leaveType = postingAssignment?.leave_type;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({
    id: blockNumber.toString(),
    animateLayoutChanges: () => false,
  });

  const style: React.CSSProperties = {
    transform: transform ? CSS.Transform.toString(transform) : undefined,
    transition,
  };

  const badgeClass =
    posting?.posting_code && CCR_POSTINGS.includes(posting.posting_code)
      ? "bg-purple-100 text-purple-800"
      : posting?.posting_type === "core"
      ? "bg-orange-100 text-orange-800"
      : "bg-green-100 text-green-800";

  const selected = postingAssignment?.posting_code ?? "";

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
        className={cn("space-y-1 cursor-grab", isDragging && "cursor-grabbing")}
      >
        {postingAssignment ? (
          <>
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <div className="flex items-center justify-center">
                  <p className="font-medium text-sm text-blue-800">
                    {code ?? "-"}
                  </p>
                  <ChevronsUpDownIcon
                    color="blue"
                    className="ml-2 h-4 w-4 shrink-0 opacity-50"
                  />
                </div>
              </PopoverTrigger>
              <PopoverContent className="w-[260px] p-0">
                <Command>
                  <div className="flex justify-between items-center pr-2">
                    <CommandInput placeholder="Search by code or name..." />
                    <Button
                      type="button"
                      size="icon"
                      variant="destructive"
                      onClick={() => {
                        onSelectPosting?.("");
                        setOpen(false);
                      }}
                      className="size-6 cursor-pointer"
                    >
                      <TrashIcon />
                    </Button>
                  </div>
                  <CommandList>
                    <CommandEmpty>No posting found.</CommandEmpty>
                    {(() => {
                      // group postings by type (and CCR)
                      const postings = Object.values(postingMap);
                      const ccr = postings.filter((p) =>
                        CCR_POSTINGS.includes(p.posting_code)
                      );
                      const core = postings.filter(
                        (p) =>
                          !CCR_POSTINGS.includes(p.posting_code) &&
                          p.posting_type === "core"
                      );
                      const elective = postings.filter(
                        (p) =>
                          !CCR_POSTINGS.includes(p.posting_code) &&
                          p.posting_type === "elective"
                      );
                      const others = postings.filter(
                        (p) =>
                          !CCR_POSTINGS.includes(p.posting_code) &&
                          p.posting_type !== "core" &&
                          p.posting_type !== "elective"
                      );

                      // define callback function to render each posting item
                      const renderItem = (p: Posting) => (
                        <CommandItem
                          key={p.posting_code}
                          // include name in value to allow searching by name as well
                          value={`${p.posting_code} ${p.posting_name}`}
                          onSelect={(_) => {
                            onSelectPosting?.(p.posting_code); // optional chaining for function call
                            setOpen(false);
                          }}
                        >
                          <CheckIcon
                            className={cn(
                              "mr-2 h-4 w-4",
                              selected === p.posting_code
                                ? "opacity-100"
                                : "opacity-0"
                            )}
                          />
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {p.posting_code}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {p.posting_name}
                            </span>
                          </div>
                        </CommandItem>
                      );

                      return (
                        <>
                          {ccr.length > 0 && (
                            <CommandGroup heading="CCR">
                              {ccr.map(renderItem)}
                            </CommandGroup>
                          )}
                          {core.length > 0 && (
                            <CommandGroup heading="Core">
                              {core.map(renderItem)}
                            </CommandGroup>
                          )}
                          {elective.length > 0 && (
                            <CommandGroup heading="Elective">
                              {elective.map(renderItem)}
                            </CommandGroup>
                          )}
                          {others.length > 0 && (
                            <CommandGroup heading="Others">
                              {others.map(renderItem)}
                            </CommandGroup>
                          )}
                        </>
                      );
                    })()}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <div className="flex items-center gap-1 justify-center">
              {posting && (
                <Badge className={badgeClass} variant="outline">
                  {posting?.posting_code &&
                  CCR_POSTINGS.includes(posting.posting_code)
                    ? "CCR"
                    : posting?.posting_type.toUpperCase() || ""}
                </Badge>
              )}
              {isLeave && (
                <Badge
                  variant="secondary"
                  className="bg-gray-200 text-gray-700"
                >
                  {leaveType}
                </Badge>
              )}
            </div>
          </>
        ) : (
          <span className="text-gray-400 text-sm">-</span>
        )}
      </div>
    </TableCell>
  );
};

export default SortableBlockCell;
