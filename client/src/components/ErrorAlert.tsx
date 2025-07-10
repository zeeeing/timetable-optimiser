import React from "react";
import { AlertCircle } from "lucide-react";

const ErrorAlert: React.FC<{ message: string }> = ({ message }) => (
  <div className="bg-red-100 border border-red-300 text-red-700 rounded-lg p-4 flex items-center mb-6">
    <AlertCircle className="w-5 h-5 mr-2" />
    <span>{message}</span>
  </div>
);

export default ErrorAlert; 