# Timetable Optimiser · User Guide

Timetable Optimiser is a full-stack rostering platform for medical residency programmes. It combines a React dashboard, an Express API, and Python solvers powered by Google OR-Tools to transform raw CSV datasets into constraint-aware schedules that balance preferences, seniority, and posting quotas.

This guide walks you through getting the application running on your machine, preparing the data it needs, and using the web interface to generate, review, and export residency rosters.

## Contents

- [1. What the Optimiser Does](#1-what-the-optimiser-does)
- [2. System Requirements](#2-system-requirements)
- [3. Project Overview](#3-project-overview)
- [4. Installation](#4-installation)
- [5. Configuration](#5-configuration)
- [6. Prepare Your Data](#6-prepare-your-data)
- [7. Run the Optimiser](#7-run-the-optimiser)
- [8. Dashboard Walkthrough](#8-dashboard-walkthrough)
- [9. Overview Page and Exporting Results](#9-overview-page-and-exporting-results)
- [10. API Reference](#10-api-reference)
- [11. Troubleshooting](#11-troubleshooting)
- [12. Need Help?](#12-need-help)

---

## 1. What the Optimiser Does

- Automates resident roster generation using Google OR-Tools constraint programming.
- Balances resident preferences, seniority, required core postings, and elective quotas.
- Provides an interactive web interface for data upload, weightage tuning, manual tweaks, validation, and CSV export.
- Supports iterative planning with resident pinning, re-generation, and drag-and-drop adjustments.

## 2. System Requirements

- Node.js 18 LTS or newer (brings npm). Check with `node --version`.
- Python 3.9 or newer with `pip`. The optimiser invokes `python3` on the system path.
- Git (for cloning) and a terminal capable of running two concurrent processes.
- Recommended browsers: latest Chrome, Edge, or Firefox.

## 3. Project Overview

```
timetable-optimiser/
├── client/               React + Vite front end
├── server/               Express API that talks to Python solvers
│   └── services/         posting_allocator.py, validate.py, postprocess.py
└── README.md             This guide
```

Key runtime flow:

1. Users upload CSV datasets and choose scoring weightages from the React dashboard.
2. The Express API normalises the CSVs, spawns the Python solver, and caches the result in memory.
3. The UI visualises the results, supports edits with live validation, and exports a consolidated CSV.

Data persists only for the lifetime of the server process; there is no database.

## 4. Installation

Run these commands from your terminal.

1. **Clone the repository**

   ```sh
   git clone https://github.com/zeeeing/timetable-optimiser
   cd timetable-optimiser
   ```

2. **Install backend (Node.js) dependencies**

   ```sh
   cd server
   npm install
   ```

3. **Install Python packages**

   ```sh
   # optional but recommended
   python3 -m venv .venv
   source .venv/bin/activate

   pip install -r requirements.txt
   ```

   Packages: `ortools`, `pandas`, `numpy`.

4. **Install frontend dependencies**

   ```sh
   cd ../client
   npm install
   ```

5. **(Optional) Build front end for production**
   ```sh
   npm run build
   ```

## 5. Configuration

- **Server port**: defaults to `3001`. Override by exporting `PORT` before `npm start`.
- **Python executable**: the server runs `python3`. Ensure that command resolves to the interpreter with OR-Tools installed (activate your virtual environment before starting the server).
- **Client API base URL**: defaults to `http://localhost:3001/api`. Override by creating `client/.env.local`:
  ```
  VITE_API_BASE_URL=http://your-host-or-port/api
  ```
- **Solver weightages**: controlled from the dashboard (preference, seniority, elective shortfall, core shortfall). Defaults are `1, 1, 10, 10`.
- **Pinned residents**: stored in your browser's local storage so they persist between refreshes.

## 6. Prepare Your Data

Upload CSV files with UTF-8 encoding. Column names are case-sensitive unless alternatives are noted.

### 6.1 residents.csv (required)

| Column                    | Required | Description                                                               |
| ------------------------- | -------- | ------------------------------------------------------------------------- |
| `mcr`                     | Yes      | Resident identifier.                                                      |
| `name`                    | Yes      | Resident full name.                                                       |
| `resident_year`           | Yes      | Numeric residency year (integer).                                         |
| `career_blocks_completed` | Optional | Total blocks completed to date. `careerBlocksCompleted` is also accepted. |

### 6.2 resident_history.csv (required)

| Column            | Required | Description                                                   |
| ----------------- | -------- | ------------------------------------------------------------- |
| `mcr`             | Yes      | Resident identifier.                                          |
| `year`            | Yes      | Residency year for the record.                                |
| `month_block`     | Yes      | Block number 1–12. `block` is accepted as an alias.           |
| `career_block`    | Optional | Career block counter.                                         |
| `posting_code`    | Yes      | Posting code for the block.                                   |
| `is_current_year` | Yes      | `1` if the block belongs to the planning year, `0` otherwise. |
| `is_leave`        | Optional | `1` if the entry represents leave.                            |
| `leave_type`      | Optional | Leave label displayed in the UI.                              |

### 6.3 resident_preferences.csv (required)

| Column            | Required | Description                          |
| ----------------- | -------- | ------------------------------------ |
| `mcr`             | Yes      | Resident identifier.                 |
| `preference_rank` | Yes      | Integer rank (1 = highest priority). |
| `posting_code`    | Yes      | Preferred posting code.              |

### 6.4 resident_sr_preferences.csv (optional)

| Column            | Required | Description                               |
| ----------------- | -------- | ----------------------------------------- |
| `mcr`             | Yes      | Resident identifier.                      |
| `preference_rank` | Yes      | Rank of senior residency (SR) preference. |
| `base_posting`    | Yes      | Base posting code used for SR matching.   |

### 6.5 postings.csv (required)

| Column                    | Required | Description                                   |
| ------------------------- | -------- | --------------------------------------------- |
| `posting_code`            | Yes      | Unique code (e.g. `GM (TTSH)`).               |
| `posting_name`            | Yes      | Display name.                                 |
| `posting_type`            | Yes      | `core`, `elective`, or other label.           |
| `max_residents`           | Yes      | Maximum concurrent residents.                 |
| `required_block_duration` | Yes      | Minimum number of contiguous blocks required. |

### 6.6 resident_leaves.csv (optional)

| Column         | Required | Description                                  |
| -------------- | -------- | -------------------------------------------- |
| `mcr`          | Yes      | Resident identifier.                         |
| `month_block`  | Yes      | Block number 1–12. `block` is accepted.      |
| `leave_type`   | Yes      | Label shown in the UI (e.g. `Annual Leave`). |
| `posting_code` | Optional | Posting affected by the leave, if any.       |

### 6.7 Sample files

Use the **Download Sample CSV** button on the dashboard to generate a ZIP with all templates populated with mock data. These are helpful for confirming column names and formats.

## 7. Run the Optimiser

Open two terminal windows or tabs.

1. **Start the backend**

   ```sh
   cd timetable-optimiser/server
   # activate your Python virtualenv if you created one
   npm start
   ```

   The API listens on `http://localhost:3001`.

2. **Start the frontend**
   ```sh
   cd timetable-optimiser/client
   npm run dev
   ```
   Vite will print a URL (default `http://localhost:5173`). Open it in your browser.

If you change the API base URL, update the client `.env.local` before running `npm run dev`.

## 8. Dashboard Walkthrough

The dashboard (`/`) is the main workspace.

- **Upload data**: Six upload slots appear. The four required files (Residents, Resident History, Resident Preferences, SR Preferences) plus Postings must be provided before the first optimisation run. Leaves are optional. Re-uploads replace previously stored files.
- **Weightages**: Toggle scoring factors on or off. Use **Advanced settings** to fine-tune numeric values. Set a slider to zero to disable that factor.
- **Generate timetable**: Click **Upload & Generate Timetable**. The button changes to **Re-Generate Timetable** once results exist. Generation runs the Python optimiser and refreshes the dataset stored on the server.
- **Pinned residents**: After generating, choose a resident from the dropdown and click **Pin Resident**. Pinned residents keep their current-year assignments on subsequent **Re-Generate** runs. Manage pins from either the dashboard or the overview page. Pins are stored in local storage and shared across both pages.
- **Resident navigation**: Use the dropdown or the left/right chevron buttons to cycle through residents grouped by residency year.
- **Editing a timetable**:
  - Drag a posting across blocks to move it horizontally.
  - Click a block to open the posting picker, search by code or name, and assign a different posting. Use the trash icon to clear a block.
  - Leave entries are locked and cannot be dragged.
  - Edited blocks are highlighted in yellow. Use **Cancel** to revert unsaved edits for the current resident.
- **Validate and save**:
  - Click **Save** to run validation and persist your edits.
  - The server first validates constraints (`/api/validate`). Any violations appear in the left panel; no changes are saved until violations are cleared.
  - On success, the solver post-processes the cohort (`/api/save`) so aggregated statistics stay accurate.
  - The latest response replaces the cached dataset, enabling immediate re-generation with the updated baseline.
- **Constraint reference**: The right-hand accordion lists the programme rules the solver enforces (core requirements, elective counts, CCR logic, etc.). Use it to interpret validation messages.
- **Statistics panels**: View normalised optimisation scores, core completion badges, CCR status, elective tallies, and senior-residency assignments for each resident.
- **Cohort insights**: Below the timetable you will find cohort-wide statistics and posting utilisation summaries.

## 9. Overview Page and Exporting Results

- Navigate to **Overview** using the sidebar.
- Use the planner table to scan all residents at once. Features include:
  - Column sorting, global search, and pagination.
  - Filtering by one or more posting codes.
  - Pin/unpin residents directly in the table.
  - Bulk pin or unpin whole residency years.
  - Quick view of current-year postings per block, with leave entries labelled.
- When satisfied with the plan, click **Export Final Timetable CSV** to download a consolidated file containing:
  - Resident identifiers, names, residency year.
  - Optimisation scores.
  - Block-by-block posting codes for the current year (columns `Jan`–`Dec`).
  - CCR posting column.

## 10. API Reference

All endpoints are prefixed with `/api`.

- `POST /api/solve` (multipart/form-data)  
  Fields: required CSVs (`residents`, `resident_history`, `resident_preferences`, `resident_sr_preferences`, `postings`), optional CSV (`resident_leaves`), JSON-serialised `weightages`, and optional `pinned_mcrs` array. Returns the full optimiser response payload.

- `POST /api/validate` (JSON)

  ```json
  {
    "resident_mcr": "M000001A",
    "current_year": [{ "month_block": 1, "posting_code": "GM (TTSH)" }]
  }
  ```

  Response: `{ "success": boolean, "violations": [{ "code": string, "description": string }] }`.

- `POST /api/save` (JSON)  
  Same payload as `/api/validate`. On success returns the refreshed optimiser response and caches it server-side.

- `POST /api/download-csv` (JSON)  
  Body should embed the latest `residents`, `resident_history`, and `optimisation_scores`. Returns a CSV file. The front end handles this for you.

Note: Data is stored only in memory. Restarting the server clears uploads and requires a fresh `/api/solve`.

## 11. Troubleshooting

- **`Failed to process files`**: Check for missing required columns, blank headers, or non-numeric values in numeric fields. Ensure CSVs are comma-separated UTF-8 files.
- **`python3: No module named ortools`**: Install dependencies in the environment the server uses (`pip install -r requirements.txt`) and restart the server with that environment activated.
- **Validation keeps failing**: Inspect the violations list. Adjust postings to satisfy core requirements, consecutive block lengths, CCR allocations, or elective quotas. The constraint accordion describes each rule.
- **`ECONNREFUSED` or blank UI**: Confirm the backend is running on the port configured in `VITE_API_BASE_URL`. Restart both processes after changing environment variables.
- **Port already in use**: Set `PORT` (server) or `VITE_PORT` (client) to unused values before starting the services.
- **Pinned residents not respected**: Pins take effect only when re-running the optimiser. After editing and saving, click **Re-Generate Timetable** to apply pins with the updated dataset.

## 12. Need Help?

- Explore `server/services/` for the Python optimisation logic and constraint comments.
- File naming or structure questions? Generate the sample CSV bundle and compare it with your data.
- For deeper issues (performance, new constraints, UI tweaks) review the relevant source files:
  - Client UI: `client/src/pages` and `client/src/components`.
  - API routes: `server/server.js`.
  - Solver scripts: `server/services/posting_allocator.py`, `postprocess.py`, `validate.py`.
- Reach out to the project maintainers with the dataset (anonymised if required) and the exact error message for targeted support.

Happy rostering!
