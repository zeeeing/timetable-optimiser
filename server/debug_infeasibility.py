#!/usr/bin/env python3
"""
Diagnostic script to identify potential infeasibility issues in the posting allocation model.
"""

import json
from utils import get_completed_postings, get_posting_progress


def analyze_infeasibility(residents, resident_history, resident_preferences, postings):
    """Analyze potential infeasibility issues."""

    posting_info = {p["posting_code"]: p for p in postings}
    posting_codes = list(posting_info.keys())
    blocks = list(range(1, 13))

    # Get progress data
    completed_postings_map = get_completed_postings(resident_history, posting_info)
    posting_progress = get_posting_progress(resident_history, posting_info)

    print("=== INFEASIBILITY ANALYSIS ===\n")

    # Check 1: Available postings vs completed postings
    print("1. AVAILABLE POSTINGS ANALYSIS:")
    for resident in residents:
        mcr = resident["mcr"]
        resident_year = resident.get("resident_year", 1)
        completed = completed_postings_map.get(mcr, set())
        available = [p for p in posting_codes if p not in completed]

        print(f"   {mcr} (Year {resident_year}):")
        print(f"     Completed: {len(completed)} postings")
        print(f"     Available: {len(available)} postings")
        print(f"     Completed list: {completed}")
        print()

    # Check 2: Year 1 RCCM/MICU availability
    print("2. YEAR 1 RCCM/MICU ANALYSIS:")
    rccm_postings = [p for p in posting_codes if p.startswith("RCCM")]
    micu_postings = [p for p in posting_codes if p.startswith("MICU")]

    print(f"   Available RCCM postings: {rccm_postings}")
    print(f"   Available MICU postings: {micu_postings}")

    year1_residents = [r for r in residents if r.get("resident_year", 1) == 1]
    print(f"   Year 1 residents: {len(year1_residents)}")

    for resident in year1_residents:
        mcr = resident["mcr"]
        completed = completed_postings_map.get(mcr, set())
        available_rccm = [p for p in rccm_postings if p not in completed]
        available_micu = [p for p in micu_postings if p not in completed]

        print(
            f"     {mcr}: Available RCCM={len(available_rccm)}, MICU={len(available_micu)}"
        )
    print()

    # Check 3: Elective requirements
    print("3. ELECTIVE REQUIREMENTS ANALYSIS:")
    elective_postings = [
        p for p in posting_codes if posting_info[p].get("posting_type") == "elective"
    ]
    print(f"   Total elective postings: {len(elective_postings)}")
    print(f"   Elective list: {elective_postings}")

    for resident in residents:
        mcr = resident["mcr"]
        resident_year = resident.get("resident_year", 1)
        resident_progress = posting_progress.get(mcr, {})

        completed_electives = 0
        for posting_code, progress in resident_progress.items():
            posting_data = posting_info.get(posting_code, {})
            if (
                posting_data.get("posting_type") == "elective"
                and progress["is_completed"]
            ):
                completed_electives += 1

        available_electives = []
        for posting_code in elective_postings:
            if not resident_progress.get(posting_code, {}).get("is_completed", False):
                available_electives.append(posting_code)

        required = 2 if resident_year == 2 else (5 if resident_year == 3 else 0)

        print(f"   {mcr} (Year {resident_year}):")
        print(f"     Completed electives: {completed_electives}")
        print(f"     Available electives: {len(available_electives)}")
        print(f"     Required by end of year: {required}")
        print(f"     Gap: {required - completed_electives}")
        if required - completed_electives > len(available_electives):
            print(
                f"     ⚠️  INFEASIBLE: Need {required - completed_electives} more electives but only {len(available_electives)} available!"
            )
        print()

    # Check 4: Core requirements for Year 3
    print("4. YEAR 3 CORE REQUIREMENTS ANALYSIS:")
    year3_residents = [r for r in residents if r.get("resident_year", 1) == 3]

    for resident in year3_residents:
        mcr = resident["mcr"]
        resident_progress = posting_progress.get(mcr, {})

        print(f"   {mcr}:")
        for posting_code in posting_codes:
            posting_data = posting_info[posting_code]
            if posting_data.get("posting_type") == "core":
                current_progress = resident_progress.get(
                    posting_code, {"completed": 0, "required": 0}
                )
                blocks_completed = current_progress["completed"]
                blocks_required = current_progress["required"]
                blocks_needed = blocks_required - blocks_completed

                print(
                    f"     {posting_code}: {blocks_completed}/{blocks_required} blocks, need {blocks_needed} more"
                )
                if blocks_needed > 0:
                    # Check if this posting is available (not completed)
                    if posting_code not in completed_postings_map.get(mcr, set()):
                        print(f"       ✓ Available for assignment")
                    else:
                        print(
                            f"       ⚠️  INFEASIBLE: Completed but still needs {blocks_needed} more blocks!"
                        )
        print()

    # Check 5: Capacity constraints
    print("5. CAPACITY ANALYSIS:")
    total_blocks_needed = len(residents) * 12  # Each resident needs 12 blocks
    total_blocks_available = (
        sum(posting_info[p]["max_residents"] for p in posting_codes) * 12
    )

    print(f"   Total blocks needed: {total_blocks_needed}")
    print(f"   Total blocks available: {total_blocks_available}")
    if total_blocks_needed > total_blocks_available:
        print(f"   ⚠️  INFEASIBLE: Not enough capacity!")
    print()


def main():
    """Load sample data and analyze."""
    try:
        # Try to load from sample_input.json if it exists
        with open("sample_input.json", "r") as f:
            input_data = json.load(f)

        analyze_infeasibility(
            residents=input_data["residents"],
            resident_history=input_data["resident_history"],
            resident_preferences=input_data["resident_preferences"],
            postings=input_data["postings"],
        )

    except FileNotFoundError:
        print("sample_input.json not found. Please provide input data.")
    except Exception as e:
        print(f"Error: {e}")


if __name__ == "__main__":
    main()
