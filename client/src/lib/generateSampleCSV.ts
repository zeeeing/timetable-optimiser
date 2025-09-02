import type { CsvRow } from "../types";

export function generateSampleCSV(): void {
  const residents: CsvRow[] = [
    { mcr: "M000001A", name: "Dr. Alice Johnson", resident_year: 3 },
    { mcr: "M000002A", name: "Dr. Bob Smith", resident_year: 2 },
    { mcr: "M000003A", name: "Dr. Carol Lee", resident_year: 1 },
  ];

  const residentHistory: CsvRow[] = [
    { mcr: "M000001A", year: 1, block: 1, posting_code: "GM (TTSH)" },
    { mcr: "M000001A", year: 1, block: 2, posting_code: "GM (TTSH)" },
    { mcr: "M000001A", year: 1, block: 3, posting_code: "GM (TTSH)" },
    { mcr: "M000001A", year: 1, block: 4, posting_code: "RCCM (TTSH)" },
    { mcr: "M000001A", year: 1, block: 5, posting_code: "RCCM (TTSH)" },
    { mcr: "M000001A", year: 1, block: 6, posting_code: "MICU (TTSH)" },
    { mcr: "M000001A", year: 1, block: 7, posting_code: "CVM (TTSH)" },
    { mcr: "M000001A", year: 1, block: 8, posting_code: "CVM (TTSH)" },
    { mcr: "M000001A", year: 1, block: 9, posting_code: "CVM (TTSH)" },
    { mcr: "M000001A", year: 1, block: 10, posting_code: "NL (NNI)" },
    { mcr: "M000001A", year: 1, block: 11, posting_code: "NL (NNI)" },
    { mcr: "M000001A", year: 1, block: 12, posting_code: "NL (NNI)" },
    { mcr: "M000001A", year: 2, block: 1, posting_code: "GM (TTSH)" },
    { mcr: "M000001A", year: 2, block: 2, posting_code: "GM (TTSH)" },
    { mcr: "M000001A", year: 2, block: 3, posting_code: "GM (TTSH)" },
    { mcr: "M000001A", year: 2, block: 4, posting_code: "RCCM (TTSH)" },
    { mcr: "M000001A", year: 2, block: 5, posting_code: "RCCM (TTSH)" },
    { mcr: "M000001A", year: 2, block: 6, posting_code: "MICU (TTSH)" },
    { mcr: "M000001A", year: 2, block: 7, posting_code: "CVM (TTSH)" },
    { mcr: "M000001A", year: 2, block: 8, posting_code: "CVM (TTSH)" },
    { mcr: "M000001A", year: 2, block: 9, posting_code: "CVM (TTSH)" },
    { mcr: "M000001A", year: 2, block: 10, posting_code: "NL (NNI)" },
    { mcr: "M000001A", year: 2, block: 11, posting_code: "NL (NNI)" },
    { mcr: "M000001A", year: 2, block: 12, posting_code: "NL (NNI)" },
    { mcr: "M000002A", year: 1, block: 1, posting_code: "GM (TTSH)" },
    { mcr: "M000002A", year: 1, block: 2, posting_code: "GM (TTSH)" },
    { mcr: "M000002A", year: 1, block: 3, posting_code: "GM (TTSH)" },
    { mcr: "M000002A", year: 1, block: 4, posting_code: "RCCM (TTSH)" },
    { mcr: "M000002A", year: 1, block: 5, posting_code: "RCCM (TTSH)" },
    { mcr: "M000002A", year: 1, block: 6, posting_code: "MICU (TTSH)" },
    { mcr: "M000002A", year: 1, block: 7, posting_code: "CVM (TTSH)" },
    { mcr: "M000002A", year: 1, block: 8, posting_code: "CVM (TTSH)" },
    { mcr: "M000002A", year: 1, block: 9, posting_code: "CVM (TTSH)" },
    { mcr: "M000002A", year: 1, block: 10, posting_code: "NL (NNI)" },
    { mcr: "M000002A", year: 1, block: 11, posting_code: "NL (NNI)" },
    { mcr: "M000002A", year: 1, block: 12, posting_code: "NL (NNI)" },
  ];

  const residentPreferences: CsvRow[] = [
    { mcr: "M000001A", preference_rank: 1, posting_code: "Gastro (TTSH)" },
    { mcr: "M000001A", preference_rank: 2, posting_code: "Endocrine (KTPH)" },
    { mcr: "M000001A", preference_rank: 3, posting_code: "Haemato (TTSH)" },
    { mcr: "M000001A", preference_rank: 4, posting_code: "MedComm (Comm)" },
    { mcr: "M000001A", preference_rank: 5, posting_code: "Renal (TTSH)" },
    { mcr: "M000002A", preference_rank: 1, posting_code: "Gastro (TTSH)" },
    { mcr: "M000002A", preference_rank: 2, posting_code: "Endocrine (TTSH)" },
    { mcr: "M000002A", preference_rank: 3, posting_code: "Haemato (TTSH)" },
    { mcr: "M000002A", preference_rank: 4, posting_code: "MedComm (Comm)" },
    { mcr: "M000002A", preference_rank: 5, posting_code: "Renal (KTPH)" },
    { mcr: "M000003A", preference_rank: 1, posting_code: "Gastro (TTSH)" },
    { mcr: "M000003A", preference_rank: 2, posting_code: "Endocrine (TTSH)" },
    { mcr: "M000003A", preference_rank: 3, posting_code: "Haemato (TTSH)" },
    { mcr: "M000003A", preference_rank: 4, posting_code: "MedComm (Comm)" },
    { mcr: "M000003A", preference_rank: 5, posting_code: "Renal (KTPH)" },
  ];

  // SR base-code preferences (ranks 1..3), columns: mcr, preference_rank, base_posting
  const residentSrPreferences: CsvRow[] = [
    { mcr: "M000001A", preference_rank: 1, base_posting: "Renal" },
    { mcr: "M000001A", preference_rank: 2, base_posting: "Gastro" },
    { mcr: "M000001A", preference_rank: 3, base_posting: "Endocrine" },
    { mcr: "M000002A", preference_rank: 1, base_posting: "Gastro" },
    { mcr: "M000002A", preference_rank: 2, base_posting: "Renal" },
    { mcr: "M000002A", preference_rank: 3, base_posting: "Endocrine" },
  ];

  const postings: CsvRow[] = [
    { posting_code: "CVM (TTSH)", posting_name: "Cardiovascular Medicine (TTSH)", posting_type: "core", max_residents: 3, required_block_duration: 3 },
    { posting_code: "ED (TTSH)", posting_name: "Emergency Department (TTSH)", posting_type: "core", max_residents: 4, required_block_duration: 1 },
    { posting_code: "Endocrine (TTSH)", posting_name: "Endocrinology (TTSH)", posting_type: "elective", max_residents: 2, required_block_duration: 3 },
    { posting_code: "Gastro (TTSH)", posting_name: "Gastroenterology (TTSH)", posting_type: "elective", max_residents: 2, required_block_duration: 3 },
    { posting_code: "GM (TTSH)", posting_name: "General Medicine (TTSH)", posting_type: "core", max_residents: 5, required_block_duration: 3 },
    { posting_code: "GRM (TTSH)", posting_name: "Geriatric Medicine (TTSH)", posting_type: "core", max_residents: 2, required_block_duration: 2 },
    { posting_code: "MedComm (Comm)", posting_name: "Medical Community (Comm)", posting_type: "elective", max_residents: 1, required_block_duration: 1 },
    { posting_code: "Haemato (TTSH)", posting_name: "Haematology (TTSH)", posting_type: "elective", max_residents: 2, required_block_duration: 3 },
    { posting_code: "ID (TTSH)", posting_name: "Infectious Diseases (TTSH)", posting_type: "elective", max_residents: 3, required_block_duration: 3 },
    { posting_code: "Med Onco (TTSH)", posting_name: "Medical Oncology (TTSH)", posting_type: "elective", max_residents: 2, required_block_duration: 3 },
    { posting_code: "PMD (TTSH)", posting_name: "Palliative Medicine (TTSH)", posting_type: "elective", max_residents: 2, required_block_duration: 3 },
    { posting_code: "RAI (TTSH)", posting_name: "Rheumatology and Immunology (TTSH)", posting_type: "elective", max_residents: 2, required_block_duration: 3 },
    { posting_code: "RCCM (TTSH)", posting_name: "Respiratory Critical Care Medicine (TTSH)", posting_type: "core", max_residents: 3, required_block_duration: 2 },
    { posting_code: "MICU (TTSH)", posting_name: "Medical ICU (TTSH)", posting_type: "core", max_residents: 2, required_block_duration: 1 },
    { posting_code: "Rehab (TTSH)", posting_name: "Rehabilitation (TTSH)", posting_type: "elective", max_residents: 2, required_block_duration: 3 },
    { posting_code: "Renal (TTSH)", posting_name: "Renal Medicine (TTSH)", posting_type: "elective", max_residents: 2, required_block_duration: 3 },
    { posting_code: "CVM (KTPH)", posting_name: "Cardiovascular Medicine (KTPH)", posting_type: "core", max_residents: 2, required_block_duration: 3 },
    { posting_code: "Endocrine (KTPH)", posting_name: "Endocrinology (KTPH)", posting_type: "elective", max_residents: 1, required_block_duration: 3 },
    { posting_code: "GM (KTPH)", posting_name: "General Medicine (KTPH)", posting_type: "core", max_residents: 3, required_block_duration: 3 },
    { posting_code: "GRM (KTPH)", posting_name: "Geriatric Medicine (KTPH)", posting_type: "core", max_residents: 2, required_block_duration: 2 },
    { posting_code: "MICU (KTPH)", posting_name: "Medical ICU (KTPH)", posting_type: "core", max_residents: 2, required_block_duration: 1 },
    { posting_code: "RCCM (KTPH)", posting_name: "Respiratory Critical Care Medicine (KTPH)", posting_type: "core", max_residents: 1, required_block_duration: 2 },
    { posting_code: "Renal (KTPH)", posting_name: "Renal Medicine (KTPH)", posting_type: "elective", max_residents: 2, required_block_duration: 3 },
    { posting_code: "Med Onco (NCC)", posting_name: "Medical Oncology (NCC)", posting_type: "elective", max_residents: 2, required_block_duration: 3 },
    { posting_code: "NL (NNI)", posting_name: "Neurology (NNI)", posting_type: "core", max_residents: 2, required_block_duration: 3 },
    { posting_code: "Derm (NSC)", posting_name: "Dermatology (NSC)", posting_type: "elective", max_residents: 1, required_block_duration: 3 },
    { posting_code: "GM (NUH)", posting_name: "General Medicine (NUH)", posting_type: "CCR", max_residents: 2, required_block_duration: 1 },
    { posting_code: "GM (SGH)", posting_name: "General Medicine (SGH)", posting_type: "CCR", max_residents: 2, required_block_duration: 1 },
    { posting_code: "GM (CGH)", posting_name: "General Medicine (CGH)", posting_type: "CCR", max_residents: 1, required_block_duration: 1 },
    { posting_code: "GM (SKH)", posting_name: "General Medicine (SKH)", posting_type: "CCR", max_residents: 2, required_block_duration: 1 },
    { posting_code: "GM (WH)", posting_name: "General Medicine (WH)", posting_type: "CCR", max_residents: 3, required_block_duration: 3 },
  ];

  const otherAssignments: CsvRow[] = [
    { mcr: "M000001A", block: 5, leave_type: "LOA", posting_code: "GM (TTSH)" },
    { mcr: "M000002A", block: 9, leave_type: "NS", posting_code: "" },
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
    { filename: "sample_resident_sr_preferences.csv", content: toCsv(residentSrPreferences) },
    { filename: "sample_postings.csv", content: toCsv(postings) },
    { filename: "sample_leave.csv", content: toCsv(otherAssignments) },
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
