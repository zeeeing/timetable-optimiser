import copy
import csv
import io
import json
from collections import Counter
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException
from starlette.datastructures import FormData, UploadFile


CSV_HEADER_SPECS: Dict[str, Dict[str, Any]] = {
    "residents": {
        "label": "Residents CSV",
        "required": ["mcr", "name", "resident_year", "career_blocks_completed"],
        "aliases": {"career_blocks_completed": ["careerBlocksCompleted"]},
    },
    "resident_history": {
        "label": "Resident History CSV",
        "required": [
            "mcr",
            "year",
            "month_block",
            "career_block",
            "posting_code",
            "is_current_year",
            "is_leave",
            "leave_type",
        ],
        "aliases": {"is_current_year": ["isCurrentYear"], "is_leave": ["isLeave"]},
    },
    "resident_preferences": {
        "label": "Resident Preferences CSV",
        "required": ["mcr", "preference_rank", "posting_code"],
        "aliases": {},
    },
    "resident_sr_preferences": {
        "label": "SR Preferences CSV",
        "required": ["mcr", "preference_rank", "base_posting"],
        "aliases": {},
    },
    "postings": {
        "label": "Postings CSV",
        "required": [
            "posting_code",
            "posting_name",
            "posting_type",
            "max_residents",
            "required_block_duration",
        ],
        "aliases": {},
    },
    "resident_leaves": {
        "label": "Resident Leaves CSV",
        "required": ["mcr", "month_block", "leave_type", "posting_code"],
        "aliases": {},
    },
}


def _sanitise_header(value: Any) -> str:
    try:
        text = str(value or "")
    except Exception:
        text = ""
    return text.strip().lstrip("\ufeff")


def _validate_csv_headers(
    headers: Optional[List[str]],
    required_headers: List[str],
    file_label: str,
    header_aliases: Optional[Dict[str, List[str]]] = None,
) -> None:
    """
    Ensure each CSV contains the expected headers without blanks or duplicates.
    """

    if not headers:
        raise HTTPException(
            status_code=400,
            detail=f"[{file_label}] No column headers found. Please check the CSV formatting.",
        )

    stripped_headers: List[str] = []
    blank_headers = []
    for header in headers:
        sanitised = _sanitise_header(header)
        if not sanitised:
            blank_headers.append(header)
        else:
            stripped_headers.append(sanitised)

    if blank_headers:
        raise HTTPException(
            status_code=400,
            detail=f"[{file_label}] Found blank column header(s). Please name every column.",
        )

    duplicates = [h for h, count in Counter(stripped_headers).items() if count > 1]
    if duplicates:
        dup_list = ", ".join(duplicates)
        raise HTTPException(
            status_code=400,
            detail=f"[{file_label}] Duplicate column header(s): {dup_list}.",
        )

    header_aliases = header_aliases or {}
    missing = []
    for required in required_headers:
        candidates = [required] + header_aliases.get(required, [])
        if not any(candidate in stripped_headers for candidate in candidates):
            missing.append(required)
    if missing:
        missing_list = ", ".join(missing)
        raise HTTPException(
            status_code=400,
            detail=f"[{file_label}] Missing required column(s): {missing_list}.",
        )


def parse_boolean_flag(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    if isinstance(value, (int, float)):
        return value != 0
    try:
        value_str = str(value).strip().lower()
    except Exception:
        return False
    if not value_str:
        return False
    if value_str in {"1", "true", "yes", "y"}:
        return True
    if value_str in {"0", "false", "no", "n"}:
        return False
    try:
        return float(value_str) != 0
    except (TypeError, ValueError):
        return False


def parse_int(value: Any) -> Optional[int]:
    try:
        result = int(str(value).strip())
    except (TypeError, ValueError, AttributeError):
        return None
    return result


def parse_max_time_in_minutes(raw: Any) -> Optional[int]:
    value = parse_int(raw)
    if value is None or value <= 0:
        return None
    return value


def parse_weightages(
    raw: Any, fallback: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    fallback = {**(fallback or {})}
    if raw is None:
        return fallback
    try:
        if isinstance(raw, str) and raw.strip():
            data = json.loads(raw)
        elif isinstance(raw, dict):
            data = raw
        else:
            data = {}
    except json.JSONDecodeError:
        data = {}
    merged = fallback.copy()
    merged.update(data or {})
    return merged


def parse_pinned_list(raw: Any) -> List[str]:
    if raw is None:
        return []
    if isinstance(raw, list):
        return [str(item).strip() for item in raw if str(item).strip()]
    try:
        parsed = json.loads(raw) if isinstance(raw, str) else raw
    except (TypeError, json.JSONDecodeError):
        return []
    if not isinstance(parsed, list):
        return []
    return [str(item).strip() for item in parsed if str(item).strip()]


async def _read_csv_upload(
    upload: UploadFile,
    expected_headers: List[str],
    file_label: str,
    header_aliases: Optional[Dict[str, List[str]]] = None,
) -> List[Dict[str, Any]]:
    content = await upload.read()
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise HTTPException(
            status_code=400,
            detail=f"[{file_label}] Unable to decode CSV as UTF-8: {exc}",
        ) from exc

    reader = csv.DictReader(io.StringIO(text.lstrip("\ufeff")))
    _validate_csv_headers(
        reader.fieldnames, expected_headers, file_label, header_aliases
    )
    if reader.fieldnames:
        reader.fieldnames = [_sanitise_header(h) for h in reader.fieldnames]
    try:
        return [dict(row) for row in reader]
    except csv.Error as exc:
        raise HTTPException(
            status_code=400, detail=f"[{file_label}] Invalid CSV format: {exc}"
        ) from exc


########################################################################
# Formatting functions for each CSV type
########################################################################


def _format_residents(records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    formatted = []
    for row in records:
        career_blocks = parse_int(
            row.get("career_blocks_completed") or row.get("careerBlocksCompleted")
        )
        resident_year = parse_int(row.get("resident_year")) or 0
        formatted.append(
            {
                "mcr": str(row.get("mcr") or "").strip(),
                "name": str(row.get("name") or "").strip(),
                "resident_year": resident_year,
                "career_blocks_completed": career_blocks,
            }
        )
    return formatted


def _format_resident_history(records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    formatted: List[Dict[str, Any]] = []
    for row in records:
        mcr = str(row.get("mcr") or "").strip()
        month_block = parse_int(row.get("month_block"))
        if month_block is None:
            continue
        if month_block < 1 or month_block > 12:
            raise HTTPException(
                status_code=400,
                detail=f"[Resident History CSV] Invalid month_block '{month_block}' for resident {mcr}: must be between 1 and 12.",
            )
        year = parse_int(row.get("year"))
        if year is None:
            continue
        career_block = parse_int(row.get("career_block"))
        formatted.append(
            {
                "mcr": mcr,
                "year": year,
                "month_block": month_block,
                "career_block": career_block,
                "posting_code": str(row.get("posting_code") or "").strip(),
                "is_current_year": parse_boolean_flag(
                    row.get("is_current_year") or row.get("isCurrentYear")
                ),
                "is_leave": parse_boolean_flag(
                    row.get("is_leave") or row.get("isLeave")
                ),
                "leave_type": str(row.get("leave_type") or "").strip(),
            }
        )
    return formatted


def _format_preferences(records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    formatted = []
    for row in records:
        posting_code = str(row.get("posting_code") or "").strip()
        if not posting_code:
            continue
        formatted.append(
            {
                "mcr": str(row.get("mcr") or "").strip(),
                "preference_rank": parse_int(row.get("preference_rank")) or 0,
                "posting_code": posting_code,
            }
        )
    return formatted


def _format_sr_preferences(records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    formatted = []
    for row in records:
        base_posting = str(row.get("base_posting") or "").strip()
        if not base_posting:
            continue
        formatted.append(
            {
                "mcr": str(row.get("mcr") or "").strip(),
                "preference_rank": parse_int(row.get("preference_rank")) or 0,
                "base_posting": base_posting,
            }
        )
    return formatted


def _format_postings(records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    formatted = []
    for row in records:
        max_residents = parse_int(row.get("max_residents"))
        if max_residents is None:
            max_residents = 0

        required_block_duration = parse_int(row.get("required_block_duration"))
        if required_block_duration is None:
            required_block_duration = 1

        formatted.append(
            {
                "posting_code": str(row.get("posting_code") or "").strip(),
                "posting_name": str(row.get("posting_name") or "").strip(),
                "posting_type": str(row.get("posting_type") or "").strip(),
                "max_residents": max_residents,
                "required_block_duration": required_block_duration,
            }
        )
    return formatted


def _format_resident_leaves(records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    formatted: List[Dict[str, Any]] = []
    for row in records:
        month_block = parse_int(row.get("month_block"))
        if month_block is None:
            continue
        formatted.append(
            {
                "mcr": str(row.get("mcr") or "").strip(),
                "month_block": month_block,
                "leave_type": str(row.get("leave_type") or "").strip(),
                "posting_code": str(row.get("posting_code") or "").strip(),
            }
        )
    return formatted


def _validate_no_duplicate_mcrs(residents: List[Dict[str, Any]]) -> None:
    label = CSV_HEADER_SPECS["residents"]["label"]
    seen = set()
    duplicates = set()
    missing_rows: List[int] = []

    for idx, resident in enumerate(residents, start=1):
        mcr = str(resident.get("mcr") or "").strip()
        if not mcr:
            missing_rows.append(idx)
            continue
        if mcr in seen:
            duplicates.add(mcr)
        else:
            seen.add(mcr)

    if missing_rows:
        rows = ", ".join(str(num) for num in missing_rows)
        raise HTTPException(
            status_code=400,
            detail=f"[{label}] Missing MCR for row(s): {rows}. Each resident must have a unique MCR.",
        )

    if duplicates:
        dup_list = ", ".join(sorted(duplicates))
        raise HTTPException(
            status_code=400,
            detail=f"[{label}] Duplicate MCR(s) found: {dup_list}. Each resident must have a unique MCR.",
        )


def _validate_no_duplicate_posting_codes(postings: List[Dict[str, Any]]) -> None:
    label = CSV_HEADER_SPECS["postings"]["label"]
    seen = set()
    duplicates = set()
    missing_rows: List[int] = []

    for idx, posting in enumerate(postings, start=1):
        posting_code = str(posting.get("posting_code") or "").strip()
        if not posting_code:
            missing_rows.append(idx)
            continue
        if posting_code in seen:
            duplicates.add(posting_code)
        else:
            seen.add(posting_code)

    if missing_rows:
        rows = ", ".join(str(num) for num in missing_rows)
        raise HTTPException(
            status_code=400,
            detail=f"[{label}] Missing posting_code for row(s): {rows}. Each posting must have a unique code.",
        )

    if duplicates:
        dup_list = ", ".join(sorted(duplicates))
        raise HTTPException(
            status_code=400,
            detail=f"[{label}] Duplicate posting_code(s) found: {dup_list}. Each posting must have a unique code.",
        )


def _validate_posting_capacity_and_duration(postings: List[Dict[str, Any]]) -> None:
    label = CSV_HEADER_SPECS["postings"]["label"]
    invalid_capacity: List[str] = []
    invalid_duration: List[str] = []

    for idx, posting in enumerate(postings, start=1):
        posting_code = str(posting.get("posting_code") or "").strip()
        row_label = posting_code or f"row {idx}"

        max_residents_raw = posting.get("max_residents")
        try:
            max_residents = int(max_residents_raw)
        except (TypeError, ValueError):
            max_residents = None

        if max_residents is None or max_residents < 0:
            invalid_capacity.append(f"{row_label} (value: {max_residents_raw})")

        duration_raw = posting.get("required_block_duration")
        try:
            duration = int(duration_raw)
        except (TypeError, ValueError):
            duration = None

        if duration is None or duration < 1 or duration > 12:
            invalid_duration.append(f"{row_label} (value: {duration_raw})")

    if invalid_capacity:
        joined = ", ".join(invalid_capacity)
        raise HTTPException(
            status_code=400,
            detail=f"[{label}] Invalid max_residents for posting(s): {joined}. Provide a positive integer capacity.",
        )

    if invalid_duration:
        joined = ", ".join(invalid_duration)
        raise HTTPException(
            status_code=400,
            detail=f"[{label}] Invalid required_block_duration for posting(s): {joined}. Value must be between 1 and 12 months.",
        )


async def preprocess_initial_upload(form: FormData) -> Dict[str, Any]:
    def require_upload(key: str, optional: bool = False) -> Optional[UploadFile]:
        value = form.get(key)
        if isinstance(value, UploadFile):
            return value
        if optional:
            return None
        available_keys = list(form.keys())
        value_type = type(value).__name__ if value is not None else "None"
        raise HTTPException(
            status_code=400,
            detail=(
                f"Missing required file '{key}'. "
                f"Received type '{value_type}'. "
                f"Available keys: {available_keys}"
            ),
        )

    residents_upload = require_upload("residents")
    history_upload = require_upload("resident_history")
    prefs_upload = require_upload("resident_preferences")
    sr_prefs_upload = require_upload("resident_sr_preferences")
    postings_upload = require_upload("postings")
    leaves_upload = require_upload("resident_leaves", optional=True)

    residents_csv = await _read_csv_upload(
        residents_upload,
        expected_headers=CSV_HEADER_SPECS["residents"]["required"],
        file_label=CSV_HEADER_SPECS["residents"]["label"],
        header_aliases=CSV_HEADER_SPECS["residents"]["aliases"],
    )
    history_csv = await _read_csv_upload(
        history_upload,
        expected_headers=CSV_HEADER_SPECS["resident_history"]["required"],
        file_label=CSV_HEADER_SPECS["resident_history"]["label"],
        header_aliases=CSV_HEADER_SPECS["resident_history"]["aliases"],
    )
    prefs_csv = await _read_csv_upload(
        prefs_upload,
        expected_headers=CSV_HEADER_SPECS["resident_preferences"]["required"],
        file_label=CSV_HEADER_SPECS["resident_preferences"]["label"],
        header_aliases=CSV_HEADER_SPECS["resident_preferences"]["aliases"],
    )
    sr_prefs_csv = (
        await _read_csv_upload(
            sr_prefs_upload,
            expected_headers=CSV_HEADER_SPECS["resident_sr_preferences"]["required"],
            file_label=CSV_HEADER_SPECS["resident_sr_preferences"]["label"],
            header_aliases=CSV_HEADER_SPECS["resident_sr_preferences"]["aliases"],
        )
        if sr_prefs_upload
        else []
    )
    postings_csv = await _read_csv_upload(
        postings_upload,
        expected_headers=CSV_HEADER_SPECS["postings"]["required"],
        file_label=CSV_HEADER_SPECS["postings"]["label"],
        header_aliases=CSV_HEADER_SPECS["postings"]["aliases"],
    )
    leaves_csv = (
        await _read_csv_upload(
            leaves_upload,
            expected_headers=CSV_HEADER_SPECS["resident_leaves"]["required"],
            file_label=CSV_HEADER_SPECS["resident_leaves"]["label"],
            header_aliases=CSV_HEADER_SPECS["resident_leaves"]["aliases"],
        )
        if leaves_upload
        else []
    )

    residents = _format_residents(residents_csv)
    resident_history = _format_resident_history(history_csv)
    resident_preferences = _format_preferences(prefs_csv)
    resident_sr_preferences = _format_sr_preferences(sr_prefs_csv)
    postings = _format_postings(postings_csv)
    resident_leaves = _format_resident_leaves(leaves_csv)

    _validate_no_duplicate_mcrs(residents)
    _validate_no_duplicate_posting_codes(postings)
    _validate_posting_capacity_and_duration(postings)

    weightages = parse_weightages(form.get("weightages"), {})
    max_time_in_minutes = parse_max_time_in_minutes(form.get("max_time_in_minutes"))

    return {
        "residents": residents,
        "resident_history": resident_history,
        "resident_preferences": resident_preferences,
        "resident_sr_preferences": resident_sr_preferences,
        "postings": postings,
        "weightages": weightages,
        "resident_leaves": resident_leaves,
        "max_time_in_minutes": max_time_in_minutes,
    }


async def prepare_solver_input(
    form: FormData,
    latest_inputs: Optional[Dict[str, Any]],
    latest_api_response: Optional[Dict[str, Any]],
) -> Tuple[Dict[str, Any], Optional[Dict[str, Any]]]:
    """
    Build the solver input payload based on uploaded files and/or pinned selections.
    Returns the payload plus an optional deep copy to refresh the cached latest_inputs.
    """

    pinned_mcrs = parse_pinned_list(form.get("pinned_mcrs"))
    has_pinned = bool(pinned_mcrs)
    has_cached_run = bool(latest_api_response)

    if has_pinned and has_cached_run:
        solver_input = build_pinned_run_input(
            latest_inputs=latest_inputs,
            latest_api_response=latest_api_response,
            pinned_mcrs=pinned_mcrs,
            weightages_override=form.get("weightages"),
            max_time_in_minutes=form.get("max_time_in_minutes"),
        )
        latest_inputs_snapshot: Optional[Dict[str, Any]] = None
    else:
        solver_input = await preprocess_initial_upload(form)
        latest_inputs_snapshot = copy.deepcopy(solver_input)

    return solver_input, latest_inputs_snapshot


def build_pinned_run_input(
    latest_inputs: Optional[Dict[str, Any]],
    latest_api_response: Optional[Dict[str, Any]],
    pinned_mcrs: List[str],
    weightages_override: Any = None,
    max_time_in_minutes: Any = None,
) -> Dict[str, Any]:
    if not latest_api_response:
        raise HTTPException(
            status_code=400,
            detail="No existing timetable found. Upload CSV files before pinning residents.",
        )

    pinned_set = {mcr for mcr in pinned_mcrs if mcr}
    history = latest_api_response.get("resident_history") or []
    resident_history = [
        copy.deepcopy(row)
        for row in history
        if not parse_boolean_flag(row.get("is_current_year"))
    ]

    pinned_assignments: Dict[str, List[Dict[str, Any]]] = {}
    derived_leaves: List[Dict[str, Any]] = []
    for row in history:
        if not parse_boolean_flag(row.get("is_current_year")):
            continue
        mcr = str(row.get("mcr") or "").strip()
        month_block = parse_int(row.get("month_block"))
        posting_code = str(row.get("posting_code") or "").strip()
        if month_block is None:
            continue
        is_leave = parse_boolean_flag(row.get("is_leave"))
        if is_leave:
            derived_leaves.append(
                {
                    "mcr": mcr,
                    "month_block": month_block,
                    "posting_code": posting_code,
                    "leave_type": str(row.get("leave_type") or "").strip(),
                }
            )
            continue
        if not mcr or mcr not in pinned_set or not posting_code:
            continue
        pinned_assignments.setdefault(mcr, []).append(
            {"month_block": month_block, "posting_code": posting_code}
        )

    for assignments in pinned_assignments.values():
        assignments.sort(key=lambda item: item["month_block"])

    base_weightages = (
        (latest_api_response.get("weightages") or {})
        or (latest_inputs.get("weightages") if latest_inputs else {})
        or {}
    )
    weightages = parse_weightages(weightages_override, base_weightages)

    def merged(key: str) -> List[Dict[str, Any]]:
        if latest_api_response and key in latest_api_response:
            return copy.deepcopy(latest_api_response.get(key) or [])
        if latest_inputs and key in latest_inputs:
            return copy.deepcopy(latest_inputs.get(key) or [])
        return []

    base_leaves = merged("resident_leaves")
    combined_leaves = (base_leaves or []) + derived_leaves

    # dedupe leaves by resident/block while normalising fields
    deduped_leaves: Dict[Tuple[str, int], Dict[str, Any]] = {}
    for row in combined_leaves:
        mcr = str(row.get("mcr") or "").strip()
        block = parse_int(row.get("month_block"))
        if not mcr or block is None:
            continue
        key = (mcr, block)
        if key in deduped_leaves:
            continue
        deduped_leaves[key] = {
            "mcr": mcr,
            "month_block": block,
            "posting_code": str(row.get("posting_code") or "").strip(),
            "leave_type": str(row.get("leave_type") or "").strip(),
        }

    return {
        "residents": merged("residents"),
        "resident_history": resident_history,
        "resident_preferences": merged("resident_preferences"),
        "resident_sr_preferences": merged("resident_sr_preferences"),
        "postings": merged("postings"),
        "weightages": weightages,
        "resident_leaves": list(deduped_leaves.values()),
        "pinned_assignments": pinned_assignments,
        "max_time_in_minutes": max_time_in_minutes,
    }


def normalise_current_year_entries(entries: Any) -> List[Dict[str, Any]]:
    normalised: List[Dict[str, Any]] = []
    if not isinstance(entries, list):
        return normalised
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        month_block = parse_int(entry.get("month_block"))
        posting_code = str(entry.get("posting_code") or "").strip()
        if month_block is None or not posting_code:
            continue
        career_block = parse_int(entry.get("career_block"))
        normalised.append(
            {
                "month_block": month_block,
                "posting_code": posting_code,
                "career_block": career_block,
            }
        )
    return normalised
