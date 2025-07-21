import json
import sys
from typing import List, Dict
from ortools.sat.python import cp_model
from utils import (
    get_completed_postings,
    get_posting_progress,
    get_unique_electives_completed,
    get_core_blocks_completed,
)
import logging

logging.basicConfig(level=logging.INFO, stream=sys.stdout)
logger = logging.getLogger(__name__)


def allocate_timetable(
    residents: List[Dict],
    resident_history: List[Dict],
    resident_preferences: List[Dict],
    postings: List[Dict],
) -> Dict:
    logger.info("STARTING POSTING ALLOCATION SERVICE")
    model = cp_model.CpModel()

    ## DEFINE VARIABLES

    # 1. create map of posting codes to posting info
    posting_info = {p["posting_code"]: p for p in postings}
    # 2. create list of posting codes
    posting_codes = list(posting_info.keys())
    # 3. create list of blocks
    blocks = list(range(1, 13))

    # 4. create map of resident mcr to their preferences
    # example output:
    # {
    #   "R001": {
    #     1: "Gastro (TTSH)",
    #     ...
    #   }
    # }
    pref_map = {}
    for pref in resident_preferences:
        mcr = pref["mcr"]
        if mcr not in pref_map:
            pref_map[mcr] = {}
        pref_map[mcr][pref["preference_rank"]] = pref["posting_code"]

    # 5. get resident history of completed postings
    completed_postings_map = get_completed_postings(resident_history, posting_info)
    # 6. get posting progress for each resident
    posting_progress = get_posting_progress(resident_history, posting_info)

    ## CREATE DECISION VARIABLES

    x = {}
    for resident in residents:
        mcr = resident["mcr"]
        x[mcr] = {}
        for posting in posting_codes:
            x[mcr][posting] = {}
            for block in blocks:
                x[mcr][posting][block] = model.NewBoolVar(f"x_{mcr}_{posting}_{block}")

    ## DEFINE CONSTRAINTS

    # General Constraint 1: Each resident can be assigned to at most one posting per block
    for resident in residents:
        mcr = resident["mcr"]
        for block in blocks:
            model.AddAtMostOne(x[mcr][p][block] for p in posting_codes)

    # General Constraint 2: Respect max residents per posting
    for posting in posting_codes:
        max_residents = posting_info[posting]["max_residents"]
        for block in blocks:
            model.Add(
                sum(x[r["mcr"]][posting][block] for r in residents) <= max_residents
            )

    # General Constraint 3: Residents can't be assigned to postings they've already completed
    for resident in residents:
        mcr = resident["mcr"]
        completed_postings = completed_postings_map.get(mcr, set())
        for posting in completed_postings:
            if posting in x[mcr]:
                for block in blocks:
                    # Is resident `mcr` assigned to posting `posting` in block `block`?
                    model.Add(x[mcr][posting][block] == 0)

    # General Constraint 4: Enforce required_block_duration for each posting per resident
    for resident in residents:
        mcr = resident["mcr"]
        for posting_code in posting_codes:
            required_duration = posting_info[posting_code].get(
                "required_block_duration", 1
            )
            total_blocks = sum(x[mcr][posting_code][block] for block in blocks)
            assigned = model.NewBoolVar(f"assigned_{mcr}_{posting_code}")
            x[mcr][posting_code][
                "assigned_var"
            ] = assigned  # Store for later use in objective
            model.Add(total_blocks == required_duration).OnlyEnforceIf(assigned)
            model.Add(total_blocks == 0).OnlyEnforceIf(assigned.Not())

    # General Constraint 5: Enforce required_block_duration happens in consecutive blocks
    for resident in residents:
        mcr = resident["mcr"]
        for posting_code in posting_codes:
            required_duration = posting_info[posting_code].get(
                "required_block_duration", 1
            )
            if required_duration > 1:
                window_vars = []
                # iterate over blocks to find all possible windows of required duration
                for start in range(1, len(blocks) - required_duration + 2):
                    # for each possible start block, create a list of blocks in the window
                    window = [
                        x[mcr][posting_code][block]
                        for block in range(start, start + required_duration)
                    ]
                    # create a boolean variable for the window
                    window_var = model.NewBoolVar(
                        f"window_{mcr}_{posting_code}_{start}"
                    )
                    # link window variable to block assignments
                    # If window_var = 1 (window is selected):
                    # AddBoolAnd(window) means ALL blocks in this window must be assigned (1)
                    model.AddBoolAnd(window).OnlyEnforceIf(window_var)
                    # If window_var = 0 (window is not selected):
                    # AddBoolOr([b.Not() for b in window]) means AT LEAST ONE block is NOT assigned (0)
                    model.AddBoolOr([b.Not() for b in window]).OnlyEnforceIf(
                        window_var.Not()
                    )
                    # add the window variable to the list
                    window_vars.append(window_var)
                # add constraint that only one window can be selected if assigned
                model.Add(sum(window_vars) == x[mcr][posting_code]["assigned_var"])

    # Y1 Constraint: Ensure RCCM and MICU minimums
    for resident in residents:
        mcr = resident["mcr"]
        resident_year = resident.get("resident_year", 1)
        if resident_year == 1:
            # Find all RCCM and MICU posting codes (any site)
            rccm_postings = [p for p in posting_codes if p.startswith("RCCM")]
            micu_postings = [p for p in posting_codes if p.startswith("MICU")]
            # RCCM: at least 2 blocks
            model.Add(
                sum(x[mcr][p][block] for p in rccm_postings for block in blocks) >= 2
            )
            # MICU: at least 1 block
            model.Add(
                sum(x[mcr][p][block] for p in micu_postings for block in blocks) >= 1
            )

    # Y2/Y3 Constraint: Ensure minimum electives completed by end of each year
    for resident in residents:
        mcr = resident["mcr"]
        resident_year = resident.get("resident_year", 1)
        resident_progress = posting_progress.get(mcr, {})

        # Count completed electives from history
        completed_electives = 0
        for posting_code, progress in resident_progress.items():
            posting_data = posting_info.get(posting_code, {})
            if (
                posting_data.get("posting_type") == "elective"
                and progress["is_completed"]
            ):
                completed_electives += 1

        # For Year 2 residents: must have at least 2 electives completed by end of year 2
        if resident_year == 2:
            # Count new elective assignments in this allocation
            new_elective_assignments = []
            for posting_code in posting_codes:
                posting_data = posting_info[posting_code]
                if posting_data.get("posting_type") == "elective":
                    # Check if this elective is not already completed
                    if not resident_progress.get(posting_code, {}).get(
                        "is_completed", False
                    ):
                        for block in blocks:
                            new_elective_assignments.append(x[mcr][posting_code][block])

            # Total electives = completed from history + new assignments
            # Must be at least 2 by end of year 2
            model.Add(completed_electives + sum(new_elective_assignments) >= 2)

        # For Year 3 residents: must have at least 5 electives completed by end of year 3
        elif resident_year == 3:
            # Count new elective assignments in this allocation
            new_elective_assignments = []
            for posting_code in posting_codes:
                posting_data = posting_info[posting_code]
                if posting_data.get("posting_type") == "elective":
                    # Check if this elective is not already completed
                    if not resident_progress.get(posting_code, {}).get(
                        "is_completed", False
                    ):
                        for block in blocks:
                            new_elective_assignments.append(x[mcr][posting_code][block])

            # Total electives = completed from history + new assignments
            # Must be at least 5 by end of year 3
            model.Add(completed_electives + sum(new_elective_assignments) >= 5)

    # Y3 Constraint: Ensure core posting requirements are met
    for resident in residents:
        mcr = resident["mcr"]
        resident_year = resident.get("resident_year", 1)
        resident_progress = posting_progress.get(mcr, {})

        if resident_year == 3:
            for posting_code in posting_codes:
                posting_data = posting_info[posting_code]
                # For GM, exclude CCR from the core requirement
                if posting_data["posting_type"] == "core":
                    base_posting = posting_code.split(" (")[0]
                    if (
                        base_posting == "GM"
                        and posting_info[posting_code].get("posting_type") == "CCR"
                    ):
                        continue  # Skip CCR for GM core requirement
                    # Get current progress for this posting
                    current_progress = resident_progress.get(
                        posting_code, {"completed": 0, "required": 0}
                    )
                    blocks_completed = current_progress["completed"]
                    blocks_required = current_progress["required"]
                    blocks_needed = blocks_required - blocks_completed

                    if blocks_needed > 0:
                        # Year 3 resident must complete the remaining blocks for this core posting
                        # Sum of new assignments for this posting must equal blocks_needed
                        model.Add(
                            sum(x[mcr][posting_code][block] for block in blocks)
                            == blocks_needed
                        )

    # CCR constraint: ensure only one CCR posting is ever assigned per resident
    for resident in residents:
        mcr = resident["mcr"]
        resident_year = resident.get("resident_year", 1)
        # Find all CCR postings
        ccr_postings = [
            p for p in posting_codes if posting_info[p].get("posting_type") == "CCR"
        ]
        # Check if resident has completed any CCR posting in history
        completed_ccr = None
        for posting_code in ccr_postings:
            if posting_code in completed_postings_map.get(mcr, set()):
                completed_ccr = posting_code
                break

        if completed_ccr:
            # Prevent assignment to all other CCR postings in any block
            for posting_code in ccr_postings:
                if posting_code != completed_ccr and posting_code in posting_codes:
                    for block in blocks:
                        model.Add(x[mcr][posting_code][block] == 0)
        elif resident_year == 2 or resident_year == 3:
            # Only apply CCR constraint to Year 2 or Year 3 residents who haven't completed CCR
            new_ccr_postings = []
            for posting_code in ccr_postings:
                if posting_code in posting_codes:
                    if posting_code not in completed_postings_map.get(mcr, set()):
                        for block in blocks:
                            new_ccr_postings.append(x[mcr][posting_code][block])
            # Must be exactly 1 CCR posting completed by end of Year 2 or Year 3 (if missed in Year 2)
            model.Add(sum(new_ccr_postings) == 1)

    ## DEFINE OBJECTIVE

    # Objective: Maximise preference satisfaction (weighted by preference rank)
    preference_weights = []
    for resident in residents:
        mcr = resident["mcr"]
        prefs = pref_map.get(mcr, {})
        for posting in posting_codes:
            weight = 0
            for rank in range(1, 6):
                if prefs.get(rank) == posting:
                    weight = 6 - rank
                    break
            if weight > 0:
                for block in blocks:
                    preference_weights.append(weight * x[mcr][posting][block])

    # Bonus: Seniority
    seniority_bonus = []
    for resident in residents:
        mcr = resident["mcr"]
        resident_year = resident.get("resident_year", 1)
        for posting in posting_codes:
            for block in blocks:
                seniority_bonus.append(resident_year * x[mcr][posting][block] * 0.1)

    # Bonus: Core completion
    core_completion_bonus = []
    core_bonus_value = 10  # Adjust this value as needed
    for resident in residents:
        mcr = resident["mcr"]
        for posting_code in posting_codes:
            posting_data = posting_info[posting_code]
            if posting_data.get("posting_type") == "core":
                assigned = x[mcr][posting_code].get("assigned_var", None)
                if assigned is not None:
                    core_completion_bonus.append(core_bonus_value * assigned)

    model.Maximize(
        sum(preference_weights) + sum(seniority_bonus) + sum(core_completion_bonus)
    )

    ## SOLVE MODEL AND PROCESS RESULTS

    logger.info("Initialising CP-SAT solver")
    solver = cp_model.CpSolver()
    # solver.parameters.log_search_progress = True
    status = solver.Solve(model)
    logger.info(
        f"Solver returned status {solver.StatusName(status)} with objective {solver.ObjectiveValue()}"
    )

    ## PROCESS RESULTS

    if status == cp_model.OPTIMAL or status == cp_model.FEASIBLE:
        logger.info("Processing results")
        output_residents = []
        output_history = [dict(h, is_current_year=False) for h in resident_history]

        # append current year data to history
        for resident in residents:
            mcr = resident["mcr"]
            years = [h["year"] for h in resident_history if h["mcr"] == mcr]
            next_year = max(years) + 1 if years else resident["resident_year"]
            new_blocks = []
            for posting in posting_codes:
                assigned_blocks = [
                    block
                    for block in blocks
                    if solver.Value(x[mcr][posting][block]) > 0.5
                ]
                for block in assigned_blocks:
                    new_blocks.append(
                        {
                            "mcr": mcr,
                            "year": next_year,
                            "block": block,
                            "posting_code": posting,
                            "is_current_year": True,
                        }
                    )
            output_history.extend(new_blocks)

            # update history with current year data, filter by current resident
            updated_history = [h for h in output_history if h["mcr"] == mcr]
            resident_progress = get_posting_progress(updated_history, posting_info).get(
                mcr, {}
            )
            # get core blocks completed and unique electives completed
            core_blocks_completed = get_core_blocks_completed(
                resident_progress, posting_info
            )
            unique_electives_completed = len(
                get_unique_electives_completed(resident_progress, posting_info)
            )
            # get CCR completion status (if assigned in any year, including current year)
            ccr_posting_assigned = None
            for h in updated_history:
                posting_data = posting_info.get(h["posting_code"], {})
                if h["mcr"] == mcr and posting_data.get("posting_type") == "CCR":
                    ccr_posting_assigned = h["posting_code"]
                    break
            if ccr_posting_assigned:
                ccr_completion_status = {
                    "completed": True,
                    "posting_code": ccr_posting_assigned,
                }
            else:
                ccr_completion_status = {"completed": False, "posting_code": "-"}

            # append to output
            output_residents.append(
                {
                    "mcr": mcr,
                    "name": resident["name"],
                    "resident_year": resident["resident_year"],
                    "core_blocks_completed": core_blocks_completed,
                    "unique_electives_completed": unique_electives_completed,
                    "ccr_status": ccr_completion_status,
                }
            )

        ## CALCULATE STATISTICS

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
                        preference_score += 6 - rank
                        break

            # b. Seniority bonus
            seniority_bonus = len(assigned_postings) * resident_year * 0.1

            # c. Core completion bonus
            core_completed = 0
            core_postings = set(
                h["posting_code"]
                for h in assigned_postings
                if posting_info.get(h["posting_code"], {}).get("posting_type") == "core"
            )
            for posting_code in core_postings:
                required_blocks = posting_info[posting_code].get(
                    "required_block_duration", 1
                )
                blocks_assigned = [
                    h for h in assigned_postings if h["posting_code"] == posting_code
                ]
                if len(blocks_assigned) == required_blocks:
                    core_completed += 1
            core_completion_bonus = core_completed * core_bonus_value

            # 4. Total optimisation score
            optimisation_scores.append(
                preference_score + seniority_bonus + core_completion_bonus
            )

        # 2. posting utilisation
        posting_util = []
        for posting in posting_codes:
            filled = sum(
                1
                for h in output_history
                if h["posting_code"] == posting and h["is_current_year"]
            )
            capacity = sum(posting_info[posting]["max_residents"] for _ in blocks)
            demand = sum(
                1
                for pref in resident_preferences
                for r in range(1, 4)
                if pref["preference_rank"] == r and pref["posting_code"] == posting
            )
            posting_util.append(
                {
                    "posting_code": posting,
                    "filled": filled,
                    "capacity": capacity,
                    "demand_top3": demand,
                }
            )

        # add all results to output
        cohort_statistics = {
            "optimisation_scores": optimisation_scores,
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
    else:
        return {"success": False}


def main():
    if len(sys.argv) != 2:
        print("Usage: python posting_allocator.py <input_json_file>")
        sys.exit(1)
    try:
        with open(sys.argv[1], "r") as f:
            input_data = json.load(f)
        result = allocate_timetable(
            residents=input_data["residents"],
            resident_history=input_data["resident_history"],
            resident_preferences=input_data["resident_preferences"],
            postings=input_data["postings"],
        )
        print(json.dumps(result, indent=2))
    except FileNotFoundError:
        print(f"Error: Input file '{sys.argv[1]}' not found", file=sys.stderr)
        sys.exit(1)
    except json.JSONDecodeError:
        print(f"Error: Invalid JSON in input file '{sys.argv[1]}'", file=sys.stderr)
        sys.exit(1)
    except KeyError as e:
        print(f"Error: Missing required field in input data: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
