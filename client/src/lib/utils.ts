import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { ResidentHistory } from "@/types";
import { arrayMove } from "@dnd-kit/sortable";

type BlockMap = Record<number, ResidentHistory>;

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// compares only posting code across the 12 blocks
export function areSchedulesEqual(
  a: Record<number, ResidentHistory>,
  b: Record<number, ResidentHistory>
): boolean {
  for (let i = 1; i <= 12; i++) {
    const pa = a[i]?.posting_code ?? "";
    const pb = b[i]?.posting_code ?? "";
    if (pa !== pb) return false;
  }
  return true;
}

// apply insertion-style move then rebuild BlockMap
export function moveByInsert(
  prev: BlockMap,
  from: number,
  to: number
): BlockMap {
  // build 12-length slots array in block order
  const slots: (ResidentHistory | undefined)[] = Array.from(
    { length: 12 },
    (_, i) => prev[i + 1]
  );

  // if source is empty, move nothing
  if (!slots[from - 1]) return prev;

  // Move the item and shift others
  const nextSlots = arrayMove(slots, from - 1, to - 1);

  // rebuild BlockMap with corrected month_block indices
  const next: BlockMap = {};
  nextSlots.forEach((a, idx) => {
    if (a) next[idx + 1] = { ...a, month_block: idx + 1 };
  });
  return next;
}
