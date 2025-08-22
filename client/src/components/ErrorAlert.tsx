import React from "react";
import { AlertCircleIcon, LightbulbIcon } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "./ui/alert";

interface ErrorAlertProps {
  message: string;
  description?: string[];
  variantType?: "default" | "destructive" | null | undefined;
}

const ErrorAlert: React.FC<ErrorAlertProps> = ({
  message,
  description,
  variantType,
}) => (
  <div className="flex items-center">
    <Alert variant={variantType}>
      <AlertTitle className="flex items-center gap-2">
        {variantType == "destructive" ? <AlertCircleIcon /> : <LightbulbIcon />}
        {message}
      </AlertTitle>
      {Array.isArray(description) ? (
        <AlertDescription>
          <ul className="list-disc pl-5">
            {description.map((desc, idx) => (
              <li key={idx}>{desc}</li>
            ))}
          </ul>
        </AlertDescription>
      ) : (
        description && <AlertDescription>{description}</AlertDescription>
      )}
    </Alert>
  </div>
);

export default ErrorAlert;
