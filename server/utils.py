from typing import List, Dict, Set


def get_completed_postings(
    resident_history: List[Dict], posting_info: Dict[str, Dict]
) -> Dict[str, Set[str]]:
    """
    Get the set of completed postings for each resident

    Output:
      {
        mcr_1: {
          posting_code_1,
          posting_code_2,
          ...
        },
        ...
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
    resident_history: List[Dict], posting_info: Dict[str, Dict]
) -> Dict[str, Dict[str, Dict[str, int]]]:
    """
    Get detailed progress for each posting for each resident

    Output:
      {
        mcr_1: {
          posting_code_1: {
            "blocks_completed": int,
            "blocks_required": int,
            "is_completed": bool
          },
          ...
        },
        ...
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
                # Electives require at least 1 block to be considered completed
                required_blocks = 1

            progress_map[mcr][posting_code] = {
                "blocks_completed": blocks_completed,
                "blocks_required": required_blocks,
                "is_completed": blocks_completed >= required_blocks,
            }

    return progress_map


def get_core_blocks_completed(
    resident_progress: Dict[str, Dict], posting_info: Dict[str, Dict]
) -> Dict[str, int]:
    """
    Given a resident's posting progress and posting info,
    return a dictionary of base core posting names to total blocks completed.

    Example output:
      {
        "GM": 3,
        "GRM": 2,
        ...
      }
    """
    core_blocks = {}
    for base_posting in CORE_REQUIREMENTS:
        core_blocks[base_posting] = 0
    for posting_code, details in resident_progress.items():
        posting_data = posting_info.get(posting_code, {})
        if posting_data.get("posting_type") == "core":
            base_posting = posting_code.split(" (")[0]
            core_blocks[base_posting] += details.get("blocks_completed", 0)
    return core_blocks


def get_unique_electives_completed(
    resident_progress: Dict[str, Dict], posting_info: Dict
) -> Set[str]:
    """
    Given a resident's posting progress and posting info,
    return the set of unique electives completed.

    Example output:
      {
        "Rehab (TTSH)",
        "Endocrine (KTPH)",
        ...
      }
    """
    unique_electives = set()
    for posting_code, details in resident_progress.items():
        posting_data = posting_info.get(posting_code, {})
        if posting_data.get("posting_type") == "elective":
            blocks_completed = details.get("blocks_completed", 0)
            if is_posting_completed(posting_code, blocks_completed, posting_info):
                unique_electives.add(posting_code)
    return unique_electives


def get_ccr_postings_completed(
    resident_progress: Dict[str, Dict[str, int]],
    posting_info: Dict[str, Dict],
) -> List[str]:
    """
    Return all CCR posting codes completed (blocks_completed == required_block_duration),
    or None if none fully completed.
    """
    completed_postings = []
    for p in CCR_POSTINGS:
        blocks_completed = resident_progress.get(p, {}).get("blocks_completed", 0)
        required_block_duration = posting_info.get(p, {}).get(
            "required_block_duration", 0
        )
        if blocks_completed == required_block_duration:
            completed_postings.append(p)
    return completed_postings


# helpers
def parse_resident_history(resident_history: List[Dict]) -> Dict[str, Dict[str, int]]:
    """
    Parse resident history (flat array) into a dictionary of mcr to {posting_code: block_count}

    Example output:
      {
        "M123123A": {
          "GM (TTSH)": 3,
          "CVM (TTSH)": 2,
          ...
        },
        ...
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


# constants
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

CCR_POSTINGS = ["GM (NUH)", "GM (SGH)", "GM (CGH)", "GM (SKH)", "GM (WH)"]
