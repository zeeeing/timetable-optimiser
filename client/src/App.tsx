import React, { useState } from "react";
import { generateSampleCSV } from "./utils/generateSampleCSV";
import FileUpload from "./components/FileUpload";
import ResidentDropdown from "./components/ResidentDropdown";
import ResidentTimetable from "./components/ResidentTimetable";
import ErrorAlert from "./components/ErrorAlert";
import { uploadCsv, downloadCsv } from "./api/api";

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

interface ApiResponse {
  success: boolean;
  message?: string;
  timetable?: Resident[];
}

const App: React.FC = () => {
  const [csvFiles, setCsvFiles] = useState<{
    preferences: File | null;
    resident_posting_data: File | null;
    posting_quotas: File | null;
  }>({
    preferences: null,
    resident_posting_data: null,
    posting_quotas: null,
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [timetable, setTimetable] = useState<Resident[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedResident, setSelectedResident] = useState<string>("");

  const handleFileUpload =
    (fileType: keyof typeof csvFiles) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!file.name.endsWith(".csv")) {
        setError("Please upload a CSV file");
        return;
      }
      setCsvFiles((prev) => ({ ...prev, [fileType]: file }));
      setError(null);
      setTimetable(null);
    };

  const processFiles = async () => {
    if (
      !csvFiles.preferences ||
      !csvFiles.resident_posting_data ||
      !csvFiles.posting_quotas
    ) {
      setError("Please upload all three CSV files");
      return;
    }

    setIsProcessing(true);
    setError(null);

    const formData = new FormData();
    formData.append("preferences", csvFiles.preferences);
    formData.append("resident_posting_data", csvFiles.resident_posting_data);
    formData.append("posting_quotas", csvFiles.posting_quotas);

    try {
      const json: ApiResponse = await uploadCsv(formData);
      if (json.success && json.timetable) {
        setTimetable(json.timetable);
        if (json.timetable.length > 0) {
          setSelectedResident(json.timetable[0].id);
        }
      } else {
        throw new Error(json.message || "Processing failed");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadCSV = async () => {
    if (!timetable || timetable.length === 0) {
      setError("No timetable data available to download");
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const blob = await downloadCsv(timetable);
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = "final_timetable.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const selectedResidentData = timetable?.find(
    (r) => r.id === selectedResident
  );

  return (
    <div className="min-h-screen bg-linear-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-md p-8">
        <h1 className="text-3xl font-bold text-center mb-6 text-gray-800">
          Resident Rostering: Timetable Optimiser
        </h1>

        {/* Upload Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <FileUpload
            label="Preferences CSV"
            onChange={handleFileUpload("preferences")}
          />
          <FileUpload
            label="Resident Posting Data CSV"
            onChange={handleFileUpload("resident_posting_data")}
          />
          <FileUpload
            label="Posting Quotas CSV"
            onChange={handleFileUpload("posting_quotas")}
          />
        </div>

        {/* Buttons */}
        <div className="flex gap-4 justify-center mb-6">
          <button
            onClick={processFiles}
            disabled={
              isProcessing ||
              !csvFiles.preferences ||
              !csvFiles.resident_posting_data ||
              !csvFiles.posting_quotas
            }
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {isProcessing ? "Processing..." : "Upload & Generate Timetable"}
          </button>
          <button
            onClick={generateSampleCSV}
            className="bg-gray-100 px-4 py-2 rounded-lg text-sm hover:bg-gray-200"
          >
            Download Sample CSV
          </button>
        </div>

        {/* Error Message */}
        {error && <ErrorAlert message={error} />}

        {/* Timetable Results */}
        {timetable && (
          <div className="mt-6">
            <h2 className="text-lg font-semibold mb-4 text-gray-700">
              Generated Timetable
            </h2>
            <ResidentDropdown
              residents={timetable}
              value={selectedResident}
              onChange={setSelectedResident}
            />
            {selectedResidentData && (
              <ResidentTimetable resident={selectedResidentData} />
            )}
          </div>
        )}

        {/* Download Button */}
        {timetable && (
          <div className="mt-6 flex justify-end">
            <button
              onClick={handleDownloadCSV}
              disabled={isProcessing}
              className="bg-green-600 text-white px-4 py-2 rounded-sm hover:bg-green-700 disabled:opacity-50"
            >
              {isProcessing ? "Downloading..." : "Download Final Timetable CSV"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
