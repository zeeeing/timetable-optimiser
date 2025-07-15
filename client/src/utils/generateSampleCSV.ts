import type { CsvRow } from "../types";

export function generateSampleCSV(): void {
  const residents: CsvRow[] = [
    { mcr: "R001", name: "John Smith", resident_year: 2 },
    { mcr: "R002", name: "Jane Doe", resident_year: 1 },
  ];

  const residentHistory: CsvRow[] = [
    {
      mcr: "R001",
      resident_year: 1,
      block_1: "GRM",
      block_2: "GRM",
      block_3: "GASTRO",
      block_4: "GASTRO",
      block_5: "GASTRO",
      block_6: "GM",
      block_7: "GM",
      block_8: "GM",
      block_9: "ED",
      block_10: "CVM",
      block_11: "CVM",
      block_12: "CVM",
    }
    // no history entry for the Year 1 resident (R002) as they're in their first year
  ];

  const residentPreferences: CsvRow[] = [
    { mcr: "R001", preference_1: "GASTRO", preference_2: "GM", preference_3: "", preference_4: "", preference_5: "" },
    { mcr: "R002", preference_1: "GM", preference_2: "ED", preference_3: "CVM", preference_4: "NEPHRO", preference_5: "" },
  ];

  const postingQuotas: CsvRow[] = [
    { posting_code: "GRM", posting_type: "core", max_residents: 2, required_block_duration: 2 },
    { posting_code: "GASTRO", posting_type: "core", max_residents: 1, required_block_duration: 3 },
    { posting_code: "GM", posting_type: "core", max_residents: 2, required_block_duration: 3 },
    { posting_code: "ED", posting_type: "core", max_residents: 1, required_block_duration: 1 },
    { posting_code: "CVM", posting_type: "core", max_residents: 1, required_block_duration: 3 },
    { posting_code: "MICU", posting_type: "core", max_residents: 1, required_block_duration: 3 },
    { posting_code: "NEPHRO", posting_type: "core", max_residents: 1, required_block_duration: 2 },
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
    { filename: "sample_posting_quotas.csv", content: toCsv(postingQuotas) },
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
