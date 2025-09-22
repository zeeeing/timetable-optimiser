import axios from "axios";
import type { ApiResponse } from "../types";
import { toMessage } from "./utils";

const baseURL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3001/api";

export const api = axios.create({
  baseURL,
});

// types
export type ValidateSchedulePayload = {
  resident_mcr: string;
  current_year: { month_block: number; posting_code: string }[];
};

export type ValidateScheduleResponse = {
  success: boolean;
  violations: { code: string; description: string }[];
};

// routes
export const uploadCsv = async (formData: FormData): Promise<ApiResponse> => {
  try {
    const { data } = await api.post<ApiResponse>("/solve", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data;
  } catch (err) {
    throw new Error(toMessage(err));
  }
};

export const validateSchedule = async (
  payload: ValidateSchedulePayload
): Promise<ValidateScheduleResponse> => {
  try {
    const { data } = await api.post<ValidateScheduleResponse>(
      "/validate",
      payload
    );
    return data;
  } catch (err) {
    throw new Error(toMessage(err));
  }
};

export const saveSchedule = async (
  payload: ValidateSchedulePayload
): Promise<ApiResponse> => {
  try {
    const { data } = await api.post<ApiResponse>("/save", payload);
    if (!data?.success) {
      throw new Error("Save failed");
    }
    return data;
  } catch (err) {
    throw new Error(toMessage(err));
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
  } catch (err) {
    throw new Error(toMessage(err));
  }
};
