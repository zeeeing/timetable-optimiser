# CSV Input Guide (Updated)

This guide describes the required CSV files and their columns for uploading data to the timetable optimiser. The backend expects four CSV files, each corresponding to a key in the input JSON:

---

## 1. residents.csv
**Columns:**
- mcr
- name
- resident_year

**Example:**
```
mcr,name,resident_year
R001,Dr. Alice Johnson,2
R002,Dr. Bob Smith,1
```

---

## 2. resident_history.csv
**Columns:**
- mcr
- year
- block
- posting_code

**Example:**
```
mcr,year,block,posting_code
R001,1,1,GM
R001,1,2,GM
R001,1,3,GM
R001,1,4,ED
R001,1,5,CVM
R001,1,6,CVM
R001,1,7,CVM
R001,1,8,GASTRO
R001,1,9,GASTRO
R001,1,10,GASTRO
R001,1,11,NEPHRO
R001,1,12,NEPHRO
```

---

## 3. resident_preferences.csv
**Columns:**
- mcr
- preference_rank
- posting_code

**Example:**
```
mcr,preference_rank,posting_code
R001,1,GASTRO
R001,2,ONCO
R001,3,RADIO
R001,4,PSYCH
R001,5,DERM
R002,1,GM
R002,2,ED
R002,3,CVM
R002,4,NEPHRO
R002,5,ONCO
```

---

## 4. postings.csv
**Columns:**
- posting_code
- posting_name
- posting_type
- max_residents
- required_block_duration

**Example:**
```
posting_code,posting_name,posting_type,max_residents,required_block_duration
GM,General Medicine,core,4,3
ED,Emergency Department,core,6,1
CVM,Cardiovascular Medicine,core,3,3
MICU,Medical ICU,core,3,3
GASTRO,Gastroenterology,elective,2,3
NEPHRO,Nephrology,elective,2,2
ONCO,Oncology,elective,2,3
RADIO,Radiology,elective,3,2
PSYCH,Psychiatry,elective,2,2
DERM,Dermatology,elective,1,1
```

---

**Note:**
- All CSVs must have headers as shown above.
- All values should be comma-separated, with no extra spaces.
- The backend will parse and convert these into the correct JSON structure for processing.
