import React from "react";
import { AlertCircleIcon } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "./ui/alert";

interface ErrorAlertProps {
  message: string;
  description?: React.ReactNode;
}

const ErrorAlert: React.FC<ErrorAlertProps> = ({ message, description }) => (
  <div className="flex items-center my-6">
    <Alert variant="destructive">
      <AlertCircleIcon />
      <AlertTitle>{message}</AlertTitle>
      {description && <AlertDescription>{description}</AlertDescription>}
    </Alert>
  </div>
);

export default ErrorAlert;
