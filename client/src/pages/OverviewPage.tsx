import React, { useState } from "react";
import { useApiResponseContext } from "@/context/ApiResponseContext";
import { downloadCsv } from "@/api/api";

import PostingOverviewTable from "../components/PlanningOverviewTable";
import ErrorAlert from "../components/ErrorAlert";
import { Button } from "@/components/ui/button";
import { Loader2Icon } from "lucide-react";

const OverviewPage: React.FC = () => {
  const { apiResponse } = useApiResponseContext();
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDownloadCSV = async () => {
    if (!apiResponse) {
      setError("No timetable data available to download");
      return;
    }

    setIsDownloading(true);
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
      setIsDownloading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto bg-white rounded-xl shadow-md p-8 flex flex-col gap-6">
      {!apiResponse && (
        <p className="text-center">Please generate a timetable first.</p>
      )}

      {error && <ErrorAlert message={error} />}

      {apiResponse && <PostingOverviewTable apiResponse={apiResponse} />}

      {/* Download Button */}
      {apiResponse?.residents && (
        <div className="flex justify-end">
          <Button
            className="bg-green-600 text-white hover:bg-green-700"
            onClick={handleDownloadCSV}
            disabled={isDownloading}
          >
            {isDownloading ? (
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
  );
};

export default OverviewPage;
