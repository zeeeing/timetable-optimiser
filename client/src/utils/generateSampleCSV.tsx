export const generateSampleCSV = (): void => {
  const sample: string[][] = [
    ["id", "name", "p1", "p2", "p3", "seniority"],
    ["101", "Jane Doe", "PostingA", "PostingB", "PostingC", "5"],
    ["102", "John Smith", "PostingA", "PostingC", "PostingB", "3"],
    ["103", "Alice Tan", "PostingA", "PostingC", "PostingB", "2"],
  ];
  const csvContent: string = sample.map((r) => r.join(",")).join("\n");
  const blob: Blob = new Blob([csvContent], { type: "text/csv" });
  const url: string = URL.createObjectURL(blob);
  const a: HTMLAnchorElement = document.createElement("a");
  a.href = url;
  a.download = "sample.csv";
  a.click();
  URL.revokeObjectURL(url);
};
