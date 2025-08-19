import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import type { Posting, ResidentHistory } from "../types";
import { cn } from "@/lib/utils";

import { Badge } from "./ui/badge";
import { TableCell } from "./ui/table";

interface SortableBlockCellProps {
  blockNumber: number;
  postingAssignment?: ResidentHistory;
  edited: boolean;
  postingMap: Record<string, Posting>;
  ccrPostingCode: string;
}

const SortableBlockCell: React.FC<SortableBlockCellProps> = ({
  blockNumber,
  postingAssignment,
  edited,
  postingMap,
  ccrPostingCode,
}) => {
  const posting: Posting | null = postingAssignment
    ? postingMap[postingAssignment.posting_code]
    : null;

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
    posting?.posting_code === ccrPostingCode
      ? "bg-purple-100 text-purple-800"
      : posting?.posting_type === "core"
      ? "bg-orange-100 text-orange-800"
      : "bg-green-100 text-green-800";

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
            <div className="font-medium text-sm text-blue-800">
              {postingAssignment.posting_code}
            </div>
            <Badge className={badgeClass} variant="outline">
              {posting?.posting_code === ccrPostingCode
                ? "CCR"
                : posting?.posting_type.toUpperCase() || ""}
            </Badge>
          </>
        ) : (
          <span className="text-gray-400 text-sm">-</span>
        )}
      </div>
    </TableCell>
  );
};

export default SortableBlockCell;
