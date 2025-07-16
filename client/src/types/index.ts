export interface Resident {
  mcr: string;
  name: string;
  resident_year: number;
  total_core_completed: number;
  total_elective_completed: number;
}

export interface ResidentHistory {
  mcr: string;
  year: number;
  block: number;
  posting_code: string;
  is_current_year: boolean;
}

export interface ResidentPreference {
  mcr: string;
  preference_rank: number;
  posting_code: string;
}

export interface Posting {
  posting_code: string;
  posting_name: string;
  posting_type: string;
  max_residents: number;
  required_block_duration: number;
}

export interface Statistics {
  total_residents: number;
}

export interface ApiResponse {
  success: boolean;
  residents: Resident[];
  resident_history: ResidentHistory[];
  resident_preferences: ResidentPreference[];
  postings: Posting[];
  statistics: Statistics;
}

export interface CsvFilesState {
  residents: File | null;
  resident_history: File | null;
  resident_preferences: File | null;
  postings: File | null;
}

export interface CsvRow {
  [key: string]: string | number;
}
