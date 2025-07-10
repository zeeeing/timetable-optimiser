import React from "react";
import { Input } from "./ui/input";
import { UploadCloud } from "lucide-react";

interface FileUploadProps {
  label: string;
  file: File | null;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const FileUpload: React.FC<FileUploadProps> = ({ label, file, onChange }) => (
  <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center bg-gray-50">
    <UploadCloud className="h-6 w-6 text-blue-500 mx-auto mb-2" />
    <p className="text-sm font-medium text-gray-700 mb-2">{label}</p>
    <Input type="file" accept=".csv" onChange={onChange} />
  </div>
);

export default FileUpload;
