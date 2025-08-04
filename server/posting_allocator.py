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

    # helper to create and register an assumption literal (for debugging infeasibility)
    def new_assumption_literal(name):
        flag = model.NewBoolVar(name)
        model.AddAssumption(flag)
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

    # 5. get completed postings for each resident
    completed_postings_map = get_completed_postings(resident_history, posting_info)

    # 6. get posting progress for each resident
    posting_progress = get_posting_progress(resident_history, posting_info)

    # 7.
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

    ###########################################################################
    # DEFINE HARD CONSTRAINTS
    ###########################################################################

    # Hard Constraint 1: Each resident must be assigned to at most one posting per block
    for resident in residents:
        mcr = resident["mcr"]

        for b in blocks:
            model.AddAtMostOne(x[mcr][p][b] for p in posting_codes)

    # Hard Constraint 2: Each posting cannot exceed max residents per block
    for p in posting_codes:
        max_residents = posting_info[p]["max_residents"]

        for b in blocks:
            model.Add(sum(x[r["mcr"]][p][b] for r in residents) <= max_residents)

    # General Constraint 3: Residents can't be assigned to postings they've already completed
    # for resident in residents:
    #     mcr = resident["mcr"]
    #     resident_completed_postings = completed_postings_map.get(mcr, set())
    #     for posting_code in resident_completed_postings:
    #         if posting_code in x[mcr]:
    #             for block in blocks:
    #                 model.Add(x[mcr][posting_code][block] == 0)

    # Hard Constraint 4: Enforce required_block_duration happens in consecutive blocks
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

    # Hard Constraint 5 (CCR): CCR postings
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

    # Hard Constraint 6: Ensure core postings are not over-assigned to each resident
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

    # Hard Constraint 7: Prevent residents from repeating the same elective regardless of hospital
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

    # Hard Constraint 8a: if both MICU and RCCM are assigned, they must be from the same institution
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

    # Hard Constraint 8b: if MICU and RCCM are assigned, they must form one contiguous block
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

    # Hard Constraint 9: cannot cross over Dec - Jan
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

    # Hard Constraint 10: GRM must start on odd block numbers
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

    # Hard Constraint 11: GM capped at 3 blocks in Year 1
    gm_ktph_bonus = []
    gm_ktph_weight = weightages.get("gm_ktph_bonus", 2)

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
            gm_ktph_bonus.append(gm_ktph_weight * ktph_bonus)

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

    # Hard Constraint 14: enforce 1 ED and 1 GRM SELECTION if both not done before
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

    ###########################################################################
    # DEFINE SOFT CONSTRAINTS WITH PENALTIES
    ###########################################################################

    # Soft Constraint 1: RCCM and MICU requirements

    # build micu and rccm assignment flags
    enc_yr1_micu = {}
    enc_yr1_rccm = {}
    enc_other_micu = {}
    enc_other_rccm = {}
    for resident in residents:
        mcr = resident["mcr"]

        enc_yr1_micu[mcr] = model.NewBoolVar(f"{mcr}_enc_yr1_micu")
        enc_yr1_rccm[mcr] = model.NewBoolVar(f"{mcr}_enc_yr1_rccm")
        enc_other_micu[mcr] = model.NewBoolVar(f"{mcr}_enc_other_micu")
        enc_other_rccm[mcr] = model.NewBoolVar(f"{mcr}_enc_other_rccm")

    # encourage RCCM >= 2 and MICU >= 1 for y1,
    # RCCM >= 1 and MICU >= 2 for other years
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

        # count completed MICU/RCCM postings
        micu_count = sum(
            [
                resident_progress.get(p, {}).get("is_completed", False)
                for p in posting_codes
                if p.startswith("MICU (")
            ]
        )
        rccm_count = sum(
            [
                resident_progress.get(p, {}).get("is_completed", False)
                for p in posting_codes
                if p.startswith("RCCM (")
            ]
        )

        if year == 1:
            if micu_count < 1:
                # award only if more than or equal to 1
                model.Add(micu_blocks >= 1).OnlyEnforceIf(enc_yr1_micu[mcr])
                model.Add(micu_blocks == 0).OnlyEnforceIf(enc_yr1_micu[mcr].Not())
            else:
                model.Add(enc_yr1_micu[mcr] == 0)

            if rccm_count < 2:
                # award only if more than or equal to 2
                model.Add(rccm_blocks >= 2).OnlyEnforceIf(enc_yr1_rccm[mcr])
                model.Add(rccm_blocks <= 1).OnlyEnforceIf(enc_yr1_rccm[mcr].Not())
            else:
                model.Add(enc_yr1_rccm[mcr] == 0)

            # turn off “other‐year” flags
            model.Add(enc_other_micu[mcr] == 0)
            model.Add(enc_other_rccm[mcr] == 0)

        else:
            # for Year-2/3
            if micu_count < CORE_REQUIREMENTS.get("MICU", 3):
                model.Add(micu_blocks >= 2).OnlyEnforceIf(enc_other_micu[mcr])
                model.Add(micu_blocks <= 1).OnlyEnforceIf(enc_other_micu[mcr].Not())
            else:
                model.Add(enc_other_micu[mcr] == 0)

            if rccm_count < CORE_REQUIREMENTS.get("RCCM", 3):
                model.Add(rccm_blocks >= 1).OnlyEnforceIf(enc_other_rccm[mcr])
                model.Add(rccm_blocks == 0).OnlyEnforceIf(enc_other_rccm[mcr].Not())
            else:
                model.Add(enc_other_rccm[mcr] == 0)

            # turn off “yr1” flags
            model.Add(enc_yr1_micu[mcr] == 0)
            model.Add(enc_yr1_rccm[mcr] == 0)

    # Soft Constraint 2: Penalty if minimum electives not completed by end of each year

    # filter for elective postings
    elective_postings = [
        p for p in posting_codes if posting_info[p]["posting_type"] == "elective"
    ]

    # define elective penalty flag per Y2/Y3 resident
    elective_penalty_flags = {}
    for resident in residents:
        mcr = resident["mcr"]
        year = resident["resident_year"]

        if year not in (2, 3):
            continue

        elective_penalty_flags[mcr] = model.NewBoolVar(f"{mcr}_penalty_elective_min")

    # bind each penalty‐flag
    for resident in residents:
        mcr = resident["mcr"]
        year = resident["resident_year"]

        if mcr not in elective_penalty_flags:
            continue

        # get historical elective count
        hist = get_unique_electives_completed(
            posting_progress.get(mcr, {}), posting_info
        )
        hist_count = len(hist)

        # get current year assignments
        selection_count = sum(selection_flags[mcr][p] for p in elective_postings)

        # enforce elective count
        if year == 2:
            model.Add(hist_count + selection_count >= 2).OnlyEnforceIf(
                elective_penalty_flags[mcr].Not()
            )
            model.Add(hist_count + selection_count < 2).OnlyEnforceIf(
                elective_penalty_flags[mcr]
            )
        elif year == 3:
            model.Add(hist_count + selection_count == 5).OnlyEnforceIf(
                elective_penalty_flags[mcr].Not()
            )
            model.Add(hist_count + selection_count != 5).OnlyEnforceIf(
                elective_penalty_flags[mcr]
            )

    # Soft Constraint 3: Penalty if core posting requirements are under-assigned by end of Year 3

    # get all y3 residents
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

            model.Add(hist_done + assigned + slack == req)

    ###########################################################################
    # DEFINE BONUSES, PENALTIES AND OBJECTIVE
    ###########################################################################

    # micu and rccm bonus
    micu_rccm_bonus = []
    micu_rccm_weight = weightages.get("micu_rccm_weight", 5)

    for resident in residents:
        mcr = resident["mcr"]
        micu_rccm_bonus += [
            micu_rccm_weight * enc_yr1_micu[mcr],
            micu_rccm_weight * enc_yr1_rccm[mcr],
            micu_rccm_weight * enc_other_micu[mcr],
            micu_rccm_weight * enc_other_rccm[mcr],
        ]

    # preference bonus
    preference_bonus = []
    pref_weight = weightages.get("preference", 1)

    for resident in residents:
        mcr = resident["mcr"]
        resident_prefs = pref_map.get(mcr, {})
        for rank, p in resident_prefs.items():
            w = pref_weight * (6 - rank)
            if p:
                preference_bonus.append(w * selection_flags[mcr][p])

    # seniority bonus
    seniority_bonus = []
    seniority_weight = weightages.get("seniority", 2)

    for resident in residents:
        mcr = resident["mcr"]
        resident_year = resident.get("resident_year", 1)
        for p in posting_codes:
            for b in blocks:
                seniority_bonus.append(resident_year * x[mcr][p][b] * seniority_weight)

    # elective shortfall penalty
    elective_penalty_weight = weightages.get("elective_penalty", 10)

    elective_penalty_terms = [
        elective_penalty_weight * elective_penalty_flags[mcr]
        for mcr in elective_penalty_flags
    ]

    # core shortfall penalty
    core_penalty_terms = []
    core_penalty_weight = weightages.get("core_penalty", 10)

    for mcr, base_map in core_shortfall.items():
        for base, slack in base_map.items():
            core_penalty_terms.append(core_penalty_weight * slack)

    # prioritise core postings
    CORE_CODES = [p for p in posting_codes if posting_info[p]["posting_type"] == "core"]

    core_bonus_terms = []
    core_weight = 5

    for resident in residents:
        mcr = resident["mcr"]
        for p in CORE_CODES:
            core_bonus_terms.append(core_weight * selection_flags[mcr][p])

    # Objective
    model.Maximize(
        sum(gm_ktph_bonus)
        + sum(micu_rccm_bonus)
        + sum(preference_bonus)
        + sum(seniority_bonus)
        - sum(elective_penalty_terms)
        - sum(core_penalty_terms)
        + sum(core_bonus_terms)
    )

    ###########################################################################
    # SOLVE MODEL
    ###########################################################################

    logger.info("Initialising CP-SAT solver...")
    solver = cp_model.CpSolver()

    # solver settings
    solver.parameters.max_time_in_seconds = 60 * 5  # 5 minutes
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

        # log penalties incurred
        logger.info("Logging penalties...")

        # for name, var in curr_deviation_penalty_vars.items():
        #     value = solver.Value(var)
        #     if value > 0:
        #         logger.info(f"⚠️ Penalty triggered: {name} → {value}")

        # # print summary of soft constraints violated
        # resident_summary = {}
        # for resident in residents:
        #     mcr = resident["mcr"]
        #     summary = {}

        #     # core under-assignments
        #     for base in CORE_REQUIREMENTS:
        #         penalty_key = f"core_under_{mcr}_{base}"
        #         penalty_var = curr_deviation_penalty_vars.get(penalty_key)
        #         if penalty_var is not None and solver.Value(penalty_var) > 0:
        #             summary[f"Missing Core: {base}"] = solver.Value(penalty_var)

        #     # RCCM & MICU
        #     if resident["resident_year"] == 1:
        #         for key in ["rccm_penalty", "micu_penalty"]:
        #             penalty_key = f"{key}_{mcr}"
        #             penalty_var = curr_deviation_penalty_vars.get(penalty_key)
        #             if penalty_var is not None and solver.Value(penalty_var) > 0:
        #                 label = "Missing RCCM" if "rccm" in key else "Missing MICU"
        #                 summary[label] = solver.Value(penalty_var)

        #     # gaps in electives
        #     for year in [2, 3]:
        #         penalty_key = f"elective_penalty_{mcr}_y{year}"
        #         penalty_var = curr_deviation_penalty_vars.get(penalty_key)
        #         if penalty_var is not None and solver.Value(penalty_var) > 0:
        #             summary[f"Elective shortfall (Y{year})"] = solver.Value(penalty_var)

        #     if summary:
        #         resident_summary[mcr] = summary

        # for mcr, summary in resident_summary.items():
        #     logger.info(f"🔍 {mcr} Soft Constraint Summary:")
        #     for label, value in summary.items():
        #         logger.info(f"  - {label}: {value}")

        logger.info("All penalties logged.")

        logger.info("Processing output results...")

        output_residents = []
        # add `is_current_year` field to resident history
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

            # get core blocks and unique electives completed
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

        # calculate cohort statistics

        # 1. optimisation scores
        optimisation_scores = []
        for resident in residents:
            mcr = resident["mcr"]
            resident_year = resident.get("resident_year", 1)
            assigned_postings = [
                h for h in output_history if h["mcr"] == mcr and h["is_current_year"]
            ]

            # a. preference satisfaction
            resident_prefs = pref_map.get(mcr, {})
            preference_score = 0
            for h in assigned_postings:
                assigned_posting = h["posting_code"]
                for rank in range(1, 6):
                    if resident_prefs.get(rank) == assigned_posting:
                        preference_score += (6 - rank) * pref_weight
                        break

            # b. seniority bonus
            seniority_bonus = len(assigned_postings) * resident_year * seniority_weight

            # tabulate scores
            actual_score = preference_score + seniority_bonus
            optimisation_scores.append(actual_score)

        # normalise to highest score obtained in cohort
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

        # tabulate cohort statistics and append results to output
        cohort_statistics = {
            "optimisation_scores": optimisation_scores,
            "optimisation_scores_normalised": optimisation_scores_percentage,
            "posting_util": posting_util,
        }

        logger.info("Output results processed successfully.")

        logger.info("Posting allocation service completed successfully.")

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
