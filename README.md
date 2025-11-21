# Residency Rostering User Guide

End-to-end steps for running the rostering tool locally and interpreting solver outputs. The solver rules are documented separately in [constraints.md](constraints.md).

## Prerequisites

- Python 3.10+ with `pip`; Node 20+ with `npm`.
- From the repo root, install backend deps: `pip install -r server/requirements.txt`.
- Install frontend deps: `cd client && npm install`.

## Running the app locally

- Start the API: from the repo root run `uvicorn server.main:app --reload --port 8000`.
- Start the client: from `client/` run `npm run dev -- --host --port 5173` (defaults also work).
- The client expects the API at `http://localhost:8000`.

## Preparing input data

Upload CSVs via the UI (or POST `/api/solve` as multipart form data). Required headers per file:

- Residents: `mcr`, `name`, `resident_year`, `career_blocks_completed`.
- Resident History: `mcr`, `year`, `month_block`, `career_block`, `posting_code`, `is_current_year`, `is_leave`, `leave_type`.
- Resident Preferences: `mcr`, `preference_rank`, `posting_code`.
- SR Preferences: `mcr`, `preference_rank`, `base_posting` (optional file but expected columns if provided).
- Postings: `posting_code`, `posting_name`, `posting_type`, `max_residents`, `required_block_duration`.
- Resident Leaves (optional): `mcr`, `month_block`, `leave_type`, `posting_code` (posting filled when leave consumes a posting slot).

Additional inputs:

- Weightages (JSON) to tune bonuses/penalties: keys include `preference`, `seniority`, `elective_shortfall_penalty`, `core_shortfall_penalty`.
- Pinned assignments: list of `{mcr, month_block, posting_code}` tuples to lock blocks before solving.
- `max_time_in_minutes` to override the default solver time limit.

## Running the optimiser

- In the client, upload the CSVs, confirm parsed column names, and review any validation errors.
- Adjust weightages or pins if needed, then start the solve. Progress is streamed in the browser console and backend logs.
- On success, the API returns `solver_solution.entries` per resident/block plus optimisation scores for display in the UI.
- On infeasibility, consult backend logs and the [constraint list](constraints.md); try relaxing inputs (capacity, pins, leaves).

## Reviewing and exporting results

- The timetable view shows per-block assignments; leave blocks are marked `OFF` with the leave posting code when provided.
- Optimisation scores mirror the solver objective (bonuses/penalties listed in constraints.md).
- To persist manual tweaks for a resident, submit via the UI (or POST `/api/save` with `resident_mcr` and `current_year` array). The endpoint validates against constraints before recomputing scores.
- Export the final CSV through the UI (or POST `/api/download-csv` with the latest API payload) to download `final_timetable.csv`.

## Troubleshooting

- Common upload errors are surfaced with row numbers and missing columns; fix the CSV and retry.
- If the solver returns infeasible, reduce pins, relax posting capacities, or revisit leave reservations.
- For unexpected schedules, check how the hard/soft rules are applied in [constraints.md](constraints.md) and adjust weightages accordingly.
