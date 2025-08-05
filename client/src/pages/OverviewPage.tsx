import React from "react";
import PostingOverviewTable from "../components/PostingOverviewTable";
import ErrorAlert from "../components/ErrorAlert";
import { useApiResponseContext } from "@/context/ApiResponseContext";

const OverviewPage: React.FC = () => {
  const { apiResponse } = useApiResponseContext();

  if (!apiResponse) {
    return (
      <div className="max-w-7xl mx-auto bg-white rounded-xl shadow-md p-8">
        <ErrorAlert message="Please generate a timetable first." />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto bg-white rounded-xl shadow-md p-8">
      <h1 className="text-2xl font-semibold text-center mb-6 text-gray-800">
        Posting Planning
      </h1>
      <PostingOverviewTable apiResponse={apiResponse} />
    </div>
  );
};

export default OverviewPage;
