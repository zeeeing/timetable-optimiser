import sys, os
import json
from typing import Dict, List, Optional

# prepend the base directory to sys.path
BASE_DIR = os.path.dirname(os.path.dirname(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from utils import (
    get_posting_progress,
    get_core_blocks_completed,
    get_unique_electives_completed,
    get_ccr_postings_completed,
    CORE_REQUIREMENTS,
)


def compute_postprocess(
    payload: Dict, constraints_by_resident: Optional[Dict[str, List[Dict]]] = None
) -> Dict:
    residents: List[Dict] = payload.get("residents", [])
    resident_history: List[Dict] = payload.get("resident_history", [])
    resident_preferences: List[Dict] = payload.get("resident_preferences", [])
    resident_sr_preferences: List[Dict] = payload.get("resident_sr_preferences", [])
    postings: List[Dict] = payload.get("postings", [])
    weightages: Dict = payload.get("weightages", {})
    resident_leaves: List[Dict] = payload.get("resident_leaves", [])

    posting_info = {p["posting_code"]: p for p in postings}
    pref_map: Dict[str, Dict[int, str]] = {}
    for pref in resident_preferences:
        mcr = pref.get("mcr")
        if not mcr:
            continue
        pref_map.setdefault(mcr, {})[int(pref.get("preference_rank", 0))] = pref.get(
            "posting_code"
        )

    # sanitise input data
    output_history = []
    for h in resident_history:
        entry = dict(h)
        entry.setdefault("is_current_year", False)
        entry["is_leave"] = bool(entry.get("is_leave"))
        entry["leave_type"] = entry.get("leave_type", "")
        output_history.append(entry)

    # per-resident details
    output_residents: List[Dict] = []
    for r in residents:
        mcr = r.get("mcr")
        if not mcr:
            # skip malformed resident entries
            continue

        current_year = r.get("resident_year")

        # filter by resident to get updated resident progress
        updated_resident_history = [h for h in output_history if h.get("mcr") == mcr]
        # Use full history for progress (ignore leave metadata)
        updated_resident_progress = get_posting_progress(
            updated_resident_history, posting_info
        ).get(mcr, {})

        # derive stats used in the original post-processing section
        core_blocks_completed = get_core_blocks_completed(
            updated_resident_progress, posting_info
        )
        unique_electives_completed = list(
            get_unique_electives_completed(updated_resident_progress, posting_info)
        )
        ccr_postings = get_ccr_postings_completed(
            updated_resident_progress, posting_info
        )
        if ccr_postings:
            ccr_status = {"completed": True, "posting_code": ccr_postings[0]}
        else:
            ccr_status = {"completed": False, "posting_code": "-"}

        violations = []

        output_residents.append(
            {
                "mcr": mcr,
                "name": r.get("name"),
                "resident_year": current_year,
                "core_blocks_completed": core_blocks_completed,
                "unique_electives_completed": unique_electives_completed,
                "violations": violations,
                "ccr_status": ccr_status,
            }
        )

    # cohort statistics: optimisation scores and posting utilisation
    preference_bonus_weight = weightages.get("preference")
    seniority_bonus_weight = weightages.get("seniority")

    # calculate optimisation scores
    optimisation_scores: List[float] = []
    for r in residents:
        mcr = r.get("mcr")
        if not mcr:
            optimisation_scores.append(0)
            continue
        resident_year = r.get("resident_year", 1)
        assigned_postings = [
            h
            for h in output_history
            if h.get("mcr") == mcr
            and h.get("is_current_year")
            and h.get("posting_code")
        ]

        # preference satisfaction
        resident_prefs = pref_map.get(mcr, {})
        preference_score = 0
        for h in assigned_postings:
            assigned_posting = h.get("posting_code")
            if not assigned_posting:
                continue
            for rank in range(1, 6):
                if resident_prefs.get(rank) == assigned_posting:
                    preference_score += (6 - rank) * preference_bonus_weight
                    break

        # seniority bonus proportional to number of assignments
        seniority_bonus = (
            len(assigned_postings) * resident_year * seniority_bonus_weight
        )
        optimisation_scores.append(preference_score + seniority_bonus)

    max_actual = max(optimisation_scores) if optimisation_scores else 1
    optimisation_scores_normalised = [
        round((s / max_actual) * 100, 2) if max_actual > 0 else 0
        for s in optimisation_scores
    ]

    # calculate posting utilisation by block
    # precompute capacity fill for diagnostics
    posting_util: List[Dict] = []
    cap_fill: Dict[str, Dict[int, int]] = {}
    for posting_code, pinfo in posting_info.items():
        assignments = [
            h
            for h in output_history
            if h.get("posting_code") == posting_code and h.get("is_current_year")
        ]
        block_filled = {block: 0 for block in range(1, 13)}
        for a in assignments:
            b = int(a.get("block", 0))
            if 1 <= b <= 12:
                block_filled[b] += 1
        capacity = int(pinfo.get("max_residents", 0))
        util_per_block = [
            {
                "block": block,
                "filled": count,
                "capacity": capacity,
                "is_over_capacity": count > capacity,
            }
            for block, count in block_filled.items()
        ]
        posting_util.append(
            {"posting_code": posting_code, "util_per_block": util_per_block}
        )
        cap_fill[posting_code] = block_filled

    # aggregate cohort statistics
    cohort_statistics = {
        "optimisation_scores": optimisation_scores,
        "optimisation_scores_normalised": optimisation_scores_normalised,
        "posting_util": posting_util,
    }

    # DEBUG: explain OFF (unassigned) blocks heuristically
    off_explanations_by_resident = compute_off_explanations(
        residents=residents,
        output_history=output_history,
        posting_info=posting_info,
        cap_fill=cap_fill,
    )

    return {
        "success": True,
        "residents": output_residents,
        "resident_history": output_history,
        "resident_preferences": resident_preferences,
        "resident_sr_preferences": resident_sr_preferences,
        "postings": postings,
        "resident_leaves": resident_leaves,
        "statistics": {
            "total_residents": len(residents),
            "cohort": cohort_statistics,
        },
        "diagnostics": {
            "off_explanations_by_resident": off_explanations_by_resident,
        },
    }


def compute_off_explanations(
    *,
    residents: List[Dict],
    output_history: List[Dict],
    posting_info: Dict[str, Dict],
    cap_fill: Dict[str, Dict[int, int]],
) -> Dict[str, List[Dict]]:
    """
    Build a heuristic explanation for why certain current-year blocks remain OFF
    (unassigned). For each resident and each unfilled block, list postings that
    are feasible and reasons why others are not (capacity, start rules, etc.).
    """
    quarter_starts = {1, 4, 7, 10}
    off_explanations_by_resident: Dict[str, List[Dict]] = {}

    # Build per-resident current-year map for quick lookup
    cy_by_mcr: Dict[str, Dict[int, str]] = {}
    for h in output_history:
        if not h.get("is_current_year"):
            continue
        mcr = h.get("mcr")
        b = int(h.get("block", 0))
        if not mcr or b <= 0:
            continue
        cy_by_mcr.setdefault(mcr, {})[b] = h.get("posting_code")

    for r in residents:
        mcr = r.get("mcr")
        if not mcr:
            continue
        cy_blocks = cy_by_mcr.get(mcr, {})
        # resident progress incl. all years
        progress = get_posting_progress(output_history, posting_info).get(mcr, {})
        completed_electives = set(
            p.split(" (")[0]
            for p in get_unique_electives_completed(progress, posting_info)
        )

        entries: List[Dict] = []
        for b in range(1, 13):
            if b in cy_blocks:
                continue  # already assigned
            reasons_by_posting: Dict[str, List[str]] = {}
            feasible: List[str] = []

            for p, pinfo in posting_info.items():
                reasons: List[str] = []
                # 1) capacity at this block
                cap_map = cap_fill.get(p, {})
                cap = int(pinfo.get("max_residents", 0))
                filled_b = int(cap_map.get(b, 0))
                if filled_b >= cap:
                    reasons.append("capacity_full")

                # 2) start rules
                dur = int(pinfo.get("required_block_duration", 1))
                # quarter starts for 3-month runs
                if dur == 3 and b not in quarter_starts:
                    reasons.append("start_month_disallowed_for_3m")
                # GRM must start on odd block numbers
                if str(p).startswith("GRM (") and b % 2 == 0:
                    reasons.append("grm_even_start_disallowed")
                # cannot cross Dec(6) - Jan(7)
                if dur > 1:
                    end_b = b + dur - 1
                    if b <= 6 and end_b >= 7:
                        reasons.append("crosses_dec_jan_boundary")
                    # capacity across full run
                    for t in range(b, min(end_b, 12) + 1):
                        if int(cap_map.get(t, 0)) >= cap:
                            reasons.append(f"capacity_full_at_{t}")

                # 3) elective base uniqueness
                if pinfo.get("posting_type") == "elective":
                    base = str(p).split(" (")[0]
                    if base in completed_electives:
                        reasons.append("elective_base_already_completed")

                if not reasons:
                    feasible.append(p)
                reasons_by_posting[p] = reasons

            if feasible or any(reasons_by_posting.values()):
                entries.append(
                    {
                        "block": b,
                        "feasible_postings": feasible,
                        "reasons_by_posting": reasons_by_posting,
                    }
                )

        if entries:
            off_explanations_by_resident[mcr] = entries

    return off_explanations_by_resident


def main():
    try:
        if len(sys.argv) != 2:
            print(
                json.dumps(
                    {
                        "success": False,
                        "error": "Usage: python postprocess.py <input_json_file>",
                    }
                )
            )
            return
        with open(sys.argv[1], "r") as f:
            payload = json.load(f)
        result = compute_postprocess(payload)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))


if __name__ == "__main__":
    main()
