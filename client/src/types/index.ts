export interface BlockAssignment {
  posting: string | null;
  type: string | null;
}

export interface Resident {
  id: string;
  name: string;
  year: number;
  block_assignments: BlockAssignment[];
  core_count: number;
  elective_count: number;
}

export interface ApiResponse {
  success: boolean;
  message?: string;
  timetable?: Resident[];
}

export interface CsvFilesState {
  preferences: File | null;
  resident_posting_data: File | null;
  posting_quotas: File | null;
}
