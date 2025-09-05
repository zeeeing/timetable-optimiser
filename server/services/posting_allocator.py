import sys, json, os
from typing import List, Dict, Optional
import logging

from ortools.sat.python import cp_model

# prepend the base directory to sys.path
BASE_DIR = os.path.dirname(os.path.dirname(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from utils import (
    get_completed_postings,
    get_posting_progress,
    get_core_blocks_completed,
    get_unique_electives_completed,
    to_snake_case,
    variants_for_base,
    CORE_REQUIREMENTS,
    CCR_POSTINGS,
)
from postprocess import compute_postprocess


def allocate_timetable(
    residents: List[Dict],
    resident_history: List[Dict],
    resident_preferences: List[Dict],
    resident_sr_preferences: List[Dict],
    postings: List[Dict],
    weightages: Dict,
    resident_leaves: Optional[List[Dict]] = None,
    pinned_assignments: Optional[Dict[str, List[Dict]]] = None,
) -> Dict:

    ###########################################################################
    # SET UP
    ###########################################################################

    # instantiate the logger
    logging.basicConfig(
        level=logging.INFO,
        stream=sys.stderr,
        format="%(asctime)s %(levelname)s %(message)s",
    )
    logger = logging.getLogger(__name__)

    # instantiate the cp-sat model
    logger.info("STARTING POSTING ALLOCATION SERVICE")
    model = cp_model.CpModel()

    ###########################################################################
    # DEFINE HELPERS
    ###########################################################################

    # create and register assumption literals (for infeasible outcomes)
    assumption_literals = {}

    def new_assumption_literal(name: str, description: str) -> cp_model.IntVar:
        flag = model.NewBoolVar(name)
        model.AddAssumption(flag)
        assumption_literals[name] = description
        return flag

    # define list of all unique elective base codes
    ELECTIVE_BASE_CODES = set(
        [
            p["posting_code"].split(" (")[0]
            for p in postings
            if p.get("posting_type") == "elective"
        ]
    )

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

    # 5. create map of resident mcr to their SR base-code preferences (ranks 1..3)
    sr_pref_map = {}
    for pref in resident_sr_preferences:
        mcr = pref["mcr"]
        if mcr not in sr_pref_map:
            sr_pref_map[mcr] = {}
        sr_pref_map[mcr][pref["preference_rank"]] = pref["base_posting"]

    # 6-8. Use full resident history for credit-bearing calculations (ignore leave metadata)
    completed_postings_map = get_completed_postings(resident_history, posting_info)
    posting_progress = get_posting_progress(resident_history, posting_info)

    # 9. create lists of ED, GRM, GM postings
    ED_codes = [p for p in posting_codes if p.startswith("ED")]
    GRM_codes = [p for p in posting_codes if p.startswith("GRM")]
    GM_codes = [p for p in posting_codes if p.startswith("GM")]

    ###########################################################################
    # CREATE DECISION VARIABLES
    ###########################################################################

    # define block-wise variables
    x = {}
    for resident in residents:
        mcr = resident["mcr"]
        x[mcr] = {}
        for p in posting_codes:
            x[mcr][p] = {}
            for b in blocks:
                x[mcr][p][b] = model.NewBoolVar(f"x_{mcr}_{to_snake_case(p)}_{b}")

    # define selection flags
    selection_flags = {}
    for resident in residents:
        mcr = resident["mcr"]
        selection_flags[mcr] = {}
        for p in posting_codes:
            selection_flags[mcr][p] = model.NewBoolVar(
                f"{mcr}_{to_snake_case(p)}_selected"
            )

    # define posting assignment count: number of times a resident gets assigned a posting
    posting_asgm_count = {}
    for resident in residents:
        mcr = resident["mcr"]
        posting_asgm_count[mcr] = {}

        for p in posting_codes:
            # define the count variable
            required_duration = posting_info[p]["required_block_duration"]
            max_runs = len(blocks) // required_duration

            count = model.NewIntVar(0, max_runs, f"{mcr}_{to_snake_case(p)}_run_count")
            posting_asgm_count[mcr][p] = count

            # bind block-wise variables to posting asgm count variable
            total_blocks = sum(x[mcr][p][b] for b in blocks)
            model.Add(total_blocks == count * required_duration)

            # bind selection flags to posting asgm count variable
            flag = selection_flags[mcr][p]
            # if posting_asgm_count > 0, then selection_flag must be 1
            model.Add(count >= 1).OnlyEnforceIf(flag)
            model.Add(count == 0).OnlyEnforceIf(flag.Not())

    # DEBUG: define per-block slack (OFF) variables
    off = {}
    for resident in residents:
        mcr = resident["mcr"]
        off[mcr] = {}
        for b in blocks:
            off[mcr][b] = model.NewBoolVar(f"{mcr}_OFF_{b}")

    # pinned residents: force exact block/posting for selected residents
    if pinned_assignments:
        logger.info(
            "Applying pinned assignments for %d residents", len(pinned_assignments)
        )
        for mcr, entries in pinned_assignments.items():
            try:
                for entry in entries or []:
                    b = int(entry.get("block"))
                    p = entry.get("posting_code")
                    if p in posting_info and b in blocks:
                        # Force that resident to take posting p at block b
                        model.Add(x[mcr][p][b] == 1)
            except Exception as e:
                logger.warning("Failed to apply pins for %s: %s", mcr, e)

    ###########################################################################
    # DEFINE HARD CONSTRAINTS
    ###########################################################################

    # Hard Constraint 1: Each resident must be assigned to exactly one posting or OFF per block
    for resident in residents:
        mcr = resident["mcr"]

        for b in blocks:
            model.AddExactlyOne([x[mcr][p][b] for p in posting_codes] + [off[mcr][b]])

    # Hard Constraint 2: Each posting cannot exceed max residents per block
    for p in posting_codes:
        max_residents = posting_info[p]["max_residents"]

        for b in blocks:
            model.Add(sum(x[r["mcr"]][p][b] for r in residents) <= max_residents)

    # Hard Constraint 3: Enforce required_block_duration happens in consecutive blocks
    for resident in residents:
        mcr = resident["mcr"]
        for p in posting_codes:
            required_duration = posting_info[p]["required_block_duration"]
            vars = [x[mcr][p][b] for b in blocks]

            if required_duration > 1:
                # build automaton: Deterministic Finite Automaton (DFA)
                d = required_duration
                INIT = 0
                TERM = d + 1
                final_states = {INIT, TERM}
                transitions = []

                # from 0, you either stay on 0 or start a run (to state 1)
                transitions.append((INIT, 0, INIT))  # stay in 0 on 0
                transitions.append((INIT, 1, 1))  # start 1-block at state 1

                # build 1-streak: states 1 -> 2 -> ... -> d -> TERM
                for i in range(1, d):
                    transitions.append((i, 1, i + 1))  # continue streak
                transitions.append((d, 0, TERM))

                # In TERM you can either stay (on 0) or immediately start a new run (on 1)
                transitions += [
                    (TERM, 0, TERM),
                    (TERM, 1, 1),
                ]

                # Add automaton constraint
                model.AddAutomaton(vars, INIT, final_states, transitions)

    # Hard Constraint 4 (CCR): CCR postings
    for resident in residents:
        mcr = resident["mcr"]
        year = resident["resident_year"]
        resident_progress = posting_progress.get(mcr, {})

        done_ccr = any(
            resident_progress.get(ccr_posting, {}).get("is_completed", False)
            for ccr_posting in CCR_POSTINGS
        )

        # extra protective layer of code to ensure user updates both posting codes and ccr posting codes
        offered = [p for p in CCR_POSTINGS if p in posting_codes]

        if done_ccr or year == 1:
            # forbid all CCR blocks entirely
            for p in offered:
                model.Add(posting_asgm_count[mcr][p] == 0)
        else:
            # exactly one run of any CCR posting
            model.Add(sum(posting_asgm_count[mcr][p] for p in offered) == 1)

    # Hard Constraint 5: Ensure core postings are not over-assigned to each resident
    for resident in residents:
        mcr = resident["mcr"]
        resident_progress = posting_progress.get(mcr, {})

        # get core blocks completed
        core_blocks_completed_map = get_core_blocks_completed(
            resident_progress, posting_info
        )

        for base_posting, required_blocks in CORE_REQUIREMENTS.items():
            blocks_completed = core_blocks_completed_map.get(base_posting, 0)

            assigned_blocks = sum(
                x[mcr][p][b]
                for p in posting_codes
                if p.split(" (")[0] == base_posting
                for b in blocks
            )

            if blocks_completed >= required_blocks:
                model.Add(assigned_blocks == 0)
            else:
                model.Add(blocks_completed + assigned_blocks <= required_blocks)

    # Hard Constraint 6: Prevent residents from repeating the same elective regardless of hospital
    for resident in residents:
        mcr = resident["mcr"]
        resident_progress = posting_progress.get(mcr, {})
        base_electives_done = {
            p.split(" (")[0]
            for p in get_unique_electives_completed(resident_progress, posting_info)
        }

        for base_elective in ELECTIVE_BASE_CODES:
            all_variants = [
                p
                for p in posting_codes
                if p.startswith(base_elective + " (")
                and posting_info[p]["posting_type"] == "elective"
            ]

            # base elective has no variants
            if not all_variants:
                continue

            if base_elective in base_electives_done:
                # forbid any runs of this base
                for p in all_variants:
                    model.Add(posting_asgm_count[mcr][p] == 0)
            else:
                # allow at most one run across all variants
                model.Add(sum(posting_asgm_count[mcr][p] for p in all_variants) <= 1)

    # Hard Constraint 7a: if both MICU and RCCM are assigned, they must be from the same institution
    for resident in residents:
        mcr = resident["mcr"]

        # collect all MICU/RCCM postings and their institutions
        micu_rccm_with_inst = [
            (p, p.split(" (")[1].rstrip(")"))
            for p in posting_codes
            if p.startswith("MICU (") or p.startswith("RCCM (")
        ]

        # for each pair of postings from different institutions, forbid selecting both
        for i in range(len(micu_rccm_with_inst)):
            p1, inst1 = micu_rccm_with_inst[i]
            for j in range(i + 1, len(micu_rccm_with_inst)):
                p2, inst2 = micu_rccm_with_inst[j]
                if inst1 != inst2:
                    # selection_flags[mcr][p] == 1  ⇔ posting p is chosen
                    model.Add(selection_flags[mcr][p1] + selection_flags[mcr][p2] <= 1)

    # Hard Constraint 7b: if MICU and RCCM are assigned, they must form one contiguous block
    DEC, JAN = 6 - 1, 7 - 1  # M is 0-indexed
    for resident in residents:
        mcr = resident["mcr"]

        micu_rccm = [
            p for p in posting_codes if p.startswith("MICU (") or p.startswith("RCCM (")
        ]

        # build one BoolVar per block: 1 if block b is MICU or RCCM, else 0
        M = []
        for b in blocks:
            Mb = model.NewBoolVar(f"{mcr}_MICU_RCCM_at_block_{b}")

            # sum all MICU/RCCM postings at block b
            model.Add(sum(x[mcr][p][b] for p in micu_rccm) == Mb)
            M.append(Mb)

        # do not cross dec - jan
        model.AddBoolOr(
            [
                M[DEC].Not(),
                M[JAN].Not(),
            ]
        )

        # states: 0 = before the run, 1 = inside the run, 2 = after the run
        transitions = [
            # (current_state, input_value, next_state)
            (0, 0, 0),  # stay before the run on 0
            (0, 1, 1),  # enter the run on 1
            (1, 1, 1),  # stay inside the run on 1
            (1, 0, 2),  # leave run on 0
            (2, 0, 2),  # stay after the run on 0
            # note: no (2,1,…) transition, so you cannot re-enter the run
        ]
        model.AddAutomaton(
            M,  # the sequence of Mb’s
            0,  # initial state
            [0, 1, 2],  # final states: all three states are accepting
            transitions,
        )

    # Hard Constraint 8: cannot cross over Dec - Jan
    DEC, JAN = 6, 7
    for resident in residents:
        mcr = resident["mcr"]
        for p in posting_codes:
            # at least one of these must be 0, so you can't have a 1 in Dec and a 1 in Jan
            model.AddBoolOr(
                [
                    x[mcr][p][DEC].Not(),
                    x[mcr][p][JAN].Not(),
                ]
            )

    # Hard Constraint 9: GRM must start on odd block numbers
    for resident in residents:
        mcr = resident["mcr"]
        for p in posting_codes:
            if p.startswith("GRM ("):
                for b in blocks:
                    # from 2 onwards and even number
                    if b > blocks[0] and b % 2 == 0:
                        # forbid (x[b]=1 AND x[b-1]=0)
                        # i.e. at least one of these must hold: x[b]=0 OR x[b-1]=1
                        model.AddBoolOr(
                            [
                                # this means that even block no. must be given boolean 0
                                x[mcr][p][b].Not(),
                                # this means that even block no. - 1 (odd number) must be given 1
                                x[mcr][p][b - 1],
                            ]
                        )

    # Hard Constraint 10: 3-month postings must start at months 1, 4, 7, or 10
    # i.e., for postings with required_block_duration == 3, any assignment at a
    # disallowed start month must be a continuation from the previous month.
    # This is enforced by: x[b] => x[b-1] for disallowed start months.
    quarter_starts = {1, 4, 7, 10}
    for resident in residents:
        mcr = resident["mcr"]
        for p in posting_codes:
            if posting_info[p]["required_block_duration"] == 3:
                for b in blocks:
                    if b not in quarter_starts and b > 1:
                        model.AddImplication(x[mcr][p][b], x[mcr][p][b - 1])

    # Hard Constraint 11: GM capped at 3 blocks in Year 1
    gm_ktph_bonus_terms = []
    gm_ktph_bonus_weight = 1

    for resident in residents:
        mcr = resident["mcr"]

        if resident["resident_year"] == 1:
            gm_blocks_count = sum(
                x[mcr][p][b]
                for p in posting_codes
                if p.split(" (")[0] == "GM"
                for b in blocks
            )

            # ensure GM postings are capped at 3 blocks
            model.Add(gm_blocks_count <= 3)

            # bonus for assigning `GM (KTPH)`
            ktph_bonus = sum(
                x[mcr][p][b] for p in posting_codes if p == "GM (KTPH)" for b in blocks
            )
            gm_ktph_bonus_terms.append(gm_ktph_bonus_weight * ktph_bonus)

    # Hard Constraint 12: if ED and GRM present, enforce contiguity
    for resident in residents:
        mcr = resident["mcr"]

        # build one BoolVar per block: 1 if block b is ED or GRM, else 0
        M = []
        for b in blocks:
            Mb = model.NewBoolVar(f"{mcr}_ED_GRM_at_block_{b}")
            # exactly one posting per block, so sum(x for ED+GRM) == Mb
            model.Add(sum(x[mcr][p][b] for p in ED_codes + GRM_codes) == Mb)
            M.append(Mb)

        # states: 0 = before, 1 = in-run, 2 = after
        transitions = [
            (0, 0, 0),
            (0, 1, 1),
            (1, 1, 1),
            (1, 0, 2),
            (2, 0, 2),
            # no (2,1,…) so no re-entry
        ]
        model.AddAutomaton(M, 0, [0, 1, 2], transitions)

    # Hard Constraint 13: if ED + GRM + GM present, enforce contiguity
    for resident in residents:
        mcr = resident["mcr"]

        # build one BoolVar per block: 1 if block b is ED, GRM or GM, else 0
        B = []
        for b in blocks:
            Bb = model.NewBoolVar(f"{mcr}_bundle_at_{b}")
            model.Add(sum(x[mcr][p][b] for p in ED_codes + GRM_codes + GM_codes) == Bb)
            B.append(Bb)

        # states: 0 = before, 1 = in-run, 2 = after
        transitions = [
            (0, 0, 0),
            (0, 1, 1),
            (1, 1, 1),
            (1, 0, 2),
            (2, 0, 2),
        ]
        model.AddAutomaton(B, 0, [0, 1, 2], transitions)

    # Hard Constraint 14: enforce 1 ED and 1 GRM SELECTION if BOTH not done before
    for resident in residents:
        mcr = resident["mcr"]
        progress = get_core_blocks_completed(
            posting_progress.get(mcr, {}), posting_info
        )
        # have they already finished either ED or GRM?
        done_ED = progress.get("ED", 0) >= CORE_REQUIREMENTS.get("ED", 0)
        done_GRM = progress.get("GRM", 0) >= CORE_REQUIREMENTS.get("GRM", 0)

        if not (done_ED or done_GRM):
            model.Add(sum(selection_flags[mcr][p] for p in ED_codes) == 1)
            model.Add(sum(selection_flags[mcr][p] for p in GRM_codes) == 1)

    # Hard Constraint 15: Enforce MICU/RCCM minimum requirements by year
    for resident in residents:
        mcr = resident["mcr"]
        year = resident["resident_year"]
        resident_progress = posting_progress.get(mcr, {})

        # count assigned blocks for the current year
        micu_blocks = sum(
            x[mcr][p][b]
            for p in posting_codes
            if p.startswith("MICU (")
            for b in blocks
        )
        rccm_blocks = sum(
            x[mcr][p][b]
            for p in posting_codes
            if p.startswith("RCCM (")
            for b in blocks
        )

        # count completed MICU/RCCM blocks historically
        micu_count = sum(
            [
                resident_progress.get(p, {}).get("blocks_completed")
                for p in posting_codes
                if p.startswith("MICU (")
                and resident_progress.get(p, {}).get("is_completed", False)
            ]
        )
        rccm_count = sum(
            [
                resident_progress.get(p, {}).get("blocks_completed")
                for p in posting_codes
                if p.startswith("RCCM (")
                and resident_progress.get(p, {}).get("is_completed", False)
            ]
        )

        if year == 1:
            # By end of Y1: MICU >= 1, RCCM >= 2 (inclusive of completed history)
            model.Add(micu_count + micu_blocks >= 1)
            model.Add(rccm_count + rccm_blocks >= 2)
        else:
            if year == 2:
                if micu_count == 0 and rccm_count == 0:
                    model.Add(micu_count + micu_blocks >= 1)
                    model.Add(rccm_count + rccm_blocks >= 2)
            else:
                # For Y2/3: if not yet met overall core requirement, enforce year minima
                if micu_count < CORE_REQUIREMENTS.get("MICU", 3):
                    model.Add(micu_blocks >= 2)
                if rccm_count < CORE_REQUIREMENTS.get("RCCM", 3):
                    model.Add(rccm_blocks >= 1)

    # Hard Constraint 16: Ban SR posting allocation in the last 3 months of Y3
    for resident in residents:
        mcr = resident["mcr"]
        year = resident["resident_year"]
        sr_prefs = sr_pref_map.get(mcr, {})
        if not sr_prefs:
            continue

        # get all base variants
        sr_variants = set()
        for _, base in sr_prefs.items():
            for p in variants_for_base(base, posting_codes):
                sr_variants.add(p)
        sr_variants = list(sr_variants)
        if not sr_variants:
            continue

        # Build per-block SR indicator
        Y = []
        for b in blocks:
            yb = model.NewBoolVar(f"{mcr}_SR_at_block_{b}")
            model.Add(sum(x[mcr][p][b] for p in sr_variants) == yb)
            Y.append(yb)

        # Ban last 3 blocks of Year 3 for SR
        if year == 3:
            for b in [10, 11, 12]:
                if b in blocks:
                    model.Add(Y[b - 1] == 0)

    ###########################################################################
    # DEFINE SOFT CONSTRAINTS WITH PENALTIES
    ###########################################################################

    # Soft Constraint 1: Penalty if minimum electives not completed by end of each year

    # filter for elective postings
    elective_postings = [
        p for p in posting_codes if posting_info[p]["posting_type"] == "elective"
    ]

    # define elective penalty flag per Y2/Y3 resident
    elective_shortfall_penalty_flags = {}
    for resident in residents:
        mcr = resident["mcr"]
        year = resident["resident_year"]

        if year not in (2, 3):
            continue

        elective_shortfall_penalty_flags[mcr] = model.NewBoolVar(
            f"{mcr}_penalty_elective_min"
        )

    # bind each penalty‐flag
    for resident in residents:
        mcr = resident["mcr"]
        year = resident["resident_year"]

        if mcr not in elective_shortfall_penalty_flags:
            continue

        # get historical elective count
        hist = get_unique_electives_completed(
            posting_progress.get(mcr, {}), posting_info
        )
        hist_count = len(hist)

        # get current year assignments
        selection_count = sum(selection_flags[mcr][p] for p in elective_postings)

        # look up their preferences
        resident_prefs = pref_map.get(mcr, {})

        # enforce elective count
        if year == 2:
            required = 1 if not resident_prefs else 2

            model.Add(hist_count + selection_count >= required).OnlyEnforceIf(
                elective_shortfall_penalty_flags[mcr].Not()
            )
            model.Add(hist_count + selection_count < required).OnlyEnforceIf(
                elective_shortfall_penalty_flags[mcr]
            )
        elif year == 3:
            model.Add(hist_count + selection_count == 5).OnlyEnforceIf(
                elective_shortfall_penalty_flags[mcr].Not()
            )
            model.Add(hist_count + selection_count != 5).OnlyEnforceIf(
                elective_shortfall_penalty_flags[mcr]
            )

    # Soft Constraint 2: Penalty if core posting requirements are under-assigned by end of Year 3

    # get all Y3 residents
    y3_residents = [r for r in residents if r["resident_year"] == 3]

    # define core under-assignment flags
    core_shortfall = {}
    for r in y3_residents:
        mcr = r["mcr"]
        core_shortfall[mcr] = {}
        for base, req in CORE_REQUIREMENTS.items():
            # missing blocks range from 0 to req
            core_shortfall[mcr][base] = model.NewIntVar(
                0, req, f"{mcr}_{base}_shortfall"
            )

    for r in y3_residents:
        mcr = r["mcr"]
        core_blocks_completed_map = get_core_blocks_completed(
            posting_progress.get(mcr, {}), posting_info
        )

        for base, req in CORE_REQUIREMENTS.items():
            # get historical count
            hist_done = core_blocks_completed_map.get(base, 0)

            # get current year assignments
            assigned = sum(
                x[mcr][p][b]
                for p in posting_codes
                if p.split(" (")[0] == base
                for b in blocks
            )

            # get shortfall
            slack = core_shortfall[mcr][base]

            if hist_done >= req:
                # done more than or equal to requirements, so force slack = 0
                model.Add(slack == 0)
            else:
                model.Add(hist_done + assigned + slack == req)

    # Hybrid Constraint: SR preference (bonus and timing penalties)
    # Year 3: exactly one SR required, big out-of-window penalty if not in blocks 1–6.
    # Year 2: optional with small penalty if none; still at most one SR; big out-of-window penalty if not in blocks 7–12.
    # Year 1: no SR allowed.
    sr_preference_bonus_terms = []
    sr_preference_bonus_weight = weightages.get("sr_preference")

    sr_not_selected_y2_penalty_terms = []
    sr_not_selected_y2_penalty_weight = weightages.get("sr_y2_not_selected_penalty")

    sr_out_of_window_penalty_terms = []
    sr_out_of_window_penalty_weight = 999  # extreme penalty

    for resident in residents:
        mcr = resident["mcr"]
        year = resident["resident_year"]
        sr_prefs = sr_pref_map.get(mcr, {})
        if not sr_prefs:
            continue

        # get all base variants
        sr_variants = set()
        for _, base in sr_prefs.items():
            for p in variants_for_base(base, posting_codes):
                sr_variants.add(p)
        sr_variants = list(sr_variants)
        if not sr_variants:
            continue

        # SR selection count and selection flag
        sr_count = sum(selection_flags[mcr][p] for p in sr_variants)
        has_sr = model.NewBoolVar(f"{mcr}_has_sr")

        model.Add(sr_count == 1).OnlyEnforceIf(has_sr)
        model.Add(sr_count == 0).OnlyEnforceIf(has_sr.Not())

        if year == 3:
            # exactly one SR in Year 3
            model.Add(sr_count == 1)
        elif year == 2:
            # at most one SR in Year 2; with small penalty if not selected
            model.Add(sr_count <= 1)
            sr_not_selected_y2_penalty_terms.append(
                sr_not_selected_y2_penalty_weight * (1 - has_sr)
            )
        else:
            # do not allow SR selection for all other years (i.e., year 1)
            model.Add(sr_count == 0)

        # SR preference bonus
        for rank, base in sr_prefs.items():
            if not base:
                continue
            base_vars = variants_for_base(base, posting_codes)
            if not base_vars:
                continue

            flag = model.NewBoolVar(f"{mcr}_sr_base_{to_snake_case(base)}_selected")

            model.Add(
                sum(selection_flags[mcr][p] for p in base_vars) == 1
            ).OnlyEnforceIf(flag)
            model.Add(
                sum(selection_flags[mcr][p] for p in base_vars) == 0
            ).OnlyEnforceIf(flag.Not())

            w = sr_preference_bonus_weight * (4 - rank)
            sr_preference_bonus_terms.append(w * flag)

        # huge penalisation if SR assigned outside the allowed window
        if year in (2, 3):
            # block-wise SR indicator
            Y = []
            for b in blocks:
                yb = model.NewBoolVar(f"{mcr}_SR_at_block_{b}")
                model.Add(sum(x[mcr][p][b] for p in sr_variants) == yb)
                Y.append(yb)

            # define the disallowed indices
            if year == 2:
                disallowed_idx = [b - 1 for b in blocks if b <= 6]
            elif year == 3:
                disallowed_idx = [b - 1 for b in blocks if b >= 7]

            # detect if any SR assigned in disallowed window
            sr_in_disallowed = model.NewBoolVar(f"{mcr}_sr_in_disallowed")
            model.Add(sum(Y[i] for i in disallowed_idx) > 0).OnlyEnforceIf(
                sr_in_disallowed
            )
            model.Add(sum(Y[i] for i in disallowed_idx) == 0).OnlyEnforceIf(
                sr_in_disallowed.Not()
            )

            # penalise if they have SR and it is in disallowed window
            sr_penalty_flag = model.NewBoolVar(f"{mcr}_sr_out_of_window")
            model.Add(sr_penalty_flag <= has_sr)
            model.Add(sr_penalty_flag <= sr_in_disallowed)
            model.Add(sr_penalty_flag >= has_sr + sr_in_disallowed - 1)

            sr_out_of_window_penalty_terms.append(
                sr_out_of_window_penalty_weight * sr_penalty_flag
            )

    ###########################################################################
    # DEFINE BONUSES, PENALTIES AND OBJECTIVE
    ###########################################################################

    # 3 GMs bonus if ED + GRM present
    ED_codes = [p for p in posting_codes if p.startswith("ED")]
    GRM_codes = [p for p in posting_codes if p.startswith("GRM")]
    GM_codes = [p for p in posting_codes if p.startswith("GM")]

    three_gm_bonus_terms = []
    three_gm_bonus_weight = 1

    for resident in residents:
        mcr = resident["mcr"]
        flag = model.NewBoolVar(f"{mcr}_three_gm_bonus")

        # detect ED presence
        hasED = model.NewBoolVar(f"{mcr}_hasED")
        model.Add(sum(selection_flags[mcr][p] for p in ED_codes) >= 1).OnlyEnforceIf(
            hasED
        )
        model.Add(sum(selection_flags[mcr][p] for p in ED_codes) == 0).OnlyEnforceIf(
            hasED.Not()
        )

        # detect GRM presence
        hasGRM = model.NewBoolVar(f"{mcr}_hasGRM")
        model.Add(sum(selection_flags[mcr][p] for p in GRM_codes) >= 1).OnlyEnforceIf(
            hasGRM
        )
        model.Add(sum(selection_flags[mcr][p] for p in GRM_codes) == 0).OnlyEnforceIf(
            hasGRM.Not()
        )

        # count total GM blocks
        total_gm = sum(x[mcr][p][b] for p in GM_codes for b in blocks)

        # If they lack ED or GRM, they can never get the bonus
        model.Add(flag == 0).OnlyEnforceIf(hasED.Not())
        model.Add(flag == 0).OnlyEnforceIf(hasGRM.Not())

        model.Add(total_gm == 3).OnlyEnforceIf(flag)
        model.Add(total_gm != 3).OnlyEnforceIf(hasED, hasGRM, flag.Not())

        three_gm_bonus_terms.append(three_gm_bonus_weight * flag)

    # preference bonus
    preference_bonus_terms = []
    preference_bonus_weight = weightages.get("preference")

    for resident in residents:
        mcr = resident["mcr"]
        resident_prefs = pref_map.get(mcr, {})
        for rank, p in resident_prefs.items():
            w = preference_bonus_weight * (6 - rank)
            if p:
                preference_bonus_terms.append(w * selection_flags[mcr][p])

    # seniority bonus
    seniority_bonus_terms = []
    seniority_bonus_weight = weightages.get("seniority")

    for resident in residents:
        mcr = resident["mcr"]
        resident_year = resident["resident_year"]
        for p in posting_codes:
            for b in blocks:
                seniority_bonus_terms.append(
                    resident_year * x[mcr][p][b] * seniority_bonus_weight
                )

    # elective shortfall penalty
    elective_shortfall_penalty_terms = []
    elective_shortfall_penalty_weight = weightages.get("elective_shortfall_penalty")

    for mcr in elective_shortfall_penalty_flags:
        elective_shortfall_penalty_terms.append(
            elective_shortfall_penalty_weight * elective_shortfall_penalty_flags[mcr]
        )

    # core shortfall penalty
    core_shortfall_penalty_terms = []
    core_shortfall_penalty_weight = weightages.get("core_shortfall_penalty")

    for mcr, base_map in core_shortfall.items():
        for base, slack in base_map.items():
            core_shortfall_penalty_terms.append(core_shortfall_penalty_weight * slack)

    # core prioritisation bonus
    CORE_CODES = [p for p in posting_codes if posting_info[p]["posting_type"] == "core"]

    core_bonus_terms = []
    core_bonus_weight = 5

    for resident in residents:
        mcr = resident["mcr"]
        for p in CORE_CODES:
            core_bonus_terms.append(core_bonus_weight * selection_flags[mcr][p])

    # DEBUG: OFF penalty (discourage empty blocks)
    off_penalty_terms = []
    off_penalty_weight = 10000
    for resident in residents:
        mcr = resident["mcr"]
        for b in blocks:
            off_penalty_terms.append(off_penalty_weight * off[mcr][b])

    # Objective
    model.Maximize(
        sum(gm_ktph_bonus_terms)  # static
        + sum(sr_preference_bonus_terms)
        - sum(sr_not_selected_y2_penalty_terms)
        - sum(sr_out_of_window_penalty_terms)  # static
        + sum(three_gm_bonus_terms)  # static
        + sum(preference_bonus_terms)
        + sum(seniority_bonus_terms)
        - sum(elective_shortfall_penalty_terms)
        - sum(core_shortfall_penalty_terms)
        + sum(core_bonus_terms)  # static
        - sum(off_penalty_terms)  # static
    )

    ###########################################################################
    # SOLVE MODEL
    ###########################################################################

    logger.info("Initialising CP-SAT solver...")
    solver = cp_model.CpSolver()

    # solver settings
    solver.parameters.max_time_in_seconds = 60 * 5  # max 5 minutes run time
    solver.parameters.cp_model_presolve = True  # enable presolve for better performance
    solver.parameters.log_search_progress = False  # log solver progress to stderr (will be captured as [PYTHON LOG] by Node.js backend)
    solver.parameters.enumerate_all_solutions = False

    # solve and retrieve status of model
    status = solver.Solve(model)
    logger.info(
        f"Solver returned status {solver.StatusName(status)} with objective {solver.ObjectiveValue()}"
    )

    ###########################################################################
    # PROCESS RESULTS
    ###########################################################################

    # INFEASIBLE
    if status == cp_model.INFEASIBLE:
        logger.info("Model is infeasible. Checking assumptions...")

        core_names = [
            cp_model.short_name(model.Proto(), lit)
            for lit in solver.SufficientAssumptionsForInfeasibility()
        ]
        logger.info("Unsat core: %s", ", ".join(core_names))

    # FEASIBLE
    if status == cp_model.OPTIMAL or status == cp_model.FEASIBLE:
        logger.info("Model is feasible. Preparing output for post-processing...")

        # build full resident_history including current-year assignments
        output_history = []
        for h in resident_history:
            entry = dict(h)
            entry["is_current_year"] = False
            output_history.append(entry)
        for resident in residents:
            mcr = resident["mcr"]
            current_year = resident["resident_year"]
            populated_blocks = set()
            # for each assigned block of each resident...
            for posting_code in posting_codes:
                assigned_blocks = [
                    block
                    for block in blocks
                    if solver.Value(x[mcr][posting_code][block]) > 0.5
                ]
                for block in assigned_blocks:
                    entry = {
                        "mcr": mcr,
                        "year": current_year,
                        "block": block,
                        "posting_code": posting_code,
                        "is_current_year": True,
                        "is_leave": False,
                        "leave_type": "",
                    }
                    output_history.append(entry)
                    populated_blocks.add(block)

            # OFF without leave: append explicit empty posting rows
            for b in blocks:
                if b in populated_blocks:
                    continue
                if solver.Value(off[mcr][b]) > 0.5:
                    output_history.append(
                        {
                            "mcr": mcr,
                            "year": current_year,
                            "block": b,
                            "posting_code": "",
                            "is_current_year": True,
                            "is_leave": False,
                            "leave_type": "",
                        }
                    )

        # DEBUG: log OFF usage per resident (helps pinpoint why blocks aren't filled)
        for resident in residents:
            mcr = resident["mcr"]
            off_blocks = [b for b in blocks if solver.Value(off[mcr][b]) > 0.5]
            if off_blocks:
                logger.info("[DEBUG] OFF used for %s at blocks: %s", mcr, off_blocks)

        payload = {
            "residents": residents,
            "resident_history": output_history,
            "resident_preferences": resident_preferences,
            "resident_sr_preferences": resident_sr_preferences,
            "postings": postings,
            "weightages": weightages,
        }

        # post-processing
        logger.info("Calling postprocess service...")
        result = compute_postprocess(payload)

        logger.info("Posting allocation service completed successfully.")
        return result
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
            resident_sr_preferences=input_data.get("resident_sr_preferences"),
            postings=input_data["postings"],
            weightages=input_data["weightages"],
            resident_leaves=input_data.get("resident_leaves", []),
            pinned_assignments=input_data.get("pinned_assignments", {}),
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
