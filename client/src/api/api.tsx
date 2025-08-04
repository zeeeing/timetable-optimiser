import axios from "axios";
import type { ApiResponse } from "../types";

const url = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001/api";

export const uploadCsv = async (formData: FormData): Promise<ApiResponse> => {
  try {
    const response = await axios.post<ApiResponse>(
      `${url}/upload-csv`,
      formData,
      {
        headers: { "Content-Type": "multipart/form-data" },
      }
    );
    return response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response && error.response.data) {
      throw new Error(error.response.data.error || "Processing failed");
    }
    if (error instanceof Error) {
      throw new Error(error.message || "Processing failed");
    }
    throw new Error("Processing failed");
  }
};

export const downloadCsv = async (apiResponse: ApiResponse): Promise<Blob> => {
  try {
    const { success, residents, resident_history, statistics } = apiResponse;
    const optimisation_scores = statistics.cohort.optimisation_scores;
    const payload = {
      success,
      residents,
      resident_history,
      optimisation_scores,
    };

    const response = await axios.post<Blob>(`${url}/download-csv`, payload, {
      responseType: "blob",
      headers: { "Content-Type": "application/json" },
    });
    return response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response && error.response.data) {
      throw new Error(error.response.data.error || "Failed to download CSV");
    }
    if (error instanceof Error) {
      throw new Error(error.message || "Failed to download CSV");
    }
    throw new Error("Failed to download CSV");
  }
};
