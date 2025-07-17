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

logging.basicConfig(level=logging.INFO)
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

    # create map of posting codes to posting info
    posting_info = {p["posting_code"]: p for p in postings}
    # create list of posting codes
    posting_codes = list(posting_info.keys())
    # create list of blocks
    blocks = list(range(1, 13))

    # create map of resident mcr to their preferences
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

    # get resident history of completed postings
    completed_postings_map = get_completed_postings(resident_history, posting_info)
    # get posting progress for each resident
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
                if posting_data["posting_type"] == "core":
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

    # Add seniority bonus
    seniority_bonus = []
    for resident in residents:
        mcr = resident["mcr"]
        resident_year = resident.get("resident_year", 1)
        for posting in posting_codes:
            for block in blocks:
                seniority_bonus.append(resident_year * x[mcr][posting][block] * 0.1)

    # Add core completion bonus
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
    status = solver.Solve(model)
    logger.info(
        f"Solver returned status {solver.StatusName(status)} with objective {solver.ObjectiveValue()}"
    )

    if status == cp_model.OPTIMAL or status == cp_model.FEASIBLE:
        logger.info("Solver found a feasible or optimal solution, processing results")
        output_residents = []
        output_history = [dict(h, is_current_year=False) for h in resident_history]
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
            progress = get_posting_progress(updated_history, posting_info).get(
                mcr, {}
            )
            # get core blocks completed and unique electives completed
            core_blocks_completed = get_core_blocks_completed(progress, posting_info)
            unique_electives_completed = len(
                get_unique_electives_completed(progress, posting_info)
            )
            # append results
            output_residents.append(
                {
                    "mcr": mcr,
                    "name": resident["name"],
                    "resident_year": resident["resident_year"],
                    "core_blocks_completed": core_blocks_completed,
                    "unique_electives_completed": unique_electives_completed,
                }
            )
        return {
            "success": True,
            "residents": output_residents,
            "resident_history": output_history,
            "resident_preferences": resident_preferences,
            "postings": postings,
            "statistics": {"total_residents": len(residents)},
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
