import React from "react";

interface BlockAssignment {
  posting: string | null;
  type: string | null;
}

interface Resident {
  id: string;
  name: string;
  year: number;
  block_assignments: BlockAssignment[];
  core_count: number;
  elective_count: number;
}

const monthLabels = [
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
];

const ResidentTimetable: React.FC<{ resident: Resident }> = ({ resident }) => (
  <div className="bg-gray-50 rounded-lg p-6 mb-6">
    <h3 className="text-lg font-semibold mb-4 text-gray-800">
      Timetable for {resident.name}
    </h3>
    <div className="mb-4">
      <span className="font-medium">Core Postings Completed:</span>{" "}
      {resident.core_count}
      <span className="ml-6 font-medium">
        Elective Postings Completed:
      </span>{" "}
      {resident.elective_count}
    </div>
    <div className="overflow-x-auto">
      <table className="min-w-full border border-gray-300 text-sm mb-4">
        <thead className="bg-gray-100">
          <tr>
            {monthLabels.map((label, i) => (
              <th key={i} className="border px-2 py-1 text-center">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {resident.block_assignments.map((block, i) => (
              <td
                key={i}
                className={`border px-2 py-1 text-center ${
                  block.type === "core"
                    ? "bg-blue-100"
                    : block.type === "elective"
                    ? "bg-yellow-100"
                    : "bg-gray-100"
                }`}
                title={block.posting || "Unassigned"}
              >
                {block.posting ? (
                  <>
                    <span className="font-semibold">{block.posting}</span>
                    <br />
                    <span className="text-xs">{block.type}</span>
                  </>
                ) : (
                  <span className="text-xs text-gray-400">-</span>
                )}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  </div>
);

export default ResidentTimetable;
