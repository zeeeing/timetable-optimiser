import React, { useState, useEffect } from "react";
import { useApiResponseContext } from "@/context/ApiResponseContext";
import type { Resident, ApiResponse, CsvFilesState } from "../types";
import { uploadCsv } from "../api/api";

import FileUpload from "../components/FileUpload";
import WeightageSelector from "../components/WeightageSelector";
import { generateSampleCSV } from "../lib/generateSampleCSV";
import ErrorAlert from "../components/ErrorAlert";
import ResidentDropdown from "../components/ResidentDropdown";
import ResidentTimetable from "../components/ResidentTimetable";
import CohortStatistics from "../components/CohortStatistics";
import PostingStatistics from "../components/PostingStatistics";
import { Button } from "../components/ui/button";
import { Separator } from "../components/ui/separator";
import { Loader2Icon } from "lucide-react";

const HomePage: React.FC = () => {
  const { apiResponse, setApiResponse } = useApiResponseContext();
  const [csvFiles, setCsvFiles] = useState<CsvFilesState>({
    residents: null,
    resident_history: null,
    resident_preferences: null,
    postings: null,
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedResident, setSelectedResident] = useState<string>(
    () => localStorage.getItem("selectedResident") || ""
  );
  const [weightages, setWeightages] = useState({
    micu_rccm_bonus: 5,
    preference: 1,
    seniority: 2,
    elective_shortfall_penalty: 10,
    core_shortfall_penalty: 10,
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
      setApiResponse(null);
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
        setApiResponse(json);
        const storedResident = localStorage.getItem("selectedResident");
        if (!storedResident && json.residents.length > 0) {
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

  const selectedResidentData = apiResponse?.residents?.find(
    (r: Resident) => r.mcr === selectedResident
  );

  useEffect(() => {
    if (selectedResident)
      localStorage.setItem("selectedResident", selectedResident);
  }, [selectedResident]);

  return (
    <div className="max-w-7xl mx-auto bg-white rounded-xl shadow-md p-8 flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-center mb-6 text-gray-800">
        Upload and Generate Optimal Timetable Solution
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
      {apiResponse && (
        <div className="space-y-6">
          <Separator />
          <ResidentDropdown
            residents={apiResponse.residents}
            selectedResidentMcr={selectedResident}
            onChange={setSelectedResident}
          />
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
        </div>
      )}
    </div>
  );
};

export default HomePage;
