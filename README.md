# Timetable Optimiser

A web application for optimising and visualising resident postings and timetables.

## Features
- Upload three CSV files: preferences, resident posting data, and posting quotas
- Optimise resident posting assignments using a Python backend (Google OR-Tools)
- Visualise each resident's yearly 12-block (July–June) timetable
- Track and display number of core and elective postings per resident
- Download the final timetable as a CSV

## Project Structure
```
timetable-optimiser/
  client/    # React frontend (TypeScript, TailwindCSS)
  server/    # Node.js/Express backend + Python optimiser
```

## Setup Instructions

### 1. Clone the repository
```sh
git clone <repo-url>
cd timetable-optimiser
```

### 2. Install dependencies
#### Backend
```sh
cd server
npm install
pip install -r requirements.txt
```
#### Frontend
```sh
cd ../client
npm install
```

### 3. Start the servers
#### Backend
```sh
cd server
npm start
```
#### Frontend
```sh
cd client
npm run dev
```

## Usage
1. Open the frontend in your browser (default: [http://localhost:5173](http://localhost:5173)).
2. Download the sample CSVs using the "Download Sample CSV" button.
3. Upload the three required CSV files:
   - `preferences.csv` (resident preferences)
   - `resident_posting_data.csv` (possible postings, blocks, type)
   - `posting_quotas.csv` (posting quotas)
4. Click "Upload & Generate Timetable" to run the optimiser.
5. View each resident's timetable, core/elective counts, and download the final CSV.

## CSV File Formats

### preferences.csv
| id   | name              | year | p1         | p2         | p3         | p4         | p5         |
|------|-------------------|------|------------|------------|------------|------------|------------|
| R001 | Dr. Alice Johnson | 1    | Cardiology | Dermatology| Emergency Medicine | Psychiatry | Radiology |

### resident_posting_data.csv
| id   | name              | year | posting            | start_block | block_duration | type      |
|------|-------------------|------|--------------------|-------------|---------------|-----------|
| R001 | Dr. Alice Johnson | 1    | Cardiology         | 1           | 4             | core      |
| R001 | Dr. Alice Johnson | 1    | Dermatology        | 5           | 2             | elective  |

### posting_quotas.csv
| course_name        | max_residents | required_block_duration |
|--------------------|---------------|------------------------|
| Cardiology         | 1             | 4                      |

## Tech Stack
- **Frontend:** React, TypeScript, TailwindCSS
- **Backend:** Node.js, Express
- **Optimisation:** Python, Google OR-Tools

## Development Notes
- All API calls are made via `/api/upload-csv` and `/api/download-csv` only.
- The backend spawns a Python process for optimisation.
- View Python script for list of constraints that are respected in the optimiser.
- Frontend uses TailwindCSS and Shadcn ui library.
