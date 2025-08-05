import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { ApiResponseProvider } from "./context/ApiResponseContext.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ApiResponseProvider>
      <App />
    </ApiResponseProvider>
  </StrictMode>
);
