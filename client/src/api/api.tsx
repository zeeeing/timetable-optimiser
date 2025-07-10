import axios from "axios";

const url = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001/api";

export const uploadCsv = async (formData: FormData) => {
  try {
    const response = await axios.post(`${url}/upload-csv`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data;
  } catch (error: any) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || "Processing failed");
    }
    throw new Error(error.message || "Processing failed");
  }
};

export const downloadCsv = async (timetable: any[]) => {
  try {
    const response = await axios.post(
      `${url}/download-csv`,
      { timetable },
      { responseType: "blob", headers: { "Content-Type": "application/json" } }
    );
    return response.data;
  } catch (error: any) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || "Failed to download CSV");
    }
    throw new Error(error.message || "Failed to download CSV");
  }
};
