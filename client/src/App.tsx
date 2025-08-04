import React, { useState } from "react";

import FileUpload from "./components/FileUpload";
import WeightageSelector from "./components/WeightageSelector";
import ErrorAlert from "./components/ErrorAlert";
import ResidentDropdown from "./components/ResidentDropdown";
import ResidentTimetable from "./components/ResidentTimetable";
import CohortStatistics from "./components/CohortStatistics";
import PostingStatistics from "./components/PostingStatistics";
import { generateSampleCSV } from "./lib/generateSampleCSV";

import { uploadCsv, downloadCsv } from "./api/api";

import { Button } from "./components/ui/button";
import { Separator } from "./components/ui/separator";
import { Loader2Icon } from "lucide-react";

import type { Resident, ApiResponse, CsvFilesState } from "./types";

const App: React.FC = () => {
  const [csvFiles, setCsvFiles] = useState<CsvFilesState>({
    residents: null,
    resident_history: null,
    resident_preferences: null,
    postings: null,
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [residents, setResidents] = useState<Resident[] | null>(null);
  const [apiResponse, setApiResponse] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedResident, setSelectedResident] = useState<string>("");
  const [weightages, setWeightages] = useState({
    micu_rccm_weight: 5,
    preference: 1,
    seniority: 2,
    elective_penalty: 10,
    core_penalty: 10,
  });

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
      setResidents(null);
    };

  const handleProcessFiles = async () => {
    if (
      !csvFiles.residents ||
      !csvFiles.resident_history ||
      !csvFiles.resident_preferences ||
      !csvFiles.postings
    ) {
      setError("Please upload all four CSV files");
      return;
    }

    setIsProcessing(true);
    setError(null);

    const formData = new FormData();
    formData.append("residents", csvFiles.residents);
    formData.append("resident_history", csvFiles.resident_history);
    formData.append("resident_preferences", csvFiles.resident_preferences);
    formData.append("postings", csvFiles.postings);
    formData.append("weightages", JSON.stringify(weightages));

    try {
      const json: ApiResponse = await uploadCsv(formData);
      if (json.success && json.residents) {
        setResidents(json.residents);
        setApiResponse(json);
        if (json.residents.length > 0) {
          setSelectedResident(json.residents[0].mcr);
        }
      } else {
        throw new Error("Failed to retrieve api response");
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An unknown error occurred");
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadCSV = async () => {
    if (!apiResponse) {
      setError("No timetable data available to download");
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const blob = await downloadCsv(apiResponse);
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = "timetable_assignments.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An unknown error occurred");
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const selectedResidentData = residents?.find(
    (r) => r.mcr === selectedResident
  );

  return (
    <div className="min-h-screen bg-linear-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-7xl mx-auto bg-white rounded-xl shadow-md p-8 flex flex-col gap-6">
        <h1 className="text-2xl font-bold text-center mb-6 text-gray-800">
          Resident Rostering: Timetable Optimiser
        </h1>

        {/* Upload Section */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <FileUpload
            label="Residents CSV"
            onChange={handleFileUpload("residents")}
          />
          <FileUpload
            label="Resident History CSV"
            onChange={handleFileUpload("resident_history")}
          />
          <FileUpload
            label="Resident Preferences CSV"
            onChange={handleFileUpload("resident_preferences")}
          />
          <FileUpload
            label="Postings CSV"
            onChange={handleFileUpload("postings")}
          />
        </div>

        {/* weightage selector */}
        <WeightageSelector value={weightages} setValue={setWeightages} />

        {/* Buttons */}
        <div className="flex flex-col gap-2 sm:flex-row sm:gap-4 justify-center items-center">
          <Button
            onClick={handleProcessFiles}
            disabled={
              isProcessing ||
              !csvFiles.residents ||
              !csvFiles.resident_preferences ||
              !csvFiles.resident_history ||
              !csvFiles.postings
            }
            className="bg-blue-600 text-white hover:bg-blue-700 cursor-pointer"
          >
            {isProcessing ? (
              <>
                <Loader2Icon className="animate-spin" />
                Processing...
              </>
            ) : (
              "Upload & Generate Timetable"
            )}
          </Button>
          <Button
            variant="secondary"
            onClick={generateSampleCSV}
            className="cursor-pointer"
          >
            Download Sample CSV
          </Button>
        </div>

        {/* Error Message */}
        {error && <ErrorAlert message={error} />}

        {/* Timetable Results */}
        {residents && (
          <div className="space-y-6">
            <Separator />
            <ResidentDropdown
              residents={residents}
              value={selectedResident}
              onChange={setSelectedResident}
            />
            {apiResponse && (
              <>
                {selectedResidentData && (
                  <ResidentTimetable
                    resident={selectedResidentData}
                    apiResponse={apiResponse}
                  />
                )}
                <CohortStatistics
                  statistics={apiResponse.statistics}
                  residents={apiResponse.residents}
                />
                <PostingStatistics
                  postingUtil={apiResponse.statistics.cohort.posting_util}
                />
              </>
            )}
          </div>
        )}

        {/* Download Button */}
        {residents && (
          <div className="mt-6 flex justify-end">
            <Button
              className="bg-green-600 text-white hover:bg-green-700"
              onClick={handleDownloadCSV}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>
                  <Loader2Icon className="animate-spin" />
                  Downloading...
                </>
              ) : (
                "Download Final Timetable CSV"
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
