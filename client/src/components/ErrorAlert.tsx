import React from "react";
import { AlertCircleIcon } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "./ui/alert";

interface ErrorAlertProps {
  message: string;
  description?: React.ReactNode;
}

const ErrorAlert: React.FC<ErrorAlertProps> = ({ message, description }) => (
  <div className="flex items-center">
    <Alert variant={"destructive"}>
      <AlertCircleIcon />
      <AlertTitle>{message}</AlertTitle>
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
