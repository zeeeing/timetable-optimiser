import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { arrayMove } from "@dnd-kit/sortable";
import type { ResidentHistory } from "@/types";

type BlockMap = Record<number, ResidentHistory>;

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const ACADEMIC_YEAR_PATTERN = /^(\d{4})\s*\/\s*(\d{4})$/;

export interface AcademicYearRange {
  start: number;
  end: number;
}

export function parseAcademicYearInput(
  input: string
): AcademicYearRange | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const match = trimmed.match(ACADEMIC_YEAR_PATTERN);
  if (!match) return null;

  // match returns an array where the first element is the full match
  // and subsequent elements are the captured groups
  if (match.length < 3) return null;
  const start = Number.parseInt(match[1], 10);
  const end = Number.parseInt(match[2], 10);

  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;

  return { start, end };
}

export function formatAcademicYearLabel(
  targetYear: number,
  currentResidentYear: number,
  anchor: AcademicYearRange | null
): string {
  if (!Number.isFinite(targetYear)) {
    return "Year";
  }

  if (!anchor || !Number.isFinite(currentResidentYear)) {
    return targetYear === currentResidentYear
      ? "Current Year"
      : `Year ${targetYear}`;
  }

  const offset = currentResidentYear - targetYear;
  const start = anchor.start - offset;
  const end = anchor.end - offset;

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return targetYear === currentResidentYear
      ? "Current Year"
      : `Year ${targetYear}`;
  }

  return `${start}/${end}`;
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

  // derive the starting career block so we can reindex sequentially
  const baseCandidates = Object.values(prev)
    .map((entry) => {
      if (!entry) return undefined;
      if (!Number.isFinite(entry.career_block)) return undefined;
      if (!Number.isFinite(entry.month_block)) return undefined;
      return entry.career_block - (entry.month_block - 1);
    })
    .filter((value): value is number => Number.isFinite(value));

  const inferredBaseCareerBlock =
    baseCandidates.length > 0 ? Math.min(...baseCandidates) : undefined;

  // rebuild BlockMap with corrected month_block and career_block indices
  const next: BlockMap = {};
  nextSlots.forEach((a, idx) => {
    if (!a) return;
    const monthIndex = idx + 1;
    const currentCareer = Number.isFinite(a.career_block)
      ? (a.career_block as number)
      : undefined;
    const careerBlock =
      inferredBaseCareerBlock !== undefined
        ? inferredBaseCareerBlock + idx
        : currentCareer !== undefined
        ? currentCareer
        : monthIndex;

    next[monthIndex] = {
      ...a,
      month_block: monthIndex,
      career_block: careerBlock,
    };
  });
  return next;
}
