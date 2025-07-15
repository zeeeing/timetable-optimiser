from typing import List, Dict, Set


def parse_resident_history(residents: List[Dict]) -> Dict[str, Set[str]]:
    """
    Parse resident history into a map of mcr -> set of completed postings
    """
    history_map = {}
    for resident in residents:
        completed_postings = set()
        for year_data in resident.get("past_history", []):
            for block in year_data.get("blocks", []):
                if block.get("posting"):
                    completed_postings.add(block["posting"])
        history_map[resident["mcr"]] = completed_postings
    return history_map


def get_posting_assignments(resident, num_blocks=12):
    """
    Get a resident's posting assignments across all blocks
    Returns a list of (block_num, posting) tuples
    """
    assignments = []
    for year_data in resident.get("past_history", []):
        for block in year_data.get("blocks", []):
            if block.get("posting"):
                assignments.append((block["block"], block["posting"]))
    return assignments
