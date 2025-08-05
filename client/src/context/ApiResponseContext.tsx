import React, { createContext, useContext, useState } from "react";
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
  const [apiResponse, setApiResponse] = useState<ApiResponse | null>(null);

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
