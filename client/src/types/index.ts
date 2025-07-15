// child api response
export interface AssignedPosting {
  posting_code: string;
  posting_name: string;
  posting_type?: string;
  start_block: number;

  duration_blocks: number;
  is_preferred: boolean;
  preference_rank: number;
}

// parent api response
export interface Resident {
  mcr: string;
  resident_name: string;
  resident_year: number;
  assigned_postings: AssignedPosting[];
}

// grandparent api response
export interface ApiResponse {
  success: boolean;
  schedule?: Resident[];
  summary?: Summary;
}

export interface CsvFilesState {
  residents: File | null;
  resident_history: File | null;
  resident_preferences: File | null;
  posting_quotas: File | null;
}

export interface Summary {
  total_residents: number;
  total_postings: number;
  total_blocks: number;
  preference_satisfaction: {
    first_preference: number;
    second_preference: number;
    third_preference: number;
    fourth_preference: number;
    fifth_preference: number;
  };
  posting_utilization: {
    posting_code: string;
    posting_name: string;
    assigned_blocks: number;
    utilisation_percentage: number;
  }[];
}

type CsvValue = string | number | boolean | null | undefined;
export type CsvRow = Record<string, CsvValue>;
