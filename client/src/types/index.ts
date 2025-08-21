// api response types
export interface ApiResponse {
  success: boolean;
  residents: Resident[];
  resident_history: ResidentHistory[];
  resident_preferences: ResidentPreference[];
  postings: Posting[];
  statistics: Statistics;
  diagnostics?: Diagnostics;
}

export interface Resident {
  mcr: string;
  name: string;
  resident_year: number;
  core_blocks_completed: {
    [key: string]: number;
  };
  unique_electives_completed: string[];
  ccr_status: {
    completed: boolean;
    posting_code: string;
  };
  constraints: Constraint[];
}

export interface Constraint {
  resident_mcr: string;
  type: string; // "violation" | "penalty"
  category: string;
  description: string;
  penalty: number;
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
  cohort: {
    optimisation_scores: number[];
    optimisation_scores_normalised: number[];
    posting_util: PostingUtil[];
  };
}

// diagnostics types (tentative implementation)
export interface Diagnostics {
  off_explanations_by_resident: Record<string, OffBlockExplanation[]>;
}

export interface OffBlockExplanation {
  block: number;
  feasible_postings: string[];
  reasons_by_posting: Record<string, string[]>;
}

export interface PostingUtil {
  posting_code: string;
  util_per_block: UtilPerBlock[];
}

export interface UtilPerBlock {
  block: number;
  filled: number;
  capacity: number;
  is_over_capacity: boolean;
}

// csv file types
export interface CsvFilesState {
  residents: File | null;
  resident_history: File | null;
  resident_preferences: File | null;
  postings: File | null;
}

// generation of sample csv
export interface CsvRow {
  [key: string]: string | number;
}
