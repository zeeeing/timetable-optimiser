import React, { useMemo } from "react";
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

interface Props {
  residents: Resident[] | null;
  selectedResidentMcr: string | null;
  setSelectedResidentMcr: (mcr: string) => void;
}

const ResidentDropdown: React.FC<Props> = ({
  residents,
  selectedResidentMcr,
  setSelectedResidentMcr,
}) => {
  // get selected resident data
  const selectedResident = residents?.find(
    (r) => r.mcr === selectedResidentMcr
  );

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

  return (
    <div className="mb-4 w-full max-w-md">
      <Select
        value={selectedResidentMcr || ""}
        onValueChange={setSelectedResidentMcr}
      >
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
