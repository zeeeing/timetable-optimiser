import type { CsvRow } from "../types";

export function generateSampleCSV(): void {
  const residents: CsvRow[] = [
    { mcr: "R001", name: "Dr. Alice Johnson", resident_year: 2 },
    { mcr: "R002", name: "Dr. Bob Smith", resident_year: 1 },
  ];

  const residentHistory: CsvRow[] = [
    { mcr: "R001", year: 1, block: 1, posting_code: "GM" },
    { mcr: "R001", year: 1, block: 2, posting_code: "GM" },
    { mcr: "R001", year: 1, block: 3, posting_code: "GM" },
    { mcr: "R001", year: 1, block: 4, posting_code: "ED" },
    { mcr: "R001", year: 1, block: 5, posting_code: "CVM" },
    { mcr: "R001", year: 1, block: 6, posting_code: "CVM" },
    { mcr: "R001", year: 1, block: 7, posting_code: "CVM" },
    { mcr: "R001", year: 1, block: 8, posting_code: "GASTRO" },
    { mcr: "R001", year: 1, block: 9, posting_code: "GASTRO" },
    { mcr: "R001", year: 1, block: 10, posting_code: "GASTRO" },
    { mcr: "R001", year: 1, block: 11, posting_code: "NEPHRO" },
    { mcr: "R001", year: 1, block: 12, posting_code: "NEPHRO" },
  ];

  const residentPreferences: CsvRow[] = [
    { mcr: "R001", preference_rank: 1, posting_code: "GASTRO" },
    { mcr: "R001", preference_rank: 2, posting_code: "ONCO" },
    { mcr: "R001", preference_rank: 3, posting_code: "RADIO" },
    { mcr: "R001", preference_rank: 4, posting_code: "PSYCH" },
    { mcr: "R001", preference_rank: 5, posting_code: "DERM" },
    { mcr: "R002", preference_rank: 1, posting_code: "GM" },
    { mcr: "R002", preference_rank: 2, posting_code: "ED" },
    { mcr: "R002", preference_rank: 3, posting_code: "CVM" },
    { mcr: "R002", preference_rank: 4, posting_code: "NEPHRO" },
    { mcr: "R002", preference_rank: 5, posting_code: "ONCO" },
  ];

  const postings: CsvRow[] = [
    { posting_code: "GM", posting_name: "General Medicine", posting_type: "core", max_residents: 4, required_block_duration: 3 },
    { posting_code: "ED", posting_name: "Emergency Department", posting_type: "core", max_residents: 6, required_block_duration: 1 },
    { posting_code: "CVM", posting_name: "Cardiovascular Medicine", posting_type: "core", max_residents: 3, required_block_duration: 3 },
    { posting_code: "MICU", posting_name: "Medical ICU", posting_type: "core", max_residents: 3, required_block_duration: 3 },
    { posting_code: "GASTRO", posting_name: "Gastroenterology", posting_type: "elective", max_residents: 2, required_block_duration: 3 },
    { posting_code: "NEPHRO", posting_name: "Nephrology", posting_type: "elective", max_residents: 2, required_block_duration: 2 },
    { posting_code: "ONCO", posting_name: "Oncology", posting_type: "elective", max_residents: 2, required_block_duration: 3 },
    { posting_code: "RADIO", posting_name: "Radiology", posting_type: "elective", max_residents: 3, required_block_duration: 2 },
    { posting_code: "PSYCH", posting_name: "Psychiatry", posting_type: "elective", max_residents: 2, required_block_duration: 2 },
    { posting_code: "DERM", posting_name: "Dermatology", posting_type: "elective", max_residents: 1, required_block_duration: 1 },
  ];

  // convert object arrays to CSV string
  const toCsv = (data: CsvRow[]): string => {
    if (data.length === 0) return "";
    const headers = Object.keys(data[0]);
    const rows = data.map(row =>
      headers.map(header => String(row[header] ?? "")).join(",")
    );
    return [headers.join(","), ...rows].join("\n");
  };

  const files = [
    { filename: "sample_residents.csv", content: toCsv(residents) },
    { filename: "sample_resident_history.csv", content: toCsv(residentHistory) },
    { filename: "sample_resident_preferences.csv", content: toCsv(residentPreferences) },
    { filename: "sample_postings.csv", content: toCsv(postings) },
  ];

  // trigger downloads
  files.forEach(({ filename, content }) => {
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });
}
