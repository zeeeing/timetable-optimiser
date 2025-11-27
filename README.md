# Residency Rotation Scheduler

## Introduction

Residency Rotation Scheduler (R2S) is a constraint-based optimisation tool that uses Google OR-Tools to construct fair, feasible residency rotation timetables. It ingests structured CSV inputs describing residents, postings, historical rotations, preferences, and leave, and then searches for a timetable that satisfies hard rules (e.g. posting capacities, required block durations, stage rules) while optimising soft goals such as resident preferences and balanced posting utilisation. The application is designed for iterative use: users can tune weightages, pin specific assignments, re-run the solver, and export the final timetable for downstream systems.

## Key Features

- Constraint-based timetable optimisation powered by Google OR-Tools (CP-SAT).
- CSV-driven configuration for residents, postings, historical rotations, preferences, and leave.
- Rich set of hard and soft constraints (capacities, stage rules, elective/core requirements, preference handling, and guardrails such as MICU/RCCM packs and GRM/ED runs).
- Interactive UI for uploading datasets, adjusting weightages, pinning assignments, and inspecting resulting timetables.
- Validation and infeasibility feedback aligned with the documented constraints in [`constraints.md`](/constraints.md).
- Export of solver-validated timetables as CSV for downstream HR, payroll, or rostering systems.

## Architecture

- Backend (`server/`): FastAPI application exposing `/api/solve`, `/api/save`, and `/api/download-csv` endpoints. It handles CSV parsing, input normalisation, OR-Tools model construction/solving in `server/services/posting_allocator.py`, and postprocessing of solutions into resident-level timetables and optimisation scores.
- Frontend (`client/`): React + TypeScript application built with Vite and Tailwind CSS. It provides CSV upload and validation, configuration of weightages and pinned assignments, visualisation of per-block timetables, and actions to persist edits or download the final CSV.
- Data flow: CSVs and configuration are uploaded via the frontend and sent as multipart form data to the backend. The backend runs the optimiser, returns a structured timetable plus optimisation scores, and supports subsequent edits and exports over the same API.

## Getting started

- Deployed webapp: [`https://im-r2s.replit.app`](https://im-r2s.replit.app) – primary way to use R2S in the browser.
- Local development: run the backend and frontend from this repository (see the Local development section below).

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

## Local development

### Prerequisites

- Python 3.10+ with `pip`; Node 20+ with `npm`.
- From the repo root, install backend deps: `pip install -r server/requirements.txt`.
- Install frontend deps: `cd client && npm install`.

### Quick start

```bash
# start the API from the repo root
uvicorn server.main:app --reload --port 8000

# in a separate terminal, start the client
cd client
npm run dev -- --host --port 5173
```

The client expects the API at `http://localhost:8000`.

## Contributing

This project is currently maintained for internal use. If you have suggestions or find issues, feel free to open an issue or pull request with a clear description, sample inputs (CSV snippets), and the observed behaviour.

## License

No explicit license has been specified for this repository. If you are interested in using or extending this code outside your organisation, please contact the maintainer before redistribution.
