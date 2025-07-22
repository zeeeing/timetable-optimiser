from typing import List, Dict, Set
from collections import defaultdict


def get_completed_postings(
    resident_history: List[Dict], posting_info: Dict
) -> Dict[str, Set[str]]:
    """
    Get the set of completed postings per resident

    Output:
      {
        mcr: {posting_code}
      }
    """
    history_map = parse_resident_history(resident_history)
    completed_postings_map = {}

    for mcr, posting_counts in history_map.items():
        completed_postings_map[mcr] = set()
        for posting_code, blocks_completed in posting_counts.items():
            if is_posting_completed(posting_code, blocks_completed, posting_info):
                completed_postings_map[mcr].add(posting_code)

    return completed_postings_map


def get_posting_progress(
    resident_history: List[Dict], posting_info: Dict
) -> Dict[str, Dict[str, Dict[str, int]]]:
    """
    Get detailed progress for each resident's postings

    Output:
      {
        mcr: {
          posting_code: {
            "blocks_completed": int,
            "blocks_required": int,
            "is_completed": bool
          },
          ...
        }
      }
    """
    history_map = parse_resident_history(resident_history)
    progress_map = {}

    for mcr, posting_counts in history_map.items():
        progress_map[mcr] = {}
        for posting_code, blocks_completed in posting_counts.items():
            base_posting = posting_code.split(" (")[0]
            posting_data = posting_info.get(posting_code, {})
            posting_type = posting_data.get("posting_type", "elective")

            if posting_type == "core":
                required_blocks = CORE_REQUIREMENTS.get(base_posting, 0)
            else:
                required_blocks = 1  # Electives require at least 1 block

            progress_map[mcr][posting_code] = {
                "blocks_completed": blocks_completed,
                "blocks_required": required_blocks,
                "is_completed": blocks_completed >= required_blocks,
            }

    return progress_map


def get_core_blocks_completed(
    progress: Dict[str, Dict], posting_info: Dict
) -> Dict[str, int]:
    """
    Given a resident's posting progress and posting_info, return a dict of base core posting name to total blocks completed.

    Example output:
      {
        "GM": 3,
        "GRM": 2,
        "CVM": 3,
      }
    """
    core_blocks = defaultdict(int)
    for posting_code, details in progress.items():
        posting_data = posting_info.get(posting_code, {})
        if posting_data.get("posting_type") == "core":
            base_posting = posting_code.split(" (")[0]
            core_blocks[base_posting] += details.get("blocks_completed", 0)
    return dict(core_blocks)


def get_unique_electives_completed(
    progress: Dict[str, Dict], posting_info: Dict
) -> Set[str]:
    """
    Given a resident's posting progress and posting_info, return the set of unique electives completed.
    """
    unique_electives = set()
    for posting_code, details in progress.items():
        posting_data = posting_info.get(posting_code, {})
        if posting_data.get("posting_type") == "elective":
            blocks_completed = details.get("blocks_completed", 0)
            if is_posting_completed(posting_code, blocks_completed, posting_info):
                unique_electives.add(posting_code)
    return unique_electives


# helpers
def parse_resident_history(resident_history: List[Dict]) -> Dict[str, Dict[str, int]]:
    """
    Parse resident_history (flat array) into a map of mcr -> {posting_code: block_count}

    Example output:
      {
        "R001": {
          "GM (TTSH)": 3,
          "CVM (TTSH)": 2,
        }
      }

    This tracks how many blocks each resident has completed for each posting
    """
    history_map = {}
    for hist in resident_history:
        mcr = hist["mcr"]
        posting_code = hist["posting_code"]
        if mcr not in history_map:
            history_map[mcr] = {}
        if posting_code not in history_map[mcr]:
            history_map[mcr][posting_code] = 0
        history_map[mcr][posting_code] += 1
    return history_map


def is_posting_completed(
    posting_code: str, blocks_completed: int, posting_info: Dict
) -> bool:
    """
    Determine if a posting is completed based on its type and requirements

    Output:
      bool
    """
    # Extract the base posting name (e.g., GM from "GM (TTSH)")
    base_posting = posting_code.split(" (")[0]
    # Get posting info
    posting_data = posting_info.get(posting_code, {})
    posting_type = posting_data.get("posting_type", "elective")

    if posting_type == "core":
        # For core postings, check against CORE_REQUIREMENTS
        required_blocks = CORE_REQUIREMENTS.get(base_posting, 0)
        return blocks_completed >= required_blocks
    else:
        # For elective postings, consider completed if they've done at least 1 block
        # This prevents repeating electives they've already experienced
        return blocks_completed >= 1


CORE_REQUIREMENTS = {
    # total blocks required for each core posting
    "GM": 9,
    "GRM": 2,
    "CVM": 3,
    "RCCM": 3,
    "MICU": 3,
    "ED": 1,
    "NL": 3,
}
