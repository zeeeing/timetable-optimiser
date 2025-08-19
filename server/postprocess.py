import sys
import json
from typing import Dict, List, Optional

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
    postings: List[Dict] = payload.get("postings", [])
    weightages: Dict = payload.get("weightages", {})

    # Build maps
    posting_info = {p["posting_code"]: p for p in postings}
    pref_map: Dict[str, Dict[int, str]] = {}
    for pref in resident_preferences:
        mcr = pref.get("mcr")
        if not mcr:
            continue
        pref_map.setdefault(mcr, {})[int(pref.get("preference_rank", 0))] = pref.get(
            "posting_code"
        )

    # Ensure is_current_year key is present (default to False) for consistency
    output_history = []
    for h in resident_history:
        entry = dict(h)
        entry.setdefault("is_current_year", False)
        output_history.append(entry)

    # Per-resident details
    output_residents: List[Dict] = []
    for r in residents:
        mcr = r.get("mcr")
        if not mcr:
            # skip malformed resident entries
            continue

        current_year = r.get("resident_year")

        # filter by resident to get updated resident progress
        updated_resident_history = [h for h in output_history if h.get("mcr") == mcr]
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

        # constraints: use provided if available; otherwise compute heuristically
        if constraints_by_resident is not None:
            constraints = constraints_by_resident.get(mcr, [])
        else:
            constraints = []

            # 1) MICU / RCCM penalties (Y1 vs others)
            year = r.get("resident_year")
            # completed historical blocks for MICU/RCCM where posting is completed
            hist_micu = sum(
                rec.get("blocks_completed", 0)
                for p, rec in updated_resident_progress.items()
                if p.startswith("MICU (") and rec.get("is_completed", False)
            )
            hist_rccm = sum(
                rec.get("blocks_completed", 0)
                for p, rec in updated_resident_progress.items()
                if p.startswith("RCCM (") and rec.get("is_completed", False)
            )

            # current-year assignments count
            micu_blocks = sum(
                1
                for h in updated_resident_history
                if h.get("is_current_year")
                and str(h.get("posting_code", "")).startswith("MICU (")
            )
            rccm_blocks = sum(
                1
                for h in updated_resident_history
                if h.get("is_current_year")
                and str(h.get("posting_code", "")).startswith("RCCM (")
            )

            if year == 1:
                req_micu = 1
                req_rccm = 2
            else:
                req_micu = CORE_REQUIREMENTS.get("MICU", 3)
                req_rccm = CORE_REQUIREMENTS.get("RCCM", 3)

            micu_missing = max(0, int(req_micu) - int(hist_micu + micu_blocks))
            rccm_missing = max(0, int(req_rccm) - int(hist_rccm + rccm_blocks))
            micu_rccm_bonus_weight = weightages.get("micu_rccm_bonus", 5)
            if micu_missing > 0:
                constraints.append(
                    {
                        "type": "penalty",
                        "category": "micu_requirement",
                        "description": f"Missing {micu_missing} MICU block(s) (Required for Y{year}: {req_micu})",
                        "penalty_value": micu_missing * micu_rccm_bonus_weight,
                    }
                )
            if rccm_missing > 0:
                constraints.append(
                    {
                        "type": "penalty",
                        "category": "rccm_requirement",
                        "description": f"Missing {rccm_missing} RCCM block(s) (Required for Y{year}: {req_rccm})",
                        "penalty_value": rccm_missing * micu_rccm_bonus_weight,
                    }
                )

            # 2) Elective shortfall penalties (Y2/Y3)
            if year in (2, 3):
                hist_electives = len(
                    get_unique_electives_completed(
                        updated_resident_progress, posting_info
                    )
                )
                selection_count = sum(
                    1
                    for h in updated_resident_history
                    if h.get("is_current_year")
                    and posting_info.get(h.get("posting_code"), {}).get("posting_type")
                    == "elective"
                )

                resident_prefs = pref_map.get(mcr, {})
                required = 5 if year == 3 else (1 if not resident_prefs else 2)
                elective_shortfall_penalty_weight = weightages.get(
                    "elective_shortfall_penalty", 5
                )
                missing_elec = max(
                    0, int(required) - int(hist_electives + selection_count)
                )
                if missing_elec > 0:
                    constraints.append(
                        {
                            "type": "penalty",
                            "category": "elective_shortfall",
                            "description": f"Missing {missing_elec} elective(s) (Required for Y{year}: {required})",
                            "penalty_value": missing_elec
                            * elective_shortfall_penalty_weight,
                        }
                    )

            # 3) Core shortfall penalties (Y3)
            if year == 3:
                core_shortfall_penalty_weight = weightages.get(
                    "core_shortfall_penalty", 10
                )
                # historical core blocks per base
                for base, required in CORE_REQUIREMENTS.items():
                    hist_done = int(core_blocks_completed.get(base, 0))
                    assigned = sum(
                        1
                        for h in updated_resident_history
                        if h.get("is_current_year")
                        and str(h.get("posting_code", "")).split(" (")[0] == base
                    )
                    shortfall = max(0, int(required) - int(hist_done + assigned))
                    if shortfall > 0:
                        constraints.append(
                            {
                                "type": "penalty",
                                "category": "core_shortfall",
                                "description": f"Missing {shortfall} months(s) of {base} (Required: {required})",
                                "penalty_value": shortfall
                                * core_shortfall_penalty_weight,
                            }
                        )

        output_residents.append(
            {
                "mcr": mcr,
                "name": r.get("name"),
                "resident_year": current_year,
                "core_blocks_completed": core_blocks_completed,
                "unique_electives_completed": unique_electives_completed,
                "constraints": constraints,
                "ccr_status": ccr_status,
            }
        )

    # Cohort statistics: optimisation scores and posting utilisation
    preference_bonus_weight = weightages.get("preference", 1)
    seniority_bonus_weight = weightages.get("seniority", 2)

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
            if h.get("mcr") == mcr and h.get("is_current_year")
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

    # Posting utilisation by block
    posting_util: List[Dict] = []
    for posting_code, pinfo in posting_info.items():
        # current-year assignments only
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

    cohort_statistics = {
        "optimisation_scores": optimisation_scores,
        "optimisation_scores_normalised": optimisation_scores_normalised,
        "posting_util": posting_util,
    }

    return {
        "success": True,
        "residents": output_residents,
        "resident_history": output_history,
        "resident_preferences": resident_preferences,
        "postings": postings,
        "statistics": {
            "total_residents": len(residents),
            "cohort": cohort_statistics,
        },
    }


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
