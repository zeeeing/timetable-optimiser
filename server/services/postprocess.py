import sys, os
import json
from typing import Dict, List

# prepend the base directory to sys.path
BASE_DIR = os.path.dirname(os.path.dirname(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from utils import (
    get_posting_progress,
    get_core_blocks_completed,
    get_unique_electives_completed,
    get_ccr_postings_completed,
)


def compute_postprocess(payload: Dict) -> Dict:
    residents_input: List[Dict] = payload.get("residents", [])
    resident_history_input: List[Dict] = payload.get("resident_history", [])
    resident_preferences: List[Dict] = payload.get("resident_preferences", [])
    resident_sr_preferences: List[Dict] = payload.get("resident_sr_preferences", [])
    postings: List[Dict] = payload.get("postings", [])
    weightages: Dict = dict(payload.get("weightages", {}) or {})
    resident_leaves: List[Dict] = payload.get("resident_leaves", [])

    # clone resident entries for mutation
    residents: List[Dict] = [dict(item) for item in residents_input]

    posting_info = {p["posting_code"]: p for p in postings}
    pref_map: Dict[str, Dict[int, str]] = {}
    for pref in resident_preferences:
        mcr = pref.get("mcr")
        if not mcr:
            continue
        rank = int(pref.get("preference_rank"))
        posting_code = pref.get("posting_code")
        if posting_code:
            if mcr not in pref_map:
                pref_map[mcr] = {}
            pref_map[mcr][rank] = posting_code

    # sanitise resident history entries
    output_history: List[Dict] = []
    for h in resident_history_input:
        entry = dict(h)
        entry.setdefault("is_current_year", False)
        entry["is_leave"] = bool(entry.get("is_leave"))
        entry["leave_type"] = entry.get("leave_type", "")
        output_history.append(entry)

    solver_solution: Dict = dict(payload.get("solver_solution", {}) or {})
    if solver_solution:
        entries: List[Dict] = list(solver_solution.get("entries", []) or [])
        leave_map: Dict[str, Dict[int, Dict]] = solver_solution.get("leave_map", {})
        career_progress: Dict[str, Dict] = solver_solution.get("career_progress", {})

        entries_by_resident: Dict[str, List[Dict]] = {}
        for entry in entries:
            mcr = entry.get("mcr")
            b = entry.get("month_block")
            if not mcr or not isinstance(b, int):
                continue
            entries_by_resident.setdefault(mcr, []).append(
                {
                    "month_block": b,
                    "assigned_posting": str(entry.get("assigned_posting", "") or ""),
                    "is_off": bool(entry.get("is_off")),
                }
            )

        for mcr in entries_by_resident:
            entries_by_resident[mcr].sort(key=lambda e: e["month_block"])

        for resident in residents:
            mcr = resident.get("mcr")
            if not mcr:
                continue

            current_year = resident.get("resident_year")
            res_entries = entries_by_resident.get(mcr, [])
            resident_career_progress = career_progress.get(mcr, {}) or {}
            stages_by_block = {
                int(k): v
                for k, v in (
                    resident_career_progress.get("stages_by_block", {}) or {}
                ).items()
            }
            resident_stage = resident_career_progress.get("stage")
            if resident_stage is not None:
                resident["career_stage"] = resident_stage
            if stages_by_block:
                resident["stages_by_block"] = stages_by_block

            # derive starting career blocks from existing history; fall back to metadata
            historical_entries = [
                h
                for h in output_history
                if h.get("mcr") == mcr and not h.get("is_current_year")
            ]

            base_completed = 0
            if historical_entries:
                try:
                    non_leave_blocks = [
                        int(h.get("career_block", 0) or 0)
                        for h in historical_entries
                        if not h.get("is_leave")
                    ]
                    if non_leave_blocks:
                        base_completed = max(non_leave_blocks)
                    else:
                        base_completed = max(
                            int(h.get("career_block", 0) or 0)
                            for h in historical_entries
                        )
                except (TypeError, ValueError):
                    base_completed = 0

            if base_completed == 0:
                fallback = resident_career_progress.get("completed_blocks")
                if fallback is None:
                    fallback = resident.get("career_blocks_completed", 0)
                try:
                    base_completed = int(fallback or 0)
                except (TypeError, ValueError):
                    base_completed = 0

            career_counter = base_completed

            for row in res_entries:
                b = row["month_block"]
                assigned_posting = row.get("assigned_posting", "") or ""

                leave_meta = leave_map.get(mcr, {}).get(b, {}) if leave_map else {}
                leave_type = (leave_meta.get("leave_type", "") or "").strip()
                leave_posting_code = (leave_meta.get("posting_code", "") or "").strip()
                is_leave_block = bool(leave_meta)

                career_block_value = career_counter
                if assigned_posting and not is_leave_block:
                    career_counter += 1
                    career_block_value = career_counter

                posting_code_value = assigned_posting
                if is_leave_block and leave_posting_code:
                    posting_code_value = leave_posting_code
                posting_code_value = str(posting_code_value or "")

                history_entry = {
                    "mcr": mcr,
                    "year": current_year,
                    "month_block": b,
                    "career_block": career_block_value,
                    "posting_code": posting_code_value,
                    "is_current_year": True,
                    "is_leave": is_leave_block,
                    "leave_type": leave_type,
                }
                if stages_by_block:
                    history_entry["career_stage"] = stages_by_block.get(b)

                output_history.append(history_entry)

            resident["career_blocks_completed"] = career_counter

    # ensure career blocks are canonical integers
    for resident in residents:
        try:
            value = resident.get("career_blocks_completed")
            resident["career_blocks_completed"] = int(value)
        except (TypeError, ValueError):
            resident["career_blocks_completed"] = 0

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
        # exclude leave blocks when computing progress-based statistics
        history_without_leave = [
            h for h in updated_resident_history if not h.get("is_leave")
        ]
        updated_resident_progress = get_posting_progress(
            history_without_leave, posting_info
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

        career_blocks_completed = r.get("career_blocks_completed")
        try:
            if career_blocks_completed is not None:
                career_blocks_completed = int(career_blocks_completed)
        except (TypeError, ValueError):
            career_blocks_completed = None

        output_residents.append(
            {
                "mcr": mcr,
                "name": r.get("name"),
                "resident_year": current_year,
                "career_blocks_completed": career_blocks_completed,
                "career_stage": r.get("career_stage"),
                "stages_by_block": r.get("stages_by_block", {}),
                "core_blocks_completed": core_blocks_completed,
                "unique_electives_completed": unique_electives_completed,
                "violations": violations,
                "ccr_status": ccr_status,
            }
        )

    # cohort statistics: optimisation scores and posting utilisation
    preference_bonus_weight = float(weightages.get("preference", 0) or 0)
    seniority_bonus_weight = float(weightages.get("seniority", 0) or 0)

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
            and not h.get("is_leave")
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

    # calculate elective preference satisfaction
    elective_preference_satisfaction = {
        "1st_choice": 0,
        "2nd_choice": 0,
        "3rd_choice": 0,
        "4th_choice": 0,
        "5th_choice": 0,
        "none_met": 0,
        "no_preference": 0,
    }

    for r in residents:
        mcr = r.get("mcr")
        if not mcr:
            continue

        resident_prefs = pref_map.get(mcr, {})
        if not resident_prefs:
            elective_preference_satisfaction["no_preference"] += 1
            continue

        assigned_postings = [
            h.get("posting_code")
            for h in output_history
            if h.get("mcr") == mcr
            and h.get("is_current_year")
            and h.get("posting_code")
            and not h.get("is_leave")
        ]

        if not any(
            resident_prefs[rank] in assigned_postings for rank in resident_prefs
        ):
            elective_preference_satisfaction["none_met"] += 1
            continue

        for rank in sorted(resident_prefs.keys()):
            if resident_prefs[rank] in assigned_postings:
                if 1 <= rank <= 5:
                    choice_key = f"{rank}{'st' if rank == 1 else 'nd' if rank == 2 else 'rd' if rank == 3 else 'th'}_choice"
                    elective_preference_satisfaction[choice_key] += 1
                    break  # count only the highest-ranking preference met

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
            b = int(a.get("month_block", 0))
            if 1 <= b <= 12:
                block_filled[b] += 1
        capacity = int(pinfo.get("max_residents", 0))
        util_per_block = [
            {
                "month_block": block,
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
        "elective_preference_satisfaction": elective_preference_satisfaction,
    }

    return {
        "success": True,
        "residents": output_residents,
        "resident_history": output_history,
        "resident_preferences": resident_preferences,
        "resident_sr_preferences": resident_sr_preferences,
        "postings": postings,
        "resident_leaves": resident_leaves,
        "weightages": weightages,
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
