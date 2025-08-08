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
  groupedResidents: Record<number, Resident[]>;
  selectedResidentMcr: string | null;
  setSelectedResidentMcr: (mcr: string) => void;
}

const ResidentDropdown: React.FC<Props> = ({
  groupedResidents,
  selectedResidentMcr,
  setSelectedResidentMcr,
}) => {
  // memoize sorted years for consistent rendering
  const years = useMemo(
    () =>
      Object.keys(groupedResidents)
        .map(Number)
        .sort((a, b) => a - b),
    [groupedResidents]
  );

  return (
    <div className="mb-4 w-full max-w-md">
      <Select
        value={selectedResidentMcr || ""}
        onValueChange={setSelectedResidentMcr}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select Resident to View Timetable"></SelectValue>
        </SelectTrigger>
        <SelectContent>
          {years.map((year) => {
            const list = groupedResidents[year] ?? [];
            return (
              <SelectGroup key={year}>
                <SelectLabel>{`Year ${year}`}</SelectLabel>
                {list.map((resident) => (
                  <SelectItem key={resident.mcr} value={resident.mcr}>
                    {resident.name}{" "}
                    <span className="text-muted-foreground">
                      ({resident.mcr})
                    </span>
                  </SelectItem>
                ))}
              </SelectGroup>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
};

export default ResidentDropdown;
