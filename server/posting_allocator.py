import json
import sys
from typing import List, Dict
from ortools.sat.python import cp_model


def allocate_timetable(
    preferences: List[Dict],
    resident_posting_data: List[Dict],
    posting_quotas: List[Dict],
) -> Dict:
    model = cp_model.CpModel()

    # Extract unique postings from preferences
    posting_set = set()
    for p in preferences:
        posting_set.update([p["p1"], p["p2"], p["p3"], p["p4"], p["p5"]])
    postings = sorted(posting_set)

    # Map posting to type (core/elective) and block info
    posting_info = {}
    for pd in resident_posting_data:
        posting_info[pd["posting"]] = {
            "start_block": pd["start_block"],
            "block_duration": pd["block_duration"],
            "type": pd["type"],
        }

    # Extract unique course names from quotas
    course_names = [q["course_name"] for q in posting_quotas]

    resident_count = len(preferences)
    posting_vars = {}

    # Create variables for each resident-posting assignment
    for i, resident in enumerate(preferences):
        for posting in postings:
            posting_vars[(i, posting)] = model.NewBoolVar(
                f"resident_{i}_gets_{posting}"
            )

    # Constraint 1: Each resident can only get one posting per block (no overlap)
    for i, resident in enumerate(preferences):
        block_vars = [[] for _ in range(12)]
        for posting in postings:
            info = posting_info.get(posting)
            if not info:
                continue
            start = info["start_block"] - 1  # 0-based
            duration = info["block_duration"]
            for b in range(start, min(start + duration, 12)):
                block_vars[b].append(posting_vars[(i, posting)])
        for b in range(12):
            if block_vars[b]:
                model.Add(sum(block_vars[b]) <= 1)

    # Constraint 2: Respect posting quotas per block
    for quota in posting_quotas:
        course_name = quota["course_name"]
        max_residents = quota["max_residents"]
        required_duration = quota["required_block_duration"]
        for block in range(12):
            block_assignments = []
            for i, resident in enumerate(preferences):
                info = posting_info.get(course_name)
                if not info:
                    continue
                start = info["start_block"] - 1
                duration = info["block_duration"]
                if start <= block < start + duration:
                    block_assignments.append(posting_vars[(i, course_name)])
            if block_assignments:
                model.Add(sum(block_assignments) <= max_residents)

    # Objective: maximize preference satisfaction (weighted by seniority if available)
    objective_terms = []
    for i, resident in enumerate(preferences):
        seniority = resident.get("seniority", resident.get("year", 1))
        for rank, key in enumerate(["p1", "p2", "p3", "p4", "p5"]):
            posting = resident[key]
            if posting in postings:
                weight = (5 - rank) * seniority
                objective_terms.append(posting_vars[(i, posting)] * weight)

    model.Maximize(sum(objective_terms))
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 30.0

    status = solver.Solve(model)
    results = []

    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        for i, resident in enumerate(preferences):
            # Build block assignments
            block_assignments = [{"posting": None, "type": None} for _ in range(12)]
            core_postings = set()
            elective_postings = set()
            for posting in postings:
                if solver.BooleanValue(posting_vars[(i, posting)]):
                    info = posting_info.get(posting)
                    if not info:
                        continue
                    start = info["start_block"] - 1
                    duration = info["block_duration"]
                    ptype = info["type"]
                    for b in range(start, min(start + duration, 12)):
                        block_assignments[b] = {"posting": posting, "type": ptype}
                    if ptype == "core":
                        core_postings.add(posting)
                    else:
                        elective_postings.add(posting)
            result_resident = {
                "id": resident["id"],
                "name": resident["name"],
                "year": resident["year"],
                "block_assignments": block_assignments,
                "core_count": len(core_postings),
                "elective_count": len(elective_postings),
            }
            results.append(result_resident)

        return {"success": True, "timetable": results}
    else:
        return {"success": False, "message": "No feasible assignment found"}


def main():
    if len(sys.argv) != 2:
        print("Usage: python posting_allocator.py <input_json_file>")
        sys.exit(1)

    with open(sys.argv[1], "r") as f:
        data = json.load(f)

    preferences = data.get("preferences", [])
    resident_posting_data = data.get("resident_posting_data", [])
    posting_quotas = data.get("posting_quotas", [])

    result = allocate_timetable(preferences, resident_posting_data, posting_quotas)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
