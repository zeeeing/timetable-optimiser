import React, { createContext, useContext, useEffect, useState } from "react";
import type { ApiResponse } from "../types";

// define context type
interface ApiResponseContextType {
  apiResponse: ApiResponse | null;
  setApiResponse: (data: ApiResponse | null) => void;
}

// create api response context
export const ApiResponseContext = createContext<
  ApiResponseContextType | undefined
>(undefined);

// define a provider for the context
export const ApiResponseProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [apiResponse, setApiResponse] = useState<ApiResponse | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const stored = window.localStorage.getItem("apiResponse");
      return stored ? (JSON.parse(stored) as ApiResponse) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (apiResponse) {
        window.localStorage.setItem("apiResponse", JSON.stringify(apiResponse));
      } else {
        window.localStorage.removeItem("apiResponse");
      }
    } catch {
      // swallow storage errors so the UI keeps working
    }
  }, [apiResponse]);

  return (
    <ApiResponseContext.Provider value={{ apiResponse, setApiResponse }}>
      {children}
    </ApiResponseContext.Provider>
  );
};

// 4) Hook with correct return type
export const useApiResponseContext = (): ApiResponseContextType => {
  const context = useContext(ApiResponseContext);
  if (!context) {
    throw new Error(
      "useApiResponseContext must be used within an ApiResponseProvider"
    );
  }
  return context;
};
