import axios from "axios";
import type { ApiResponse } from "../types";

const baseURL = import.meta.env.API_BASE_URL || "http://127.0.0.1:8000/api";

export const api = axios.create({
  baseURL,
});

// types
export type SaveSchedulePayload = {
  resident_mcr: string;
  current_year: { month_block: number; posting_code: string }[];
};

// routes
export const solve = async (formData: FormData): Promise<ApiResponse> => {
  try {
    const { data } = await api.post<ApiResponse>("/solve", formData);
    return data;
  } catch (err: any) {
    throw err;
  }
};

export const saveSchedule = async (
  payload: SaveSchedulePayload
): Promise<ApiResponse> => {
  try {
    const { data } = await api.post<ApiResponse>("/save", payload);
    return data;
  } catch (err: any) {
    throw err;
  }
};

export const downloadCsv = async (apiResponse: ApiResponse): Promise<Blob> => {
  try {
    const { success, residents, resident_history, statistics } =
      apiResponse ?? {};
    const optimisation_scores = statistics?.cohort?.optimisation_scores ?? [];

    const payload = {
      success,
      residents,
      resident_history,
      optimisation_scores,
    };

    const { data } = await api.post("/download-csv", payload, {
      responseType: "blob",
      headers: { "Content-Type": "application/json" },
    });
    return data as Blob;
  } catch (err: any) {
    throw err;
  }
};
