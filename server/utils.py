from typing import List, Dict, Set


def parse_resident_history(resident_history: List[Dict]) -> Dict[str, Set[str]]:
    """
    Parse resident_history (flat array) into a map of mcr -> set of completed postings
    """
    history_map = {}
    for entry in resident_history:
        mcr = entry["mcr"]
        posting_code = entry["posting_code"]
        if mcr not in history_map:
            history_map[mcr] = set()
        history_map[mcr].add(posting_code)
    return history_map
