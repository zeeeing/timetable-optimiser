from typing import Any, Dict, List, Tuple

from server.utils import (
    get_posting_progress,
    get_core_blocks_completed,
    get_unique_electives_completed,
    get_ccr_postings_completed,
    CORE_REQUIREMENTS,
    CCR_POSTINGS,
    MONTH_LABELS,
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


def validate_assignment(payload: Dict[str, Any]) -> Dict[str, Any]:
    mcr = payload.get("resident_mcr")
    current_year = payload.get("current_year") or []
    residents = payload.get("residents") or []
    resident_history = payload.get("resident_history") or []
    postings = payload.get("postings") or []

    warnings: List[Dict[str, str]] = []

    def add_warning(code: str, msg: str):
        warnings.append({"code": code, "description": msg})

    if not mcr:
        add_warning("INPUT", "missing resident_mcr")

    posting_info: Dict[str, Dict] = {p.get("posting_code"): p for p in postings}

    by_block: Dict[int, str] = {}
    seen_blocks = set()
    for r in current_year:
        try:
            b = int(r.get("month_block") or r.get("block") or 0)
        except Exception:
            b = 0
        code = r.get("posting_code")
        if b < 1 or b > 12:
            add_warning("INPUT", f"invalid month_block {b}")
            continue
        if not code:
            add_warning("INPUT", f"missing posting_code for month_block {b}")
            continue
        if b in seen_blocks:
            add_warning("INPUT", f"duplicate month_block {b}")
            continue
        seen_blocks.add(b)
        by_block[b] = code

    if warnings:
        return {"success": False, "warnings": warnings}

    def occurrences(code: str) -> List[int]:
        return sorted([b for b, c in by_block.items() if c == code])

    def idxToMonth(idx: int) -> str:
        if 1 <= idx <= 12:
            return MONTH_LABELS[idx - 1]
        return f"Month {idx}"

    quarter_starts = {1, 4, 7, 10}
    # HC3/HC8/HC9/HC10: duration, boundary, start-month, and GRM odd-block checks
    for code in set(by_block.values()):
        dur = int(posting_info.get(code, {}).get("required_block_duration", 1))
        occ = occurrences(code)
        if not occ:
            continue
        runs: List[Tuple[int, int]] = []
        start = occ[0]
        last = occ[0]
        for b in occ[1:]:
            if b == last + 1:
                last = b
            else:
                runs.append((start, last - start + 1))
                start, last = b, b
        runs.append((start, last - start + 1))

        for s, L in runs:
            if dur > 1 and (s <= 6 and s + L - 1 >= 7):
                add_warning(
                    "HC8",
                    f"{code}: Posting starting on {idxToMonth(s)} crosses Dec–Jan boundary",
                )
            if dur == 3 and s not in quarter_starts:
                add_warning(
                    "HC10",
                    f"{code}: 3-month posting must start at Jul, Oct, Jan, or Apr (currently starts on {idxToMonth(s)})",
                )
            if dur > 1 and L != dur:
                add_warning(
                    "HC3",
                    f"{code}: Posting length of {L} month(s) does not match required duration of {dur} months (must be contiguous)",
                )

        if str(code).startswith("GRM ("):
            for s, _L in runs:
                if s % 2 == 0:
                    add_warning(
                        "HC9",
                        f"GRM can only start on alternating months, starting from Jul (currently starts on {idxToMonth(s)})",
                    )

    # HC8/HC12: ED and GRM must be contiguous and cannot cross half-year boundary
    ed_grm_blocks = sorted(
        [
            b
            for b, c in by_block.items()
            if str(c).startswith("ED") or str(c).startswith("GRM (")
        ]
    )
    if ed_grm_blocks:
        if 6 in ed_grm_blocks and 7 in ed_grm_blocks:
            add_warning("HC8", "ED/GRM cannot cross Dec–Jan boundary (6→7)")
        for i in range(1, len(ed_grm_blocks)):
            if ed_grm_blocks[i] != ed_grm_blocks[i - 1] + 1:
                add_warning("HC12", "ED/GRM postings must be contiguous (single run)")
                break

    # HC7a/HC7b/HC8: MICU + RCCM contiguous, same institution, stay within half-year boundary
    micu_blocks = sorted(
        [b for b, c in by_block.items() if str(c).startswith("MICU (")]
    )
    rccm_blocks = sorted(
        [b for b, c in by_block.items() if str(c).startswith("RCCM (")]
    )
    comb_blocks = sorted(micu_blocks + rccm_blocks)
    if comb_blocks:
        if 6 in comb_blocks and 7 in comb_blocks:
            add_warning("HC8", "MICU/RCCM cannot cross Dec–Jan boundary (6→7)")
        for i in range(1, len(comb_blocks)):
            if comb_blocks[i] != comb_blocks[i - 1] + 1:
                add_warning(
                    "HC7b", "MICU/RCCM postings must be contiguous (single run)"
                )
                break
        if micu_blocks and rccm_blocks:
            micu_insts = {
                _inst_of(c) for b, c in by_block.items() if str(c).startswith("MICU (")
            }
            rccm_insts = {
                _inst_of(c) for b, c in by_block.items() if str(c).startswith("RCCM (")
            }
            if not micu_insts or not rccm_insts or len(micu_insts | rccm_insts) != 1:
                add_warning(
                    "HC7a",
                    "MICU and RCCM must be assigned from the same institution",
                )

    # KIV; might set to turn off later
    if residents and resident_history and postings:
        # HC5: core blocks cannot exceed required total
        rmap = {r.get("mcr"): r for r in residents}
        resident = rmap.get(mcr)
        resident_year = int(resident.get("resident_year", 0)) if resident else 0

        past_only = [
            h
            for h in resident_history
            if h.get("mcr") == mcr and not h.get("is_current_year")
        ]
        past_prog = get_posting_progress(past_only, posting_info).get(mcr, {})

        core_completed_hist = get_core_blocks_completed(past_prog, posting_info)
        base_counts_cy: Dict[str, int] = {}
        for _, code in by_block.items():
            base = _base_of(code)
            if posting_info.get(code, {}).get("posting_type") == "core":
                base_counts_cy[base] = base_counts_cy.get(base, 0) + 1
        for base, required in CORE_REQUIREMENTS.items():
            hist_done = int(core_completed_hist.get(base, 0))
            cy = int(base_counts_cy.get(base, 0))
            if hist_done + cy > int(required):
                add_warning(
                    "HC5",
                    f"{base}: exceeds total month requirement (completed: {hist_done} + assigned: {cy} > required: {required})",
                )

        # HC6: electives cannot repeat by base posting
        completed_elective_bases = {
            _base_of(p) for p in get_unique_electives_completed(past_prog, posting_info)
        }
        for _, code in by_block.items():
            if posting_info.get(code, {}).get("posting_type") == "elective":
                base = _base_of(code)
                if base in completed_elective_bases:
                    add_warning(
                        "HC6",
                        f"Elective '{base}' already assigned before; cannot repeat",
                    )

        # HC4: CCR permitted exactly once (unless already completed or Y1)
        done_ccr = bool(get_ccr_postings_completed(past_prog, posting_info))
        offered = [p for p in CCR_POSTINGS if p in posting_info]
        ccr_blocks = sorted([b for b, c in by_block.items() if c in offered])
        runs = 0
        i = 0
        while i < len(ccr_blocks):
            j = i
            while j + 1 < len(ccr_blocks) and ccr_blocks[j + 1] == ccr_blocks[j] + 1:
                j += 1
            runs += 1
            i = j + 1
        if done_ccr or resident_year == 1:
            if runs > 0:
                if resident_year == 1:
                    add_warning("HC4", "CCR assignments not allowed in Y1")
                else:
                    add_warning(
                        "HC4",
                        "CCR is already fulfilled",
                    )
        else:
            if runs != 1:
                add_warning(
                    "HC4",
                    "Exactly one CCR posting must be assigned during by end of Residency Year 2",
                )

        # HC11: Y1 residents limited to 3 GM blocks
        if resident_year == 1:
            gm_cy = sum(1 for _, c in by_block.items() if _base_of(c) == "GM")
            if gm_cy > 3:
                add_warning(
                    "HC11", "GM postings are capped at 3 months in Residency Year 1"
                )

    # KIV; might set to turn off later
    if residents and resident_history and postings:
        # HC2: enforce per-posting capacity by block
        cur = [h for h in resident_history if h.get("is_current_year")]
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
        cap: Dict[str, Dict[int, int]] = {}
        for h in cur:
            p = h.get("posting_code")
            b = int(h.get("month_block") or h.get("block") or 0)
            if not p or b < 1 or b > 12:
                continue
            cap.setdefault(p, {})[b] = cap.get(p, {}).get(b, 0) + 1
        for p_code, by_b in cap.items():
            max_r = int(posting_info.get(p_code, {}).get("max_residents", 0))
            for b, filled in by_b.items():
                if filled > max_r:
                    add_warning(
                        "HC2",
                        f"Capacity exceeded for {p_code} on {idxToMonth(b)} (current: {filled}, max cap: {max_r})",
                    )

    return {"success": not warnings, "warnings": warnings}
