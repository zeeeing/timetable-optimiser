import json
import sys
from typing import List, Dict
from ortools.sat.python import cp_model
from utils import (
    get_completed_postings,
    get_posting_progress,
    get_core_blocks_completed,
    get_unique_electives_completed,
    get_ccr_postings_completed,
    to_snake_case,
    CORE_REQUIREMENTS,
    CCR_POSTINGS,
)
import logging

logging.basicConfig(
    level=logging.INFO,
    stream=sys.stderr,
    format="%(asctime)s %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)


def allocate_timetable(
    residents: List[Dict],
    resident_history: List[Dict],
    resident_preferences: List[Dict],
    postings: List[Dict],
    weightages: Dict,
) -> Dict:

    ###########################################################################
    # SET UP
    ###########################################################################

    # instantiate the cp-sat model
    logger.info("STARTING POSTING ALLOCATION SERVICE")
    model = cp_model.CpModel()

    # some background on the assumption variables

    # `.OnlyEnforceIf(assumption_var)`
    # makes your constraint conditional on that literal

    # `model.AddBoolOr([assumption_var])`
    # forces that literal to be true (so the constraint is in effect)
    # and makes it show up in the unsat-core if it must be
    # (i.e. if the solver has to set it false to solve the model)

    assumption_vars = {}

    ###########################################################################
    # DEFINE VARIABLES
    ###########################################################################

    # 0. define list of all unique elective base codes
    ELECTIVE_BASE_CODES = [
        p["posting_code"].split(" (")[0]
        for p in postings
        if p.get("posting_type") == "elective"
    ]

    # 1. create map of posting codes to posting info
    posting_info = {p["posting_code"]: p for p in postings}

    # 2. create list of posting codes
    posting_codes = list(posting_info.keys())

    # 3. create list of blocks
    blocks = list(range(1, 13))

    # 4. create map of resident mcr to their preferences
    pref_map = {}
    for pref in resident_preferences:
        mcr = pref["mcr"]
        if mcr not in pref_map:
            pref_map[mcr] = {}
        pref_map[mcr][pref["preference_rank"]] = pref["posting_code"]

    # 5. get completed postings for each resident
    completed_postings_map = get_completed_postings(resident_history, posting_info)

    # 6. get posting progress for each resident
    posting_progress = get_posting_progress(resident_history, posting_info)

    ###########################################################################
    # CREATE DECISION VARIABLES
    ###########################################################################

    x = {}
    for resident in residents:
        mcr = resident["mcr"]
        x[mcr] = {}
        for posting_code in posting_codes:
            x[mcr][posting_code] = {}
            for block in blocks:
                x[mcr][posting_code][block] = model.NewBoolVar(
                    f"x_{mcr}_{posting_code}_{block}"
                )

    ###########################################################################
    # DEFINE CONSTRAINTS
    ###########################################################################

    # General Constraint 1: Each resident must be assigned to one posting per block
    for resident in residents:
        mcr = resident["mcr"]
        for block in blocks:
            model.AddExactlyOne(
                x[mcr][posting_code][block] for posting_code in posting_codes
            )

    # General Constraint 2: Each posting block cannot exceed max residents
    for posting_code in posting_codes:
        max_residents = posting_info[posting_code]["max_residents"]

        for block in blocks:
            model.Add(
                sum(x[r["mcr"]][posting_code][block] for r in residents)
                <= max_residents
            )

    # General Constraint 3: Residents can't be assigned to postings they've already completed
    # for resident in residents:
    #     mcr = resident["mcr"]
    #     resident_completed_postings = completed_postings_map.get(mcr, set())
    #     for posting_code in resident_completed_postings:
    #         if posting_code in x[mcr]:
    #             for block in blocks:
    #                 model.Add(x[mcr][posting_code][block] == 0)

    # General Constraint 4: Enforce required_block_duration happens in consecutive blocks
    for resident in residents:
        mcr = resident["mcr"]
        for posting_code in posting_codes:
            required_duration = posting_info[posting_code]["required_block_duration"]

            num_blocks = len(blocks)
            window_vars = []

            for start in range(1, num_blocks - required_duration + 2):
                window = [
                    x[mcr][posting_code][block]
                    for block in range(start, start + required_duration)
                ]
                window_var = model.NewBoolVar(
                    f"window_{mcr}_{to_snake_case(posting_code)}_{start}"
                )
                window_vars.append(window_var)

                # Link window_var to whether this window is filled
                model.AddBoolAnd(window).OnlyEnforceIf(window_var)
                model.AddBoolOr([b.Not() for b in window]).OnlyEnforceIf(
                    window_var.Not()
                )

            # create "assigned" variable - whether the posting is assigned at all
            assigned = model.NewBoolVar(f"assigned_{mcr}_{to_snake_case(posting_code)}")
            x[mcr][posting_code]["assigned_var"] = assigned

            model.Add(sum(window_vars) == 1).OnlyEnforceIf([assigned])
            model.Add(sum(window_vars) == 0).OnlyEnforceIf(assigned.Not())

            model.Add(
                sum(x[mcr][posting_code][block] for block in blocks)
                == required_duration * assigned
            )

    # General Constraint 5 (CCR): Ensure only one CCR posting is ever assigned per resident
    for resident in residents:
        mcr = resident["mcr"]
        resident_year = resident["resident_year"]
        resident_progress = posting_progress.get(mcr, {})

        # determine if they’ve already done a CCR
        completed_ccr_list = get_ccr_postings_completed(resident_progress, posting_info)
        completed_ccr = completed_ccr_list[0] if completed_ccr_list else None

        if len(completed_ccr_list) > 1:
            logger.warning(f"Resident {mcr} has completed more than one CCR posting")

        # If completed or year 1, prevent assignment to all CCR postings in any block
        if completed_ccr or resident_year == 1:
            for posting_code in CCR_POSTINGS:
                if posting_code in posting_codes:
                    for block in blocks:
                        model.Add(x[mcr][posting_code][block] == 0)

        # Only assign CCR to Year 2 or 3 residents who haven't completed a CCR posting
        elif resident_year in (2, 3):
            ccr_assigned_vars = [
                x[mcr][p]["assigned_var"] for p in CCR_POSTINGS if p in posting_codes
            ]
            # Must be exactly 1 CCR posting
            if ccr_assigned_vars:
                model.Add(sum(ccr_assigned_vars) == 1)

    # General Constraint 6: Ensure core postings are not over-assigned to each resident
    for resident in residents:
        mcr = resident["mcr"]
        resident_progress = posting_progress.get(mcr, {})
        core_blocks_completed_map = get_core_blocks_completed(
            resident_progress, posting_info
        )

        for base_posting, required_blocks in CORE_REQUIREMENTS.items():
            blocks_completed = core_blocks_completed_map.get(base_posting, 0)

            assigned_blocks = sum(
                x[mcr][posting_code][block]
                for posting_code in posting_codes
                if posting_code.split(" (")[0] == base_posting
                for block in blocks
            )

            if blocks_completed >= required_blocks:
                model.Add(assigned_blocks == 0)
            else:
                model.Add(blocks_completed + assigned_blocks <= required_blocks)

    # # General Constraint 7: Prevent residents from repeating the same elective regardless of hospital
    # for resident in residents:
    #     mcr = resident["mcr"]
    #     resident_progress = posting_progress.get(mcr, {})
    #     completed_electives = get_unique_electives_completed(
    #         resident_progress, posting_info
    #     )
    #     completed_elective_bases = {p.split(" (")[0] for p in completed_electives}

    #     for elective_base in ELECTIVE_BASE_CODES:
    #         # elective postings of current base
    #         possible_postings = [
    #             p
    #             for p in posting_codes
    #             if p.startswith(elective_base + " (")
    #             and posting_info[p].get("posting_type") == "elective"
    #         ]

    #         # re-use the assigned_var set up earlier
    #         assigned_vars = [x[mcr][p]["assigned_var"] for p in possible_postings]

    #         if elective_base in completed_elective_bases:
    #             # elective done
    #             model.Add(sum(assigned_vars) == 0)
    #         else:
    #             # elective not done; allow at most 1 elective
    #             model.Add(sum(assigned_vars) <= 1)

    # # General Constraint 8a: MICU and RCCM must be from a single institution per resident
    # institutions = set(
    #     p.split(" (")[1].rstrip(")")
    #     for p in posting_codes
    #     if p.startswith("MICU (") or p.startswith("RCCM (")
    # )

    # for resident in residents:
    #     mcr = resident["mcr"]

    #     # build flag per institution
    #     # "did we assign any MICU/RCCM from this institution?"
    #     micu_rccm_inst_flags = []
    #     for inst in institutions:
    #         micu_postings = [
    #             p for p in posting_codes if p.startswith("MICU (") and f"({inst})" in p
    #         ]
    #         rccm_postings = [
    #             p for p in posting_codes if p.startswith("RCCM (") and f"({inst})" in p
    #         ]
    #         micu_rccm_postings = micu_postings + rccm_postings

    #         if not micu_rccm_postings:
    #             continue

    #         # Boolean var: true if any MICU/RCCM from this institution is assigned
    #         inst_used = model.NewBoolVar(f"{mcr}_uses_micu_rccm_{inst}")
    #         model.Add(
    #             sum(x[mcr][p][b] for p in micu_rccm_postings for b in blocks) >= 1
    #         ).OnlyEnforceIf(inst_used)
    #         model.Add(
    #             sum(x[mcr][p][b] for p in micu_rccm_postings for b in blocks) == 0
    #         ).OnlyEnforceIf(inst_used.Not())

    #         micu_rccm_inst_flags.append(inst_used)

    #     # only one institution's MICU/RCCM can be used per resident
    #     model.Add(sum(micu_rccm_inst_flags) <= 1)

    # # General Constraint 8b: MICU and RCCM must be assigned in contiguous blocks (no breaks)
    # for resident in residents:
    #     mcr = resident["mcr"]

    #     for inst in institutions:
    #         micu_postings = [
    #             p for p in posting_codes if p.startswith("MICU (") and f"({inst})" in p
    #         ]
    #         rccm_postings = [
    #             p for p in posting_codes if p.startswith("RCCM (") and f"({inst})" in p
    #         ]
    #         micu_rccm_postings = micu_postings + rccm_postings

    #         if not micu_rccm_postings:
    #             continue

    #         assigned = []
    #         for b in blocks:
    #             var = model.NewBoolVar(f"{mcr}_{inst}_micurccm_block_{b}")
    #             assigned.append(var)
    #             model.AddMaxEquality(var, [x[mcr][p][b] for p in micu_rccm_postings])

    #         # track first and last block of this contiguous segment
    #         first = model.NewIntVar(0, len(blocks) - 1, f"{mcr}_{inst}_micurccm_first")
    #         last = model.NewIntVar(0, len(blocks) - 1, f"{mcr}_{inst}_micurccm_last")

    #         model.AddMinEquality(first, [b for b, var in zip(blocks, assigned)])
    #         model.AddMaxEquality(last, [b for b, var in zip(blocks, assigned)])

    #         model.Add(last - first + 1 <= 2)

    #         # define min/max indicators for first/last
    #         model.AddMinEquality(first, [b for b, var in zip(blocks, assigned)])
    #         model.AddMaxEquality(last, [b for b, var in zip(blocks, assigned)])

    #         # force that all blocks between first and last are fully filled
    #         for b, var in zip(blocks, assigned):
    #             in_range = model.NewBoolVar(f"{mcr}_{inst}_micurccm_inrange_{b}")

    #             model.Add(b >= first).OnlyEnforceIf(in_range)
    #             model.Add(b < first).OnlyEnforceIf(in_range.Not())
    #             model.Add(b <= last).OnlyEnforceIf(in_range)
    #             model.Add(b > last).OnlyEnforceIf(in_range.Not())

    #             # if in range, must be assigned (== 1)
    #             model.Add(var == 1).OnlyEnforceIf(in_range)

    # Y1 Constraint 1: GM capped at 3 blocks in Year 1
    gm_ktph_bonus_value = 2
    gm_ktph_bonus = []

    for resident in residents:
        mcr = resident["mcr"]
        if resident["resident_year"] == 1:
            gm_blocks_count = sum(
                x[mcr][p][b]
                for p in posting_codes
                if p.split(" (")[0] == "GM"
                for b in blocks
            )

            model.Add(gm_blocks_count <= 3)

            # bonus for assigning GM (KTPH)
            ktph_bonus = sum(
                x[mcr][p][b] for p in posting_codes if p == "GM (KTPH)" for b in blocks
            )
            gm_ktph_bonus.append(gm_ktph_bonus_value * ktph_bonus)

    ###########################################################################
    # DEFINE SOFT CONSTRAINTS WITH PENALTIES
    ###########################################################################

    curr_deviation_penalties = []
    curr_deviation_penalty_vars = {}
    curr_deviation_penalty_weight = weightages.get("curr_deviation_penalty", 10)

    # General Soft Constraint 1: 6-block window with 1 ED + 2 GRM + 3 GM and ED/GRM adjacent
    for resident in residents:
        mcr = resident["mcr"]
        history = get_core_blocks_completed(posting_progress.get(mcr, {}), posting_info)

        # if they've done any ED, GRM or GM before, skip penalty
        if any(history.get(base, 0) > 0 for base in ("ED", "GRM", "GM")):
            # define a zero-penalty IntVar so it still appears in the penalty dict
            zero_pen = model.NewIntVar(0, 0, f"ed_grm_gm_penalty_{mcr}")
            curr_deviation_penalties.append(curr_deviation_penalty_weight * zero_pen)
            curr_deviation_penalty_vars[f"ed_grm_gm_penalty_{mcr}"] = zero_pen
            continue

        # otherwise, build the sliding-window deviation vars
        # slide a length-6 window from block 1 to block len(blocks)−5
        window_dev_vars = []
        for start in range(1, len(blocks) - 6 + 2):
            win = range(start, start + 6)
            # count how many blocks in this window are ED, GRM, GM
            ed_cnt = sum(
                x[mcr][p][b]
                for p in posting_codes
                if posting_info[p].get("posting_type") == "core"
                and p.split(" (")[0] == "ED"
                for b in win
            )
            grm_cnt = sum(
                x[mcr][p][b]
                for p in posting_codes
                if posting_info[p].get("posting_type") == "core"
                and p.split(" (")[0] == "GRM"
                for b in win
            )
            gm_cnt = sum(
                x[mcr][p][b]
                for p in posting_codes
                if posting_info[p].get("posting_type") == "core"
                and p.split(" (")[0] == "GM"
                for b in win
            )

            # deviation from the ideal (1,2,3)
            ed_dev = model.NewIntVar(0, 6, f"ed_dev_{mcr}_{start}")
            model.Add(ed_dev >= ed_cnt - 1)
            model.Add(ed_dev >= 1 - ed_cnt)

            grm_dev = model.NewIntVar(0, 6, f"grm_dev_{mcr}_{start}")
            model.Add(grm_dev >= grm_cnt - 2)
            model.Add(grm_dev >= 2 - grm_cnt)

            gm_dev = model.NewIntVar(0, 6, f"gm_dev_{mcr}_{start}")
            model.Add(gm_dev >= gm_cnt - 3)
            model.Add(gm_dev >= 3 - gm_cnt)

            # total deviation for this window
            window_dev = model.NewIntVar(0, 12, f"window_dev_{mcr}_{start}")
            model.Add(window_dev == ed_dev + grm_dev + gm_dev)

            window_dev_vars.append(window_dev)

        # pick minimum deviation across all windows
        overall_dev = model.NewIntVar(0, 12, f"ed_grm_gm_penalty_{mcr}")
        if window_dev_vars:
            model.AddMinEquality(overall_dev, window_dev_vars)
        else:
            # no possible window → maximum deviation
            model.Add(overall_dev == 6)  # or len(blocks)

        # add to your penalty list (weighted)
        curr_deviation_penalties.append(curr_deviation_penalty_weight * overall_dev)
        curr_deviation_penalty_vars[f"ed_grm_gm_penalty_{mcr}"] = overall_dev

    # Y1 Soft Constraint 1: Penalty if RCCM >= 2 and MICU >= 1 are not met
    for resident in residents:
        mcr = resident["mcr"]
        resident_year = resident["resident_year"]
        if resident_year == 1:
            rccm_postings = [p for p in posting_codes if p.startswith("RCCM")]
            micu_postings = [p for p in posting_codes if p.startswith("MICU")]

            # RCCM: at least 2 blocks
            rccm_blocks = sum(
                x[mcr][p][block] for p in rccm_postings for block in blocks
            )
            rccm_penalty = model.NewIntVar(0, 2, f"rccm_penalty_{mcr}")

            model.Add(rccm_blocks + rccm_penalty >= 2)

            # add to list of penalties
            curr_deviation_penalties.append(
                curr_deviation_penalty_weight * rccm_penalty
            )
            curr_deviation_penalty_vars[f"rccm_penalty_{mcr}"] = rccm_penalty

            # MICU: at least 1 block
            micu_blocks = sum(
                x[mcr][p][block] for p in micu_postings for block in blocks
            )
            micu_penalty = model.NewIntVar(0, 1, f"micu_penalty_{mcr}")

            model.Add(micu_blocks + micu_penalty >= 1)

            # add to list of penalties
            curr_deviation_penalties.append(
                curr_deviation_penalty_weight * micu_penalty
            )
            curr_deviation_penalty_vars[f"micu_penalty_{mcr}"] = micu_penalty

    # Y2/Y3 Soft Constraint 1: Penalty if minimum electives not completed by end of each year
    for resident in residents:
        mcr = resident["mcr"]
        resident_year = resident["resident_year"]
        resident_progress = posting_progress.get(mcr, {})

        completed_electives_count = len(
            get_unique_electives_completed(resident_progress, posting_info)
        )

        # Determine requirements based on year
        if resident_year == 2:
            required = 2
            constraint_type = ">="  # at least 2 by Y2
        elif resident_year == 3:
            required = 5
            constraint_type = "=="  # exactly 5 by Y3
        else:
            continue  # Y1 residents have no elective requirement

        # Build list of new elective assignments for this year
        new_elective_assignments = [
            x[mcr][posting_code][block]
            for posting_code in posting_codes
            if posting_info[posting_code].get("posting_type") == "elective"
            and not resident_progress.get(posting_code, {}).get("is_completed", False)
            for block in blocks
        ]

        # total electives completed by end of year
        updated_num_electives = completed_electives_count + sum(
            new_elective_assignments
        )
        # define elective penalty variable
        elective_penalty = model.NewIntVar(
            0, required, f"elective_penalty_{mcr}_y{resident_year}"
        )

        # Apply constraint based on resident year
        if constraint_type == ">=":
            model.Add(updated_num_electives + elective_penalty >= required)
        else:
            model.Add(updated_num_electives + elective_penalty == required)

        # add to list of penalties
        curr_deviation_penalties.append(
            curr_deviation_penalty_weight * elective_penalty
        )
        curr_deviation_penalty_vars[f"elective_penalty_{mcr}_y{resident_year}"] = (
            elective_penalty
        )

    # Y3 Soft Constraint 1: Penalty if core posting requirements are under-assigned by end of Year 3
    for resident in residents:
        mcr = resident["mcr"]
        resident_year = resident["resident_year"]
        resident_progress = posting_progress.get(mcr, {})
        core_blocks_completed_map = get_core_blocks_completed(
            resident_progress, posting_info
        )

        # get current year assignments, then sum with history
        for base_posting, required_blocks in CORE_REQUIREMENTS.items():
            assigned_blocks = sum(
                x[mcr][posting_code][block]
                for posting_code in posting_codes
                if posting_code.split(" (")[0] == base_posting
                for block in blocks
            )
            blocks_completed = core_blocks_completed_map.get(base_posting, 0)
            total_blocks = blocks_completed + assigned_blocks

            # under-assignment penalty if assigned less than required
            if resident_year == 3:
                core_under_var = model.NewIntVar(
                    0, required_blocks, f"core_under_{mcr}_{base_posting}"
                )
                model.Add(total_blocks + core_under_var >= required_blocks)
                curr_deviation_penalties.append(
                    curr_deviation_penalty_weight * core_under_var
                )
                curr_deviation_penalty_vars[f"core_under_{mcr}_{base_posting}"] = (
                    core_under_var
                )

    ###########################################################################
    # DEFINE BONUSES AND OBJECTIVE
    ###########################################################################

    # Preference satisfaction bonus
    preference_weights = []
    preference_weight_value = weightages.get("preference", 1)
    for resident in residents:
        mcr = resident["mcr"]
        prefs = pref_map.get(mcr, {})
        for posting_code in posting_codes:
            weight = 0
            for rank in range(1, 6):
                if prefs.get(rank) == posting_code:
                    weight = 6 - rank
                    break
            if weight > 0:
                # provide bonus based on assignment and not number of blocks
                assigned_var = x[mcr][posting_code].get("assigned_var")
                if assigned_var is not None:
                    preference_weights.append(
                        preference_weight_value * weight * assigned_var
                    )

    # Seniority bonus
    seniority_bonus = []
    seniority_bonus_value = weightages.get("seniority", 2)
    for resident in residents:
        mcr = resident["mcr"]
        resident_year = resident.get("resident_year", 1)
        for posting_code in posting_codes:
            for block in blocks:
                seniority_bonus.append(
                    resident_year * x[mcr][posting_code][block] * seniority_bonus_value
                )

    # Objective
    model.Maximize(
        sum(preference_weights)
        + sum(seniority_bonus)
        + sum(gm_ktph_bonus)
        - sum(curr_deviation_penalties)
    )

    ###########################################################################
    # SOLVE MODEL
    ###########################################################################

    logger.info("Initialising CP-SAT solver")
    solver = cp_model.CpSolver()

    # Enable solver progress logging to stderr (will be captured as [PYTHON LOG] by Node.js backend)
    solver.parameters.log_search_progress = False  # Only enable for debugging
    solver.parameters.enumerate_all_solutions = False

    # retrieve status of model
    status = solver.Solve(model)
    logger.info(
        f"Solver returned status {solver.StatusName(status)} with objective {solver.ObjectiveValue()}"
    )

    ###########################################################################
    # PROCESS RESULTS
    ###########################################################################

    # log penalties incurred
    for name, var in curr_deviation_penalty_vars.items():
        value = solver.Value(var)
        if value > 0:
            logger.info(f"⚠️ Penalty triggered: {name} → {value}")

    # print summary of soft constraints violated
    resident_summary = {}
    for resident in residents:
        mcr = resident["mcr"]
        summary = {}

        # Core underassignments (if any)
        for base in CORE_REQUIREMENTS:
            penalty_key = f"core_under_{mcr}_{base}"
            penalty_var = curr_deviation_penalty_vars.get(penalty_key)
            if penalty_var is not None and solver.Value(penalty_var) > 0:
                summary[f"Missing Core: {base}"] = solver.Value(penalty_var)

        # RCCM & MICU Y1
        if resident["resident_year"] == 1:
            for key in ["rccm_penalty", "micu_penalty"]:
                penalty_key = f"{key}_{mcr}"
                penalty_var = curr_deviation_penalty_vars.get(penalty_key)
                if penalty_var is not None and solver.Value(penalty_var) > 0:
                    label = "Missing RCCM" if "rccm" in key else "Missing MICU"
                    summary[label] = solver.Value(penalty_var)

        # Elective gaps
        for year in [2, 3]:
            penalty_key = f"elective_penalty_{mcr}_y{year}"
            penalty_var = curr_deviation_penalty_vars.get(penalty_key)
            if penalty_var is not None and solver.Value(penalty_var) > 0:
                summary[f"Elective shortfall (Y{year})"] = solver.Value(penalty_var)

        if summary:
            resident_summary[mcr] = summary

    for mcr, summary in resident_summary.items():
        logger.info(f"🔍 {mcr} Soft Constraint Summary:")
        for label, value in summary.items():
            logger.info(f"   - {label}: {value}")

    if status == cp_model.INFEASIBLE:
        logger.info("Model is infeasible.")
        logger.info("Conflict set:")

        for lit in solver.SufficientAssumptionsForInfeasibility():
            key = lit.Name()
            logger.info(f"- Conflict: {key}")

    if status == cp_model.OPTIMAL or status == cp_model.FEASIBLE:
        logger.info("Processing results")
        output_residents = []

        # add is_current_year field to resident history
        output_history = [dict(h, is_current_year=False) for h in resident_history]

        # append current year data to history
        for resident in residents:
            mcr = resident["mcr"]
            current_year = resident["resident_year"]
            new_blocks = []
            for posting_code in posting_codes:
                assigned_blocks = [
                    block
                    for block in blocks
                    if solver.Value(x[mcr][posting_code][block])
                    > 0.5  # if value is 1 (or more with IntVar)
                ]
                for block in assigned_blocks:
                    new_blocks.append(
                        {
                            "mcr": mcr,
                            "year": current_year,
                            "block": block,
                            "posting_code": posting_code,
                            "is_current_year": True,
                        }
                    )

            # add new blocks to history
            output_history.extend(new_blocks)

            # filter by resident to get updated resident progress
            updated_resident_history = [h for h in output_history if h["mcr"] == mcr]
            updated_resident_progress = get_posting_progress(
                updated_resident_history,
                posting_info,
            ).get(mcr, {})

            # get core blocks completed and unique electives completed
            core_blocks_completed = get_core_blocks_completed(
                updated_resident_progress,
                posting_info,
            )
            unique_electives_completed = get_unique_electives_completed(
                updated_resident_progress,
                posting_info,
            )

            # get CCR completion status
            ccr_postings = get_ccr_postings_completed(
                updated_resident_progress, posting_info
            )
            if ccr_postings:
                ccr_completion_status = {
                    "completed": True,
                    "posting_code": ccr_postings[0],
                }
            else:
                ccr_completion_status = {"completed": False, "posting_code": "-"}

            # append to output
            output_residents.append(
                {
                    "mcr": mcr,
                    "name": resident["name"],
                    "resident_year": current_year,
                    "core_blocks_completed": core_blocks_completed,
                    "unique_electives_completed": list(unique_electives_completed),
                    "ccr_status": ccr_completion_status,
                }
            )

        ## CALCULATE COHORT STATISTICS

        # 1. optimisation score per resident
        optimisation_scores = []
        for resident in residents:
            mcr = resident["mcr"]
            resident_year = resident.get("resident_year", 1)
            assigned_postings = [
                h for h in output_history if h["mcr"] == mcr and h["is_current_year"]
            ]

            # a. Preference satisfaction
            prefs = pref_map.get(mcr, {})
            preference_score = 0
            for h in assigned_postings:
                assigned_posting = h["posting_code"]
                for rank in range(1, 6):
                    if prefs.get(rank) == assigned_posting:
                        preference_score += (6 - rank) * preference_weight_value
                        break

            # b. Seniority bonus
            seniority_bonus = (
                len(assigned_postings) * resident_year * seniority_bonus_value
            )

            # c. Core completion bonus
            # core_completed = 0
            # core_postings = set(
            #     h["posting_code"]
            #     for h in assigned_postings
            #     if posting_info.get(h["posting_code"], {}).get("posting_type") == "core"
            # )
            # for posting_code in core_postings:
            #     required_blocks = posting_info[posting_code].get(
            #         "required_block_duration", 1
            #     )
            #     blocks_assigned = [
            #         h for h in assigned_postings if h["posting_code"] == posting_code
            #     ]
            #     if len(blocks_assigned) == required_blocks:
            #         core_completed += 1
            # core_completion_bonus = core_completed * core_bonus_value

            # d. Curriculum deviation penalty
            curr_deviation_penalty_score = 0
            for var_name, var in curr_deviation_penalty_vars.items():
                if solver.Value(var) > 0:
                    curr_deviation_penalty_score += (
                        curr_deviation_penalty_weight * solver.Value(var)
                    )

            actual_score = (
                preference_score
                + seniority_bonus
                # + core_completion_bonus
                - curr_deviation_penalty_score
            )
            optimisation_scores.append(actual_score)

        # Now normalise by the highest actual score in the cohort
        max_actual_score = max(optimisation_scores) if optimisation_scores else 1
        optimisation_scores_percentage = [
            round((score / max_actual_score) * 100, 2) if max_actual_score > 0 else 0
            for score in optimisation_scores
        ]

        # 2. posting utilisation
        posting_util = []
        for posting_code in posting_info:
            # get current year assignments for each posting
            posting_assignments = [
                h
                for h in output_history
                if h["posting_code"] == posting_code and h["is_current_year"]
            ]

            # increment count to specific block for each assignment
            block_filled = {block: 0 for block in range(1, 13)}
            for assignment in posting_assignments:
                block = assignment["block"]
                if 1 <= block <= 12:  # Validate block number
                    block_filled[block] += 1

            capacity = posting_info[posting_code]["max_residents"]

            # collate blockwise utilisation per posting
            util_per_block = [
                {
                    "block": block,
                    "filled": count,
                    "capacity": capacity,
                    "is_over_capacity": count > capacity,
                }
                for block, count in block_filled.items()
            ]

            # append to overall utilisation list
            posting_util.append(
                {
                    "posting_code": posting_code,
                    "util_per_block": util_per_block,
                }
            )

        # add all results to output
        cohort_statistics = {
            "optimisation_scores": optimisation_scores,
            "optimisation_scores_normalised": optimisation_scores_percentage,
            "posting_util": posting_util,
        }

        logger.info("Posting allocation service completed successfully")

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
    else:
        logger.error("Posting allocation service failed")
        return {"success": False, "error": "Posting allocation service failed"}


def main():
    if len(sys.argv) != 2:
        print(
            json.dumps(
                {
                    "success": False,
                    "error": f"Usage: python posting_allocator.py <input_json_file>",
                }
            )
        )
        sys.exit(1)
    try:
        with open(sys.argv[1], "r") as f:
            input_data = json.load(f)
        result = allocate_timetable(
            residents=input_data["residents"],
            resident_history=input_data["resident_history"],
            resident_preferences=input_data["resident_preferences"],
            postings=input_data["postings"],
            weightages=input_data["weightages"],
        )
        # needs to be printed to stdout for server.js to read
        print(json.dumps(result, indent=2))
    except FileNotFoundError:
        print(
            json.dumps(
                {"success": False, "error": f"Input file '{sys.argv[1]}' not found"}
            )
        )
        sys.exit(1)
    except json.JSONDecodeError:
        print(
            json.dumps(
                {
                    "success": False,
                    "error": f"Invalid JSON in input file '{sys.argv[1]}'",
                }
            )
        )
        sys.exit(1)
    except KeyError as e:
        print(
            json.dumps(
                {
                    "success": False,
                    "error": f"Missing required field in input data: {e}",
                }
            )
        )
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
