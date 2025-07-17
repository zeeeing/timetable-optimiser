import React from "react";
import { AlertCircleIcon } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "./ui/alert";

const ErrorAlert: React.FC<{ message: string }> = ({ message }) => (
  <div className="flex items-center my-6">
    <Alert variant="destructive">
      <AlertCircleIcon />
      <AlertTitle>{message}</AlertTitle>
      <AlertDescription>
        <p>Please contact the administrator should this error persist.</p>
      </AlertDescription>
    </Alert>
  </div>
);

export default ErrorAlert;
