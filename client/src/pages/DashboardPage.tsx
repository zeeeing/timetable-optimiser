import React, { useState, useEffect, useMemo } from "react";
import { useApiResponseContext } from "@/context/ApiResponseContext";
import type {
  Resident,
  ApiResponse,
  CsvFilesState,
  Weightages,
} from "../types";
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
import { Loader2Icon, PinIcon, PinOffIcon } from "lucide-react";

const HomePage: React.FC = () => {
  const { apiResponse, setApiResponse } = useApiResponseContext();
  const [csvFiles, setCsvFiles] = useState<CsvFilesState>({
    residents: null,
    resident_history: null,
    resident_preferences: null,
    resident_sr_preferences: null,
    postings: null,
    resident_leaves: null,
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedResidentMcr, setSelectedResidentMcr] = useState<string | null>(
    () => localStorage.getItem("selectedResidentMcr")
  );
  const [weightages, setWeightages] = useState<Weightages>({
    preference: 1,
    sr_preference: 5,
    sr_y2_not_selected_penalty: 0,
    seniority: 1,
    elective_shortfall_penalty: 10,
    core_shortfall_penalty: 10,
  });
  const [pinnedMcrs, setPinnedMcrs] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem("pinnedMcrs");
      if (!raw) return new Set<string>();
      const arr = JSON.parse(raw);
      return new Set<string>(Array.isArray(arr) ? arr : []);
    } catch {
      return new Set<string>();
    }
  });

  const handleFileUpload =
    (fileType: keyof typeof csvFiles) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!file.name.endsWith(".csv")) {
        setError("Please upload a CSV file.");
        return;
      }
      setCsvFiles((prev) => ({ ...prev, [fileType]: file }));
      setError(null);
      setApiResponse(null);
    };

  const handleProcessFiles = async () => {
    setIsProcessing(true);
    setError(null);

    const formData = new FormData();

    // if CSVs present, always include them, else omit
    if (csvFiles.residents) formData.append("residents", csvFiles.residents);
    if (csvFiles.resident_history) formData.append("resident_history", csvFiles.resident_history);
    if (csvFiles.resident_preferences) formData.append("resident_preferences", csvFiles.resident_preferences);
    if (csvFiles.resident_sr_preferences) formData.append("resident_sr_preferences", csvFiles.resident_sr_preferences);
    if (csvFiles.postings) formData.append("postings", csvFiles.postings);
    if (csvFiles.resident_leaves) formData.append("resident_leaves", csvFiles.resident_leaves);
    // include weightages and pinned residents
    formData.append("weightages", JSON.stringify(weightages));
    formData.append("pinned_mcrs", JSON.stringify(Array.from(pinnedMcrs.values())));

    try {
      const json: ApiResponse = await uploadCsv(formData);
      if (json.success && json.residents) {
        setApiResponse(json);
      } else {
        throw new Error("Failed to retrieve api response.");
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An unknown error occurred.");
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
    try {
      localStorage.setItem(
        "pinnedMcrs",
        JSON.stringify(Array.from(pinnedMcrs.values()))
      );
    } catch {}
  }, [pinnedMcrs]);

  const togglePin = (mcr: string) => {
    setPinnedMcrs((prev) => {
      const next = new Set(prev);
      if (next.has(mcr)) next.delete(mcr);
      else next.add(mcr);
      return next;
    });
  };

  return (
    <div className="container mx-auto bg-white rounded-xl shadow-md p-8 flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-center mb-6 text-gray-800">
        IM Residency Rostering Tool
      </h1>

      {/* Upload Section */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
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
          label="SR Preferences CSV"
          onChange={handleFileUpload("resident_sr_preferences")}
        />
        <FileUpload
          label="Postings CSV"
          onChange={handleFileUpload("postings")}
        />
        <FileUpload
          label="Leave CSV"
          onChange={handleFileUpload("resident_leaves")}
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
            (!apiResponse &&
              (!csvFiles.residents ||
                !csvFiles.resident_preferences ||
                !csvFiles.resident_sr_preferences ||
                !csvFiles.resident_history ||
                !csvFiles.postings))
          }
          className="bg-blue-600 text-white hover:bg-blue-700 cursor-pointer"
        >
          {isProcessing ? (
            <>
              <Loader2Icon className="animate-spin" />
              Generating...
            </>
          ) : apiResponse ? (
            "Re-Generate Timetable"
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
      {error && <ErrorAlert message={error} variantType={"destructive"} />}

      {/* Timetable Results */}
      {apiResponse && (
        <div className="flex flex-col gap-6">
          <Separator />
          <div className="flex justify-between items-center">
            <ResidentDropdown
              groupedResidents={groupedResidents}
              selectedResidentMcr={selectedResidentMcr}
              setSelectedResidentMcr={setSelectedResidentMcr}
            />
            {selectedResidentMcr && (
              <div>
                <Button
                  variant={
                    pinnedMcrs.has(selectedResidentMcr)
                      ? "secondary"
                      : "outline"
                  }
                  className="cursor-pointer"
                  onClick={() => togglePin(selectedResidentMcr)}
                >
                  {pinnedMcrs.has(selectedResidentMcr) ? (
                    <>
                      <PinOffIcon fill="red" />
                      Unpin Resident
                    </>
                  ) : (
                    <>
                      <PinIcon fill="yellowgreen" />
                      Pin Resident
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
          {selectedResidentData && (
            <ResidentTimetable
              resident={selectedResidentData}
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
