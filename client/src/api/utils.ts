import axios from "axios";

type ApiError = {
  error?: string;
  errors?: string[];
};

export const toMessage = (err: unknown): string => {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as ApiError | undefined;
    const list = data?.errors?.filter(Boolean);
    if (list && list.length) return list.join(", ");
    if (data?.error) return data.error;
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return "Request failed";
};
