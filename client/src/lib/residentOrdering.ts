import type { Resident } from "@/types";

export const groupResidentsByYear = (
  residents: Resident[]
): Record<number, Resident[]> => {
  return residents.reduce((acc, resident) => {
    const year = resident.resident_year;
    if (!acc[year]) {
      acc[year] = [];
    }
    acc[year].push(resident);
    return acc;
  }, {} as Record<number, Resident[]>);
};
