# CSV Input Guide – Must Match Backend Schema

Upload order expected by `/api/upload-csv`:

1. `residents` – `residents.csv`
2. `resident_history` – `resident_history.csv`
3. `resident_preferences` – `resident_preferences.csv`
4. `posting_quotas` – `posting_quotas.csv`

Column definitions are documented below, followed by sample rows.

---

### 1. residents.csv

Required Columns:

- `mcr`
- `name`
- `resident_year` _(year = resident level 1 to 4, where 4 represents 'year 3+')_

### 2. resident_history.csv

One row per resident **per academic year**.

Required Columns:

- `mcr`
- `resident_year`
- `block_1` to `block_12` _(posting assigned per month (block), else blank)_

### 3. resident_preferences.csv

One row per resident.

Required Columns:

- `mcr`
- `preference_1` to `preference_5` _(posting preferences ranked)_

### 4. posting_quotas.csv

Posting capacity per 12-block year.

Required Columns:

- `posting_code`
- `posting_type` _(core / elective)_
- `max_residents`
- `required_block_duration` _(contiguous blocks when assigned)_

---

### Sample Data

1. `residents.csv`

mcr,name,resident_year
R001,John Smith,2
R002,Jane Doe,1
R003,Mike Johnson,3
R004,Sarah Wilson,2
R005,David Brown,1

2. `resident_history.csv`

mcr,resident_year,block_1,block_2,block_3,block_4,block_5,block_6,block_7,block_8,block_9,block_10,block_11,block_12
R001,2,GM,GM,GM,ED,CVM,CVM,CVM,GASTRO,GASTRO,GASTRO,NEPHRO,NEPHRO
R002,1,,,,,,,,,,,
R003,2,GM,GM,GM,MICU,MICU,MICU,GRM,GRM,RCCM,RCCM,RCCM,ONCO
R003,3,ONCO,ONCO,GASTRO,GASTRO,GASTRO,ENDO,ENDO,RADIO,RADIO,PSYCH,PSYCH,ED
R004,2,MICU,MICU,MICU,GM,GM,GM,NEPHRO,NEPHRO,CVM,CVM,CVM,DERM
R005,1,,,,,,,,,,,

3. `resident_preferences.csv`

mcr,preference_1,preference_2,preference_3,preference_4,preference_5
R001,GASTRO,ONCO,RADIO,PSYCH,DERM
R002,GM,ED,CVM,NEPHRO,ENDO
R003,ENDO,DERM,PSYCH,RADIO,RHEUM
R004,GRM,RCCM,GASTRO,ONCO,PSYCH
R005,ED,GM,CVM,NEPHRO,GASTRO

4. `posting_quotas.csv`

posting_code,posting_type,max_residents,required_block_duration
GM,core,4,3
GRM,core,2,2
CVM,core,3,3
RCCM,core,2,3
MICU,core,3,3
ED,core,6,1
GASTRO,elective,2,3
NEPHRO,elective,2,2
RHEUM,elective,1,2
ENDO,elective,2,2
ONCO,elective,2,3
DERM,elective,1,1
RADIO,elective,3,2
PSYCH,elective,2,2
