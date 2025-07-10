import React, { useState } from "react";
import { AlertCircle, UploadCloud } from "lucide-react";
import { generateSampleCSV } from "./utils/generateSampleCSV";

interface Resident {
  id: string;
  name: string;
  p1: string;
  p2: string;
  p3: string;
  seniority: number;
  assignedPosting?: string;
}

interface ApiResponse {
  success: boolean;
  message?: string;
  assigned?: Resident[];
}

const url = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001/api";

const App: React.FC = () => {
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [assignments, setAssignments] = useState<Resident[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".csv")) {
      setError("Please upload a CSV file");
      return;
    }
    setCsvFile(file);
    setError(null);
    setAssignments(null);
  };

  const processFile = async () => {
    if (!csvFile) return;
    setIsProcessing(true);
    setError(null);

    const formData = new FormData();
    formData.append("csvFile", csvFile);

    try {
      const res = await fetch(`${url}/upload-csv`, {
        method: "POST",
        body: formData,
      });
      const json: ApiResponse = await res.json();
      if (res.ok && json.success && json.assigned) {
        setAssignments(json.assigned);
      } else {
        throw new Error(json.message || "Processing failed");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadCSV = async () => {
    if (!assignments || assignments.length === 0) {
      setError("No assigned residents available to download");
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const response = await fetch(`${url}/download-csv`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ assigned: assignments }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || "Failed to download CSV");
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = "assigned_postings.csv";
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-md p-8">
        <h1 className="text-3xl font-bold text-center mb-6 text-gray-800">
          Resident Rostering: Timetable Optimiser
        </h1>

        {/* Upload Section */}
        <div className="flex flex-col items-center gap-6 mb-6 border-2 border-dashed border-gray-300 rounded-lg p-6 text-center bg-gray-50">
          <UploadCloud className="h-8 w-8 text-blue-500" />
          <p className="text-gray-700 font-medium">
            Upload a CSV file to begin
          </p>
          <input
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            className="text-sm"
          />
          {csvFile && (
            <p className="text-sm text-green-700">
              File selected: {csvFile.name}
            </p>
          )}
        </div>
        <div className="flex gap-4 justify-center mb-6">
          <button
            onClick={processFile}
            disabled={isProcessing || !csvFile}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {isProcessing ? "Processing..." : "Upload & Assign"}
          </button>
          <button
            onClick={generateSampleCSV}
            className="bg-gray-100 px-4 py-2 rounded-lg text-sm hover:bg-gray-200"
          >
            Download Sample CSV
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-100 border border-red-300 text-red-700 rounded-lg p-4 flex items-center mb-6">
            <AlertCircle className="w-5 h-5 mr-2" />
            <span>{error}</span>
          </div>
        )}

        {/* Results Table */}
        {assignments && (
          <div className="mt-4">
            <h2 className="text-lg font-semibold mb-3 text-gray-700">
              Assigned Postings
            </h2>
            <div className="overflow-x-auto">
              <table className="min-w-full border border-gray-300 text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="border px-4 py-2 text-left">Name</th>
                    <th className="border px-4 py-2 text-left">
                      Assigned Posting
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map((s, i) => (
                    <tr key={i} className="bg-white hover:bg-blue-50">
                      <td className="border px-4 py-2">{s.name}</td>
                      <td className="border px-4 py-2">
                        {s.assignedPosting || "Not Assigned"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Download Button */}
        {assignments && (
          <div className="mt-4 flex justify-end">
            <button
              onClick={downloadCSV}
              disabled={isProcessing}
              className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-50"
            >
              {isProcessing ? "Downloading..." : "Download Assigned CSV"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
