import json
import sys
from typing import List, Dict, Set
from ortools.sat.python import cp_model
from utils import parse_resident_history, get_posting_assignments
import logging

logging.basicConfig(
    level=logging.INFO,
    # format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

CORE_REQUIREMENTS = {
    "GM": 9,
    "GRM": 2,
    "CVM": 3,
    "RCCM": 3,
    "MICU": 3,
    "ED": 1,
    "NL": 3,
}


def allocate_timetable(
    residents: List[Dict],
    preferences: List[Dict],
    posting_quotas: List[Dict],
) -> Dict:
    logger.info("STARTING POSTING ALLOCATION SERVICE")
    logger.debug(
        f"Input sizes - residents: {len(residents)}, preferences: {len(preferences)}, quotas: {len(posting_quotas)}"
    )
    logger.info("\nResident data:\n")
    logger.info(f"{residents}\n")

    logger.info("\nPreferences data:\n")
    logger.info(f"{preferences}\n")

    logger.info("\nPosting quotas data:\n")
    logger.info(f"{posting_quotas}\n")

    model = cp_model.CpModel()

    # Parse resident history
    resident_history = parse_resident_history(residents)
    logger.debug(f"Parsed resident_history entries: {len(resident_history)}")

    # Build posting info from quotas
    posting_info = {
        q["posting_code"]: {
            "posting_name": q.get("posting_name", q["posting_code"]),
            "type": q.get("posting_type", "core"),
            "max_residents": q["max_residents"],
            "required_block_duration": q.get("required_block_duration", 3),
        }
        for q in posting_quotas
    }

    # Get all postings from quotas
    postings = list(posting_info.keys())
    logger.debug(f"Postings codes: {postings}")

    # Map resident MCRs to their data
    resident_map = {r["mcr"]: r for r in residents}

    # Create a mapping from mcr to their preferences
    pref_map = {p["mcr"]: p for p in preferences}

    # Get all block numbers (assuming 12 blocks per year)
    blocks = list(range(1, 13))

    # Create decision variables
    # x[mcr][p][b] = 1 if resident with mcr is assigned to posting p in block b
    x = {}
    for resident in residents:
        mcr = resident["mcr"]
        x[mcr] = {}
        for posting in postings:
            x[mcr][posting] = {}
            for block in blocks:
                x[mcr][posting][block] = model.NewBoolVar(f"x_{mcr}_{posting}_{block}")

    logger.debug(
        f"Decision variables created: {len(residents)} residents x {len(postings)} postings x {len(blocks)} blocks"
    )
    # Constraint: Each resident can be assigned to at most one posting per block
    for resident in residents:
        mcr = resident["mcr"]
        for block in blocks:
            model.AddAtMostOne(x[mcr][p][block] for p in postings)

    # Constraint: Respect posting quotas
    for posting in postings:
        max_residents = posting_info[posting]["max_residents"]
        for block in blocks:
            model.Add(
                sum(x[r["mcr"]][posting][block] for r in residents) <= max_residents
            )

    # Constraint: Residents can't be assigned to postings they've already done
    for resident in residents:
        mcr = resident["mcr"]
        completed_postings = resident_history.get(mcr, set())
        for posting in completed_postings:
            if posting in x[mcr]:  # Only if this posting is in our current quotas
                for block in blocks:
                    model.Add(x[mcr][posting][block] == 0)

    # Constraint: Enforce max core blocks based on history (do not exceed)
    for resident in residents:
        mcr = resident["mcr"]
        # Count completed core blocks from history
        core_completed_counts = {pc: 0 for pc in CORE_REQUIREMENTS.keys()}
        for year_data in resident.get("past_history", []):
            for block in year_data.get("blocks", []):
                posting_code = block.get("posting")
                if posting_code in core_completed_counts:
                    core_completed_counts[posting_code] += 1
        # Add constraint to not exceed max blocks
        for posting_code, max_blocks in CORE_REQUIREMENTS.items():
            history_count = core_completed_counts.get(posting_code, 0)
            remaining = max(0, max_blocks - history_count)
            if posting_code in x[mcr]:
                model.Add(sum(x[mcr][posting_code][b] for b in blocks) <= remaining)
                logger.debug(
                    f"{mcr}: {posting_code} history={history_count}, max={max_blocks}, remaining={remaining}"
                )

    # Objective: Maximise preference satisfaction (weighted by preference rank)
    preference_weights = []
    for resident in residents:
        mcr = resident["mcr"]
        pref = pref_map.get(mcr, {})
        for posting in postings:
            # Higher weight for higher preferences (p1 > p2 > p3 > p4 > p5)
            if pref.get("p1") == posting:
                weight = 5
            elif pref.get("p2") == posting:
                weight = 4
            elif pref.get("p3") == posting:
                weight = 3
            elif pref.get("p4") == posting:
                weight = 2
            elif pref.get("p5") == posting:
                weight = 1
            else:
                weight = 0  # No preference for this posting

            if weight > 0:  # Only add to objective if it's a preferred posting
                for block in blocks:
                    preference_weights.append(weight * x[mcr][posting][block])

    # Add seniority bonus (slight preference for senior residents)
    seniority_bonus = []
    for resident in residents:
        mcr = resident["mcr"]
        resident_year = resident.get("resident_year", 1)
        for posting in postings:
            for block in blocks:
                seniority_bonus.append(
                    resident_year * x[mcr][posting][block] * 0.1
                )  # Small weight

    # Maximise the weighted sum of preferences and seniority bonus
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
        result = {
            "success": True,
            "schedule": [],
            "summary": {
                "total_residents": len(residents),
                "total_postings": len(postings),
                "total_blocks": len(blocks),
                "preference_satisfaction": {
                    "first_preference": 0,
                    "second_preference": 0,
                    "third_preference": 0,
                    "fourth_preference": 0,
                    "fifth_preference": 0,
                },
                "posting_utilisation": [],
            },
        }

        # Track posting utilisation
        posting_utilisation = {p: 0 for p in postings}

        # Process each resident's schedule
        for resident in residents:
            mcr = resident["mcr"]
            resident_schedule = {
                "mcr": mcr,
                "resident_name": resident["name"],
                "resident_year": resident["resident_year"],
                "assigned_postings": [],
            }

            # Group assignments by posting
            posting_blocks = {p: [] for p in postings}
            for posting in postings:
                for block in blocks:
                    if solver.Value(x[mcr][posting][block]) > 0.5:  # True
                        posting_blocks[posting].append(block)
                        posting_utilisation[posting] += 1

            # Convert block lists to ranges for output
            for posting, blocks_assigned in posting_blocks.items():
                if blocks_assigned:
                    blocks_assigned.sort()
                    resident_schedule["assigned_postings"].append(
                        {
                            "posting_code": posting,
                            "posting_name": posting_info[posting]["posting_name"],
                            "start_block": min(blocks_assigned),
                            "duration_blocks": len(blocks_assigned),
                            "is_preferred": False,
                            "preference_rank": 0,
                        }
                    )

            # Track preference satisfaction
            pref = pref_map.get(mcr, {})
            for i, p in enumerate(["p1", "p2", "p3", "p4", "p5"]):
                if pref.get(p) in posting_blocks and posting_blocks[pref.get(p)]:
                    pref_key = ["first", "second", "third", "fourth", "fifth"][
                        i
                    ] + "_preference"
                    result["summary"]["preference_satisfaction"][pref_key] += 1

                    # Mark preferred postings in the output
                    for assignment in resident_schedule["assigned_postings"]:
                        if assignment["posting_code"] == pref[p]:
                            assignment["is_preferred"] = True
                            assignment["preference_rank"] = i + 1

            result["schedule"].append(resident_schedule)

        # Add posting utilisation to summary
        for posting, count in posting_utilisation.items():
            max_residents = posting_info[posting]["max_residents"] * len(blocks)
            utilisation_pct = (count / max_residents * 100) if max_residents > 0 else 0

            result["summary"]["posting_utilisation"].append(
                {
                    "posting_code": posting,
                    "posting_name": posting_info[posting]["posting_name"],
                    "assigned_blocks": count,
                    "utilisation_percentage": round(utilisation_pct, 1),
                }
            )

        return result
    else:
        return {"success": False, "error": "No solution found"}


def main():
    if len(sys.argv) != 2:
        print("Usage: python posting_allocator.py <input_json_file>")
        sys.exit(1)

    try:
        # Read input from file
        with open(sys.argv[1], "r") as f:
            input_data = json.load(f)

        # Call the allocation function with the input data
        result = allocate_timetable(
            residents=input_data["residents"],
            preferences=input_data["preferences"],
            posting_quotas=input_data["posting_quotas"],
        )

        # Output the result as JSON
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
