import React from "react";
import { Input } from "./ui/input";
import { Label } from "@/components/ui/label";
import { UploadCloud } from "lucide-react";

interface FileUploadProps {
  label: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const FileUpload: React.FC<FileUploadProps> = ({ label, onChange }) => (
  <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center bg-gray-50 flex flex-col items-center justify-between gap-4">
    <UploadCloud className="h-8 w-8 text-blue-500 mx-auto mb-2" />
    <Label htmlFor="input" className="text-gray-700 mb-2">
      {label}
    </Label>
    <Input id="input" type="file" accept=".csv" onChange={onChange} />
  </div>
);

export default FileUpload;
