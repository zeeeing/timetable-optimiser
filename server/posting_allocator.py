import json
import sys
from typing import List, Dict
from ortools.sat.python import cp_model


def allocate_postings(residents: List[Dict]) -> Dict:
    model = cp_model.CpModel()
    posting_set = set()
    for s in residents:
        posting_set.update([s["p1"], s["p2"], s["p3"]])
    postings = sorted(posting_set)

    resident_count = len(residents)
    posting_vars = {}

    # Constraint 1: Each resident can only get one posting
    for i, resident in enumerate(residents):
        for posting in postings:
            posting_vars[(i, posting)] = model.NewBoolVar(
                f"resident_{i}_gets_{posting}"
            )

        # Each resident gets only one posting
        model.Add(sum(posting_vars[(i, c)] for c in postings) == 1)

    # Constraint 2: Each posting assigned to at most one resident
    for posting in postings:
        model.Add(sum(posting_vars[(i, posting)] for i in range(resident_count)) <= 1)

    # Objective: maximize preference satisfaction weighted by seniority
    objective_terms = []
    for i, resident in enumerate(residents):
        seniority = resident["seniority"]
        for rank, key in enumerate(["p1", "p2", "p3"]):
            posting = resident[key]
            weight = (
                3 - rank
            ) * seniority  # p1 > p2 > p3 and more senior = more weight
            objective_terms.append(posting_vars[(i, posting)] * weight)

    model.Maximize(sum(objective_terms))
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 10.0

    status = solver.Solve(model)
    results = []

    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        for i, resident in enumerate(residents):
            for posting in postings:
                if solver.BooleanValue(posting_vars[(i, posting)]):
                    resident["assignedPosting"] = posting
                    break
            results.append(resident)
        return {"success": True, "assigned": results}
    else:
        return {"success": False, "message": "No feasible assignment found"}


def main():
    if len(sys.argv) != 2:
        print("Usage: python posting_allocator.py <input_json_file>")
        sys.exit(1)

    with open(sys.argv[1], "r") as f:
        data = json.load(f)

    result = allocate_postings(data.get("residents", []))
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
