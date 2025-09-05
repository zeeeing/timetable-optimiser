from typing import List, Dict, Set


def get_completed_postings(
    resident_history: List[Dict], posting_info: Dict[str, Dict]
) -> Dict[str, Set[str]]:
    """
    Returns a dictionary mapping each resident to a set of unique postings completed.

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
            if is_unique_posting_completed(
                posting_code, blocks_completed, posting_info
            ):
                completed_postings_map[mcr].add(posting_code)

    return completed_postings_map


def get_posting_progress(
    resident_history: List[Dict], posting_info: Dict[str, Dict]
) -> Dict[str, Dict[str, Dict[str, int]]]:
    """
    Get detailed progress of each resident's postings.

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
            required_blocks = posting_info.get(posting_code, {}).get(
                "required_block_duration"
            )

            progress_map[mcr][posting_code] = {
                "blocks_completed": blocks_completed,
                "blocks_required": required_blocks,
                "is_completed": (
                    blocks_completed >= required_blocks
                    if required_blocks is not None
                    else False
                ),
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
            if is_unique_posting_completed(
                posting_code, blocks_completed, posting_info
            ):
                unique_electives.add(posting_code)

    return unique_electives


def get_ccr_postings_completed(
    resident_progress: Dict[str, Dict[str, int]],
    posting_info: Dict[str, Dict],
) -> List[str]:
    """
    Returns a list of all CCR posting codes completed.
    """
    completed_postings = []
    for p in CCR_POSTINGS:
        blocks_completed = resident_progress.get(p, {}).get("blocks_completed", 0)
        required_block_duration = posting_info.get(p, {}).get("required_block_duration")

        if blocks_completed == required_block_duration:
            completed_postings.append(p)

    return completed_postings


def to_snake_case(posting_code: str) -> str:
    return (
        posting_code.lower()
        .replace(" ", "_")
        .replace("(", "")
        .replace(")", "")
        .replace("-", "_")
    )


# helpers
def parse_resident_history(resident_history: List[Dict]) -> Dict[str, Dict[str, int]]:
    """
    Returns a dictionary mapping each resident to a dictionary of posting codes. This dictionary maps each posting code to the number of blocks completed.

    Example output:
      {
        "M123123A": {
          "GM (TTSH)": 3,
          "CVM (TTSH)": 2,
          ...
        },
        ...
      }
    """
    history_map = {}
    for hist in resident_history:
        mcr = hist["mcr"]
        posting_code = hist.get("posting_code")

        if mcr not in history_map:
            history_map[mcr] = {}

        if posting_code not in history_map[mcr]:
            history_map[mcr][posting_code] = 0

        history_map[mcr][posting_code] += 1

    return history_map


def is_unique_posting_completed(
    posting_code: str, blocks_completed: int, posting_info: Dict
) -> bool:
    """
    Determine if a unique posting is completed based on blocks completed == required blocks.
    """
    required_blocks = posting_info.get(posting_code, {}).get("required_block_duration")

    return blocks_completed >= required_blocks if required_blocks is not None else False


def variants_for_base(base: str, posting_codes: List[Dict[str, Dict]]) -> List[str]:
    if not base:
        return []
    return [p for p in posting_codes if p.split(" (")[0] == base]


# constants
CORE_REQUIREMENTS = {
    # total blocks required for each core posting
    "GM": 6,
    "GRM": 2,
    "CVM": 3,
    "RCCM": 3,
    "MICU": 3,
    "ED": 1,
    "NL": 3,
}

CCR_POSTINGS = ["GM (NUH)", "GM (SGH)", "GM (CGH)", "GM (SKH)"]
