import React, { useState, useEffect, useMemo } from "react";
import { useApiResponseContext } from "@/context/ApiResponseContext";
import type { Resident, ApiResponse, CsvFilesState } from "../types";
import { uploadCsv } from "../api/api";
import { groupResidentsByYear } from "@/lib/residentOrdering";

import FileUpload from "../components/FileUpload";
import WeightageSelector from "../components/WeightageSelector";
import { generateSampleCSV } from "../lib/generateSampleCSV";
import ErrorAlert from "../components/ErrorAlert";
import ResidentDropdown from "../components/ResidentDropdown";
import ResidentTimetable from "../components/ResidentTimetable";
import CohortStatistics from "../components/CohortStatistics";
import PostingUtilTable from "../components/PostingUtilTable";

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
  const [selectedResidentMcr, setSelectedResidentMcr] = useState<string | null>(
    () => localStorage.getItem("selectedResidentMcr")
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
    (r: Resident) => r.mcr === selectedResidentMcr
  );

  // order residents by their resident year
  const groupedResidents = useMemo(
    () =>
      apiResponse?.residents ? groupResidentsByYear(apiResponse.residents) : {},
    [apiResponse?.residents]
  );

  // then flatmap and order by year
  const orderedResidentMcrs = useMemo(
    () =>
      Object.keys(groupedResidents)
        .sort((a, b) => Number(a) - Number(b))
        .flatMap((year) =>
          groupedResidents[Number(year)].map((resident) => resident.mcr)
        ),
    [groupedResidents]
  );

  const currentIndex = orderedResidentMcrs.findIndex(
    (mcr) => mcr === selectedResidentMcr
  );

  const goPrev = () => {
    if (currentIndex > 0) {
      setSelectedResidentMcr(orderedResidentMcrs[currentIndex - 1]);
    }
  };

  const goNext = () => {
    if (currentIndex < orderedResidentMcrs.length - 1) {
      setSelectedResidentMcr(orderedResidentMcrs[currentIndex + 1]);
    }
  };

  const disablePrev = currentIndex <= 0;
  const disableNext =
    currentIndex === -1 || currentIndex >= orderedResidentMcrs.length - 1;

  // select first resident if there is no currently selected resident
  useEffect(() => {
    if (!selectedResidentMcr && orderedResidentMcrs.length > 0) {
      setSelectedResidentMcr(orderedResidentMcrs[0]);
    }
  }, [orderedResidentMcrs, selectedResidentMcr]);

  // update selected resident to persist in local storage
  useEffect(() => {
    if (selectedResidentMcr)
      localStorage.setItem("selectedResidentMcr", selectedResidentMcr);
  }, [selectedResidentMcr]);

  useEffect(() => {
    localStorage.removeItem("selectedResidentMcr");
  }, []);

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
        <div className="flex flex-col gap-6">
          <Separator />
          <ResidentDropdown
            groupedResidents={groupedResidents}
            selectedResidentMcr={selectedResidentMcr}
            setSelectedResidentMcr={setSelectedResidentMcr}
          />
          {selectedResidentData && (
            <ResidentTimetable
              resident={selectedResidentData}
              apiResponse={apiResponse}
              onPrev={goPrev}
              onNext={goNext}
              disablePrev={disablePrev}
              disableNext={disableNext}
            />
          )}
          <CohortStatistics
            statistics={apiResponse.statistics}
            residents={apiResponse.residents}
          />
          <PostingUtilTable
            postingUtil={apiResponse.statistics.cohort.posting_util}
          />
        </div>
      )}
    </div>
  );
};

export default HomePage;
