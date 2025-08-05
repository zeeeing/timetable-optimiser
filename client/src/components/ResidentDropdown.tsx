import React, { useMemo, useEffect } from "react";
import type { Resident } from "../types";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectLabel,
  SelectItem,
} from "./ui/select";

const ResidentDropdown: React.FC<{
  residents: Resident[] | null;
  selectedResidentMcr: string;
  onChange: (mcr: string) => void;
}> = ({ residents, selectedResidentMcr, onChange }) => {
  // memoize grouped residents by year
  const grouped = useMemo(() => {
    if (!residents) return {};
    return residents.reduce((acc, resident) => {
      const year = resident.resident_year;
      if (!acc[year]) acc[year] = [];
      acc[year].push(resident);
      return acc;
    }, {} as Record<number, Resident[]>);
  }, [residents]);

  useEffect(() => {
    if (residents?.length && !selectedResidentMcr) {
      onChange(residents[0].mcr);
    }
  }, [residents, selectedResidentMcr, onChange]);

  const selectedResident = residents?.find(
    (r) => r.mcr === selectedResidentMcr
  );

  return (
    <div className="mb-4 w-full max-w-md">
      <Select value={selectedResidentMcr || ""} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select Resident to View Timetable">
            {selectedResident
              ? `${selectedResident.name} (${selectedResident.mcr})`
              : null}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {Object.keys(grouped)
            .sort((a, b) => Number(a) - Number(b))
            .map((year) => (
              <SelectGroup key={year}>
                <SelectLabel>{`Year ${year}`}</SelectLabel>
                {grouped[Number(year)].map((resident) => (
                  <SelectItem key={resident.mcr} value={resident.mcr}>
                    {resident.name} ({resident.mcr})
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export default ResidentDropdown;
