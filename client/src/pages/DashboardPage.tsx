import { useApiResponseContext } from "@/context/ApiResponseContext";
import { groupResidentsByYear } from "@/lib/residentOrdering";
import React, { useEffect, useMemo, useState } from "react";
import { solve } from "../api/api";
import type {
  ApiResponse,
  CsvFilesState,
  Resident,
  Weightages,
} from "../types";

import CohortStatistics from "../components/CohortStatistics";
import ErrorAlert from "../components/ErrorAlert";
import FileUpload from "../components/FileUpload";
import PostingUtilTable from "../components/PostingUtilTable";
import ResidentDropdown from "../components/ResidentDropdown";
import ResidentTimetable from "../components/ResidentTimetable";
import WeightageSelector from "../components/WeightageSelector";
import { generateSampleCSV } from "../lib/generateSampleCSV";

import {
  cn,
  parseAcademicYearInput,
  type AcademicYearRange,
} from "@/lib/utils";
import { Loader2Icon, PinIcon, PinOffIcon } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Separator } from "../components/ui/separator";
import PostingDeviationDrawer, {
  type PostingPreviewRow,
} from "../components/PostingDeviationDrawer";

const parseCsvText = (text: string): string[][] => {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && text[i + 1] === "\n") {
        i++;
      }
      row.push(current);
      rows.push(row);
      row = [];
      current = "";
    } else {
      current += char;
    }
  }

  row.push(current);
  rows.push(row);

  return rows
    .map((cols) => cols.map((cell) => (cell ?? "").trim()))
    .filter((cols) => cols.some((cell) => cell.length > 0));
};

const buildHeaderIndex = (headers: string[]): Record<string, number> => {
  const index: Record<string, number> = {};
  headers.forEach((header, idx) => {
    const normalized = header.trim().toLowerCase();
    if (normalized) {
      index[normalized] = idx;
    }
  });
  return index;
};

const coerceNumber = (value: string, fallback: number, min = 0): number => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.floor(parsed));
};

const parsePostingsFile = async (
  file: File
): Promise<PostingPreviewRow[]> => {
  const text = await file.text();
  const rows = parseCsvText(text);
  if (!rows.length) {
    return [];
  }
  const headerIndex = buildHeaderIndex(rows[0]);

  const getValue = (row: string[], ...keys: string[]): string => {
    for (const key of keys) {
      const idx = headerIndex[key];
      if (idx !== undefined) {
        return row[idx] ?? "";
      }
    }
    return "";
  };

  const postings: PostingPreviewRow[] = [];
  for (const row of rows.slice(1)) {
    const code = getValue(row, "posting_code");
    if (!code) continue;

    postings.push({
      posting_code: code,
      posting_name: getValue(row, "posting_name"),
      posting_type: getValue(row, "posting_type"),
      max_residents: coerceNumber(getValue(row, "max_residents"), 0),
      required_block_duration: Math.max(
        1,
        coerceNumber(getValue(row, "required_block_duration"), 1)
      ),
      hc16_max_deviation: coerceNumber(
        getValue(
          row,
          "hc16_max_deviation",
          "hc16 deviation",
          "hc16maxdeviation",
          "hc16max_deviation"
        ),
        0
      ),
    });
  }
  return postings;
};

const buildDeviationMap = (
  rows: PostingPreviewRow[],
  overrides?: Record<string, number>
): Record<string, number> => {
  const map: Record<string, number> = {};
  rows.forEach((row) => {
    const code = row.posting_code;
    if (!code) return;
    const overrideValue = overrides?.[code];
    if (typeof overrideValue === "number" && Number.isFinite(overrideValue)) {
      map[code] = Math.max(0, Math.floor(overrideValue));
    } else {
      map[code] = Math.max(0, Math.floor(row.hc16_max_deviation ?? 0));
    }
  });
  return map;
};

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
    seniority: 1,
    elective_shortfall_penalty: 10,
    core_shortfall_penalty: 10,
  });
  const [postingPreview, setPostingPreview] = useState<PostingPreviewRow[]>([]);
  const [postingDeviationOverrides, setPostingDeviationOverrides] = useState<
    Record<string, number>
  >({});
  const [postingDeviationDraft, setPostingDeviationDraft] = useState<
    Record<string, number>
  >({});
  const [isPostingDrawerOpen, setIsPostingDrawerOpen] = useState(false);
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
  const [currentAcademicYearInput, setCurrentAcademicYearInput] =
    useState<string>(() => {
      try {
        return localStorage.getItem("planningAcademicYear") ?? "";
      } catch {
        return "";
      }
    });

  const handleFileUpload =
    (fileType: keyof typeof csvFiles) =>
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!file.name.endsWith(".csv")) {
        setError("Please upload a CSV file.");
        return;
      }

      setCsvFiles((prev) => ({ ...prev, [fileType]: file }));
      setError(null);
      setApiResponse(null);

      if (fileType === "postings") {
        try {
          const parsed = await parsePostingsFile(file);
          setPostingPreview(parsed);
          const defaults = buildDeviationMap(parsed);
          setPostingDeviationOverrides(defaults);
          setPostingDeviationDraft({ ...defaults });
          setIsPostingDrawerOpen(parsed.length > 0);
        } catch (err) {
          console.error("Failed to parse postings CSV", err);
          setError("Failed to read postings CSV. Please check the file format.");
          setPostingPreview([]);
          setPostingDeviationOverrides({});
          setPostingDeviationDraft({});
          setIsPostingDrawerOpen(false);
        }
      }
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
    if (Object.keys(postingDeviationOverrides).length > 0) {
      formData.append(
        "posting_hc16_overrides",
        JSON.stringify(postingDeviationOverrides)
      );
    }

    try {
      const json: ApiResponse = await solve(formData);
      if (json.success && json.residents) {
        setApiResponse(json);
      }
    } catch (err: any) {
      setError(
        err?.response?.data?.detail ||
          "An error occurred while processing the files."
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const selectedResidentData = apiResponse?.residents?.find(
    (r: Resident) => r.mcr === selectedResidentMcr
  );

  const handlePostingDrawerOpenChange = (open: boolean) => {
    if (!open) {
      setIsPostingDrawerOpen(false);
    }
  };

  const handleOpenPostingDrawer = () => {
    if (!postingPreview.length) return;
    setPostingDeviationDraft(
      buildDeviationMap(postingPreview, postingDeviationOverrides)
    );
    setIsPostingDrawerOpen(true);
  };

  const handlePostingDeviationChange = (postingCode: string, value: string) => {
    const nextValue = Number(value);
    const sanitized = Number.isFinite(nextValue)
      ? Math.max(0, Math.floor(nextValue))
      : 0;
    setPostingDeviationDraft((prev) => ({
      ...prev,
      [postingCode]: sanitized,
    }));
  };

  const handlePostingDrawerSave = () => {
    const normalised = buildDeviationMap(postingPreview, postingDeviationDraft);
    setPostingDeviationOverrides({ ...normalised });
    setPostingDeviationDraft({ ...normalised });
    setIsPostingDrawerOpen(false);
  };

  const handlePostingDrawerReset = () => {
    setPostingDeviationDraft(buildDeviationMap(postingPreview));
  };

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

  const parsedAcademicYear = useMemo<AcademicYearRange | null>(
    () => parseAcademicYearInput(currentAcademicYearInput),
    [currentAcademicYearInput]
  );
  const hasAcademicYearInputError =
    Boolean(currentAcademicYearInput.trim()) && !parsedAcademicYear;

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

  useEffect(() => {
    try {
      localStorage.setItem("planningAcademicYear", currentAcademicYearInput);
    } catch {}
  }, [currentAcademicYearInput]);

  const togglePin = (mcr: string) => {
    setPinnedMcrs((prev) => {
      const next = new Set(prev);
      if (next.has(mcr)) next.delete(mcr);
      else next.add(mcr);
      return next;
    });
  };

  return (
    <div className="container mx-auto bg-white rounded-xl border p-8 flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-center mb-6 text-gray-800">
        IM Residency Rostering System (R2S)
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
      <div className="flex justify-start">
        <Button
          type="button"
          variant="outline"
          onClick={handleOpenPostingDrawer}
          disabled={postingPreview.length === 0}
          className="cursor-pointer"
        >
          Adjust posting balance tolerance
        </Button>
      </div>

      {/* weightage selector */}
      <WeightageSelector value={weightages} setValue={setWeightages} />

      <div className="flex flex-col gap-1 max-w-xs">
        <Label htmlFor="current-academic-year">
          Planning for Academic Year:
        </Label>
        <Input
          id="current-academic-year"
          value={currentAcademicYearInput}
          onChange={(event) => setCurrentAcademicYearInput(event.target.value)}
          placeholder="2025/2026"
          className={cn(
            "max-w-xs",
            hasAcademicYearInputError && "border-red-500 visible:ring-red-500"
          )}
        />
        {hasAcademicYearInputError ? (
          <span className="text-xs text-red-600">
            Please use the format &quot;YYYY/YYYY&quot;.
          </span>
        ) : (
          currentAcademicYearInput && (
            <span className="text-xs text-gray-600">
              Current year planning will align with AY
              {currentAcademicYearInput.trim()}.
            </span>
          )
        )}
      </div>

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
              academicYearRange={parsedAcademicYear}
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

      <PostingDeviationDrawer
        open={isPostingDrawerOpen}
        postings={postingPreview}
        draft={postingDeviationDraft}
        onOpenChange={handlePostingDrawerOpenChange}
        onCancel={() => setIsPostingDrawerOpen(false)}
        onSave={handlePostingDrawerSave}
        onReset={handlePostingDrawerReset}
        onChange={handlePostingDeviationChange}
      />
    </div>
  );
};

export default HomePage;
