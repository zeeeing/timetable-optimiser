import React from "react";
import type { Resident } from "../types";

interface ResidentDropdownProps {
  residents: Resident[] | null;
  value: string;
  onChange: (mcr: string) => void;
}

const ResidentDropdown: React.FC<ResidentDropdownProps> = ({
  residents,
  value,
  onChange,
}) => (
  <div className="mb-4">
    <label className="block text-sm font-medium text-gray-700 mb-2">
      Select Resident to View Timetable:
    </label>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-md shadow-xs focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
    >
      {residents?.map((resident) => (
        <option key={resident.mcr} value={resident.mcr}>
          {resident.resident_name} (Year {resident.resident_year})
        </option>
      ))}
    </select>
  </div>
);

export default ResidentDropdown;
