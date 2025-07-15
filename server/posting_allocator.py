import json
import sys
from typing import List, Dict
from ortools.sat.python import cp_model
from utils import parse_resident_history
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

CORE_CODES = {"GM", "GRM", "CVM", "RCCM", "MICU", "ED", "NL"}


def allocate_timetable(
    residents: List[Dict],
    resident_history: List[Dict],
    resident_preferences: List[Dict],
    postings: List[Dict],
) -> Dict:
    logger.info("STARTING POSTING ALLOCATION SERVICE")
    model = cp_model.CpModel()

    posting_info = {p["posting_code"]: p for p in postings}
    posting_codes = list(posting_info.keys())
    blocks = list(range(1, 13))

    # Map resident MCRs to their data
    resident_map = {r["mcr"]: r for r in residents}
    # Map resident MCRs to their preferences (ranked)
    pref_map = {}
    for pref in resident_preferences:
        mcr = pref["mcr"]
        if mcr not in pref_map:
            pref_map[mcr] = {}
        pref_map[mcr][pref["preference_rank"]] = pref["posting_code"]

    # Parse resident history (completed postings)
    completed_postings_map = parse_resident_history(resident_history)

    # Create decision variables
    x = {}
    for resident in residents:
        mcr = resident["mcr"]
        x[mcr] = {}
        for posting in posting_codes:
            x[mcr][posting] = {}
            for block in blocks:
                x[mcr][posting][block] = model.NewBoolVar(f"x_{mcr}_{posting}_{block}")

    # Constraint: Each resident can be assigned to at most one posting per block
    for resident in residents:
        mcr = resident["mcr"]
        for block in blocks:
            model.AddAtMostOne(x[mcr][p][block] for p in posting_codes)

    # Constraint: Respect max residents per posting
    for posting in posting_codes:
        max_residents = posting_info[posting]["max_residents"]
        for block in blocks:
            model.Add(
                sum(x[r["mcr"]][posting][block] for r in residents) <= max_residents
            )

    # Constraint: Residents can't be assigned to postings they've already done
    for resident in residents:
        mcr = resident["mcr"]
        completed_postings = completed_postings_map.get(mcr, set())
        for posting in completed_postings:
            if posting in x[mcr]:
                for block in blocks:
                    model.Add(x[mcr][posting][block] == 0)

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

    model.Maximize(sum(preference_weights) + sum(seniority_bonus))

    # Solve the model
    logger.info("Initialising CP-SAT solver")
    solver = cp_model.CpSolver()
    status = solver.Solve(model)
    logger.info(
        f"Solver returned status {solver.StatusName(status)} with objective {solver.ObjectiveValue()}"
    )

    if status == cp_model.OPTIMAL or status == cp_model.FEASIBLE:
        logger.info("Solver found a feasible or optimal solution, processing results")
        # Prepare the result
        output_residents = []
        output_history = [dict(h, is_current_year=False) for h in resident_history]
        for resident in residents:
            mcr = resident["mcr"]
            # Build new year assignments
            # Find the next year for this resident
            years = [h["year"] for h in resident_history if h["mcr"] == mcr]
            next_year = max(years) + 1 if years else resident["resident_year"]
            # Collect new assignments
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
            # Add to output_history
            output_history.extend(new_blocks)
            # Calculate stats
            core = 0
            elective = 0
            # From history
            for h in [
                h
                for h in output_history
                if h["mcr"] == mcr and not h["is_current_year"]
            ]:
                code = h["posting_code"]
                if (
                    code in posting_info
                    and posting_info[code]["posting_type"] == "core"
                ):
                    core += 1
                elif (
                    code in posting_info
                    and posting_info[code]["posting_type"] == "elective"
                ):
                    elective += 1
            # From new assignments
            for h in [
                h for h in output_history if h["mcr"] == mcr and h["is_current_year"]
            ]:
                code = h["posting_code"]
                if (
                    code in posting_info
                    and posting_info[code]["posting_type"] == "core"
                ):
                    core += 1
                elif (
                    code in posting_info
                    and posting_info[code]["posting_type"] == "elective"
                ):
                    elective += 1
            # Add to output_residents
            output_residents.append(
                {
                    "mcr": mcr,
                    "name": resident["name"],
                    "resident_year": resident["resident_year"],
                    "total_core_completed": core,
                    "total_elective_completed": elective,
                }
            )
        # Compose output
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
