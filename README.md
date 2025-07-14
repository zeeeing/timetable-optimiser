# Timetable Optimiser 🚀

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-43853D?style=flat&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express.js-000000?style=flat&logo=express&logoColor=white)](https://expressjs.com/)
[![Python](https://img.shields.io/badge/Python-3776AB?style=flat&logo=python&logoColor=white)](https://www.python.org/)
[![Google OR-Tools](https://img.shields.io/badge/Google%20OR-Tools-000000?style=flat&logo=google-or-tools&logoColor=white)](https://developers.google.com/optimization)

Timetable rostering and scheduling has long been a manual and tedious process where the user will have to assign postings to a resident's timetable based on numerous constraints, prerequisites, and even needing to weight each of their preferences. It takes weeks to deconflict schedules between residents, especially if the cohort is considerably large (>100 pax).

Timetable Optimiser aims to automate this process and eliminate the need for manual labour.

## ✨ Features

- **Automated Scheduling**: Utilises Google OR-Tools for constraint programming to optimise resident schedules
- **User-Friendly Interface**: Modern React-based frontend with an intuitive UI
- **Data Management**: Handles three types of CSV inputs for comprehensive scheduling
- **Real-time Visualisation**: View and interact with optimised timetables
- **Export Capabilities**: Download optimised schedules in CSV format

## 🏗 Project Structure

```
timetable-optimiser/
├── client/                   # Frontend React application
├── server/                   # Backend server
│   ├── posting_allocator.py  # Core optimisation logic
│   ├── server.js             # Express server
│   └── ...
└── README.md
```

## 🚀 Getting Started

### Prerequisites

- Node.js 16+ and npm/yarn
- Python 3.8+
- pip (Python package manager)

### Installation

1. **Clone the repository**
   ```sh
   git clone https://github.com/zeeeing/timetable-optimiser
   cd timetable-optimiser
   ```

2. **Set up the backend**
   ```sh
   cd server
   npm install
   pip install -r requirements.txt
   ```

3. **Set up the frontend**
   ```sh
   cd ../client
   npm install
   ```

## 🏃‍♂️ Running the Application

1. **Start the backend server** (from the server directory)
   ```sh
   cd server
   node server.js
   ```
   The server will start on `http://localhost:3001`

2. **Start the frontend development server** (from the client directory)
   ```sh
   cd client
   npm run dev
   ```
   The application will be available at `http://localhost:5173`

## 📝 Usage

1. **Prepare your CSV files**:
   - `preferences.csv`: Resident posting preferences
   - `resident_posting_data.csv`: Resident past timetable information
   - `posting_quotas.csv`: Current AY quotas for each posting

2. **Upload Files**:
   - Click "Upload CSV" buttons to select your files
   - Ensure all three files are uploaded before proceeding

3. **Optimise Schedule**:
   - Click "Process Files" to start the optimisation
   - Wait for the processing to complete

4. **View Results**:
   - Select a resident from the dropdown to view their optimised schedule
   - The timetable will display their postings for the year
   - Core and elective posting counts are shown for reference

5. **Export**:
   - Click "Download CSV" to save the optimised schedule

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

## Development Notes
- API calls are made via `/api/upload-csv` or `/api/download-csv`
- Backend spawns a Python process via child_process
- Python script takes in parsed JSON data, outputs as JSON as well
- The list of constraints are detailed as comments in the codebase
- Objective: maximise residents' preferences
