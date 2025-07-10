export const generateSampleCSV = () => {
  // Generate preferences.csv
  const preferencesData = [
    {
      id: "R001",
      name: "Dr. Alice Johnson",
      year: 1,
      p1: "Cardiology",
      p2: "Dermatology",
      p3: "Emergency Medicine",
      p4: "Psychiatry",
      p5: "Radiology",
    },
    {
      id: "R002",
      name: "Dr. Bob Smith",
      year: 2,
      p1: "Surgery",
      p2: "Pediatrics",
      p3: "Radiology",
      p4: "Cardiology",
      p5: "Dermatology",
    },
  ];

  // Generate resident_posting_data.csv (with type)
  const residentPostingData = [
    {
      id: "R001",
      name: "Dr. Alice Johnson",
      year: 1,
      posting: "Cardiology",
      start_block: 1,
      block_duration: 4,
      type: "core",
    },
    {
      id: "R001",
      name: "Dr. Alice Johnson",
      year: 1,
      posting: "Dermatology",
      start_block: 5,
      block_duration: 2,
      type: "elective",
    },
    {
      id: "R001",
      name: "Dr. Alice Johnson",
      year: 1,
      posting: "Emergency Medicine",
      start_block: 7,
      block_duration: 3,
      type: "core",
    },
    {
      id: "R001",
      name: "Dr. Alice Johnson",
      year: 1,
      posting: "Psychiatry",
      start_block: 10,
      block_duration: 3,
      type: "elective",
    },
    {
      id: "R002",
      name: "Dr. Bob Smith",
      year: 2,
      posting: "Surgery",
      start_block: 1,
      block_duration: 6,
      type: "core",
    },
    {
      id: "R002",
      name: "Dr. Bob Smith",
      year: 2,
      posting: "Pediatrics",
      start_block: 7,
      block_duration: 3,
      type: "core",
    },
    {
      id: "R002",
      name: "Dr. Bob Smith",
      year: 2,
      posting: "Radiology",
      start_block: 10,
      block_duration: 3,
      type: "elective",
    },
  ];

  // Generate posting_quotas.csv
  const postingQuotasData = [
    { course_name: "Cardiology", max_residents: 1, required_block_duration: 4 },
    {
      course_name: "Dermatology",
      max_residents: 1,
      required_block_duration: 2,
    },
    {
      course_name: "Emergency Medicine",
      max_residents: 1,
      required_block_duration: 3,
    },
    { course_name: "Psychiatry", max_residents: 1, required_block_duration: 3 },
    { course_name: "Surgery", max_residents: 1, required_block_duration: 6 },
    { course_name: "Pediatrics", max_residents: 1, required_block_duration: 3 },
    { course_name: "Radiology", max_residents: 1, required_block_duration: 3 },
  ];

  // Convert to CSV format
  const preferencesCSV = [
    "id,name,year,p1,p2,p3,p4,p5",
    ...preferencesData.map(
      (row) =>
        `${row.id},${row.name},${row.year},${row.p1},${row.p2},${row.p3},${row.p4},${row.p5}`
    ),
  ].join("\n");

  const residentPostingCSV = [
    "id,name,year,posting,start_block,block_duration,type",
    ...residentPostingData.map(
      (row) =>
        `${row.id},${row.name},${row.year},${row.posting},${row.start_block},${row.block_duration},${row.type}`
    ),
  ].join("\n");

  const postingQuotasCSV = [
    "course_name,max_residents,required_block_duration",
    ...postingQuotasData.map(
      (row) =>
        `${row.course_name},${row.max_residents},${row.required_block_duration}`
    ),
  ].join("\n");

  // Create and download files
  const downloadFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  // Download all three files
  downloadFile(preferencesCSV, "preferences.csv");
  downloadFile(residentPostingCSV, "resident_posting_data.csv");
  downloadFile(postingQuotasCSV, "posting_quotas.csv");
};
