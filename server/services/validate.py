import sys, json, os
from typing import Dict, List, Tuple

# prepend base dir to import utils
BASE_DIR = os.path.dirname(os.path.dirname(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from utils import (
    get_posting_progress,
    get_core_blocks_completed,
    get_unique_electives_completed,
    get_ccr_postings_completed,
    CORE_REQUIREMENTS,
    CCR_POSTINGS,
)


def _base_of(code: str) -> str:
    return str(code).split(" (")[0].strip()


def _inst_of(code: str) -> str:
    if "(" in str(code) and ")" in str(code):
        try:
            return str(code).split("(")[1].split(")")[0].strip()
        except Exception:
            return ""
    return ""


def main():
    try:
        payload = json.loads(sys.stdin.read() or "{}")
        mcr = payload.get("resident_mcr")
        current_year = payload.get("current_year", []) or []
        residents = payload.get("residents") or []
        resident_history = payload.get("resident_history") or []
        postings = payload.get("postings") or []

        violations: List[Dict[str, str]] = []

        def add_violation(code: str, msg: str):
            violations.append({"code": code, "description": msg})

        if not mcr:
            add_violation("INPUT", "missing resident_mcr")

        # Build posting info map
        posting_info: Dict[str, Dict] = {p.get("posting_code"): p for p in postings}

        # Build map for current-year blocks from input rows
        by_block: Dict[int, str] = {}
        seen_blocks = set()
        for r in current_year:
            try:
                b = int(r.get("month_block") or r.get("block") or 0)
            except Exception:
                b = 0
            code = r.get("posting_code")
            if b < 1 or b > 12:
                add_violation("INPUT", f"invalid month_block {b}")
                continue
            if not code:
                add_violation("INPUT", f"missing posting_code for month_block {b}")
                continue
            if b in seen_blocks:
                add_violation("INPUT", f"duplicate month_block {b}")
                continue
            seen_blocks.add(b)
            by_block[b] = code

        # Early exit if malformed
        if violations:
            print(json.dumps({"success": False, "violations": violations}))
            return

        # ---------- Local-only checks (no cohort/history needed) ----------
        # Contiguity per posting according to required_block_duration
        # and start-month rules for 3-month runs, GRM odd starts, no Dec-Jan crossing.
        def occurrences(code: str) -> List[int]:
            return sorted([b for b, c in by_block.items() if c == code])

        quarter_starts = {1, 4, 7, 10}
        # build list of runs for each posting code in by_block
        for code in set(by_block.values()):
            dur = int(posting_info.get(code, {}).get("required_block_duration", 1))
            occ = occurrences(code)
            if not occ:
                continue
            # derive runs
            runs: List[Tuple[int, int]] = []  # list of (start, length)
            start = occ[0]
            last = occ[0]
            for b in occ[1:]:
                if b == last + 1:
                    last = b
                else:
                    runs.append((start, last - start + 1))
                    start, last = b, b
            runs.append((start, last - start + 1))

            # run-length and start rules
            for s, L in runs:
                if dur > 1 and (s <= 6 and s + L - 1 >= 7):
                    add_violation(
                        "HC8", f"{code}: run starting at {s} crosses Dec–Jan boundary"
                    )
                if dur == 3 and s not in quarter_starts:
                    add_violation(
                        "HC10",
                        f"{code}: 3-month run must start at 1, 4, 7, or 10 (got {s})",
                    )
                # Only enforce exact run length when duration > 1 (solver enforces automaton only then)
                if dur > 1 and L != dur:
                    add_violation(
                        "HC3",
                        f"{code}: run length {L} does not match required duration {dur}",
                    )

            # GRM must start on odd months
            if str(code).startswith("GRM ("):
                for s, _L in runs:
                    if s % 2 == 0:
                        add_violation("HC9", f"GRM must start on odd blocks (got {s})")

        # ED/GRM contiguity: if both present, blocks form a single interval
        ed_grm_blocks = sorted(
            [
                b
                for b, c in by_block.items()
                if str(c).startswith("ED") or str(c).startswith("GRM (")
            ]
        )
        if ed_grm_blocks:
            # no Dec-Jan adjacent
            if 6 in ed_grm_blocks and 7 in ed_grm_blocks:
                add_violation("HC8", "ED/GRM cannot cross Dec–Jan boundary (6→7)")
            # single contiguous interval
            for i in range(1, len(ed_grm_blocks)):
                if ed_grm_blocks[i] != ed_grm_blocks[i - 1] + 1:
                    add_violation(
                        "HC12", "ED/GRM months must be contiguous (single run)"
                    )
                    break

        # MICU/RCCM contiguity and same-institution rule
        micu_blocks = sorted(
            [b for b, c in by_block.items() if str(c).startswith("MICU (")]
        )
        rccm_blocks = sorted(
            [b for b, c in by_block.items() if str(c).startswith("RCCM (")]
        )
        comb_blocks = sorted(micu_blocks + rccm_blocks)
        if comb_blocks:
            if 6 in comb_blocks and 7 in comb_blocks:
                add_violation("HC8", "MICU/RCCM cannot cross Dec–Jan boundary (6→7)")
            for i in range(1, len(comb_blocks)):
                if comb_blocks[i] != comb_blocks[i - 1] + 1:
                    add_violation(
                        "HC7b", "MICU/RCCM months must be contiguous (single run)"
                    )
                    break
            # same institution if both specialties appear
            if micu_blocks and rccm_blocks:
                micu_insts = {
                    _inst_of(c)
                    for b, c in by_block.items()
                    if str(c).startswith("MICU (")
                }
                rccm_insts = {
                    _inst_of(c)
                    for b, c in by_block.items()
                    if str(c).startswith("RCCM (")
                }
                # require intersection to be exactly one and both sets singleton and equal
                if (
                    not micu_insts
                    or not rccm_insts
                    or len(micu_insts | rccm_insts) != 1
                ):
                    add_violation(
                        "HC7a",
                        "MICU and RCCM must be assigned from the same institution",
                    )

        # ---------- Resident + history aware checks ----------
        if residents and resident_history and postings:
            # lookup resident year
            rmap = {r.get("mcr"): r for r in residents}
            resident = rmap.get(mcr)
            resident_year = int(resident.get("resident_year", 0)) if resident else 0

            # Historical progress: use resident_history entries for this resident excluding current year
            past_only = [
                h
                for h in resident_history
                if h.get("mcr") == mcr and not h.get("is_current_year")
            ]
            past_prog = get_posting_progress(past_only, posting_info).get(mcr, {})

            # Core cap: do not exceed required total blocks per base across past+current
            core_completed_hist = get_core_blocks_completed(past_prog, posting_info)
            # count current-year base blocks per base
            base_counts_cy: Dict[str, int] = {}
            for b, code in by_block.items():
                base = _base_of(code)
                if posting_info.get(code, {}).get("posting_type") == "core":
                    base_counts_cy[base] = base_counts_cy.get(base, 0) + 1
            for base, required in CORE_REQUIREMENTS.items():
                hist_done = int(core_completed_hist.get(base, 0))
                cy = int(base_counts_cy.get(base, 0))
                if hist_done + cy > int(required):
                    add_violation(
                        "HC5",
                        f"{base}: exceeds required total blocks ({hist_done}+{cy}>{required})",
                    )

            # Elective base uniqueness across years
            completed_elective_bases = {
                _base_of(p)
                for p in get_unique_electives_completed(past_prog, posting_info)
            }
            for b, code in by_block.items():
                if posting_info.get(code, {}).get("posting_type") == "elective":
                    base = _base_of(code)
                    if base in completed_elective_bases:
                        add_violation(
                            "HC6",
                            f"Elective base '{base}' already completed historically; cannot repeat",
                        )

            # CCR rule: if already done or Y1, forbid CCR; else exactly one run of any CCR posting
            done_ccr = bool(get_ccr_postings_completed(past_prog, posting_info))
            offered = [p for p in CCR_POSTINGS if p in posting_info]
            ccr_blocks = sorted([b for b, c in by_block.items() if c in offered])
            # count number of runs in CCR assignments
            runs = 0
            i = 0
            while i < len(ccr_blocks):
                j = i
                while (
                    j + 1 < len(ccr_blocks) and ccr_blocks[j + 1] == ccr_blocks[j] + 1
                ):
                    j += 1
                runs += 1
                i = j + 1
            if done_ccr or resident_year == 1:
                if runs > 0:
                    add_violation(
                        "HC4",
                        "CCR is already fulfilled or Y1; CCR assignments not allowed",
                    )
            else:
                if runs != 1:
                    add_violation("HC4", "Exactly one contiguous CCR run is required")

            # Y1 GM cap at 3 blocks
            if resident_year == 1:
                gm_cy = sum(1 for _, c in by_block.items() if _base_of(c) == "GM")
                if gm_cy > 3:
                    add_violation("HC11", "Year 1: GM blocks are capped at 3")

            # No soft warnings in simplified model

        # ---------- Cohort-aware checks (capacity) ----------
        if residents and resident_history and postings:
            # Build capacity map with proposed change applied
            # start from current-year entries in resident_history
            cur = [h for h in resident_history if h.get("is_current_year")]
            # replace this resident's current-year with proposed
            cur = [h for h in cur if h.get("mcr") != mcr]
            for b, code in by_block.items():
                cur.append(
                    {
                        "mcr": mcr,
                        "month_block": int(b),
                        "posting_code": code,
                        "is_current_year": True,
                    }
                )
            # count per posting per block
            cap: Dict[str, Dict[int, int]] = {}
            for h in cur:
                p = h.get("posting_code")
                b = int(h.get("month_block") or h.get("block") or 0)
                if not p or b < 1 or b > 12:
                    continue
                cap.setdefault(p, {})[b] = cap.get(p, {}).get(b, 0) + 1
            # check overflow
            for p_code, by_b in cap.items():
                max_r = int(posting_info.get(p_code, {}).get("max_residents", 0))
                for b, filled in by_b.items():
                    if filled > max_r:
                        add_violation(
                            "HC2",
                            f"Capacity exceeded for {p_code} at month_block {b}: {filled}>{max_r}",
                        )

        # Return
        if violations:
            print(json.dumps({"success": False, "violations": violations}))
        else:
            print(json.dumps({"success": True, "violations": []}))
    except Exception as e:
        sys.stderr.write(str(e))
        sys.exit(1)


if __name__ == "__main__":
    main()
