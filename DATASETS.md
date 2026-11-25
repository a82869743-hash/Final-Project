# Aegis Tactical: Datasets & Data Dictionary

Every number the risk models use comes from **published government road-accident data**.
Nothing in the training data is randomly generated.

| File | Rows × Cols | What it is |
|---|---|---|
| [`backend/ml/india_road_accident_master.csv`](backend/ml/india_road_accident_master.csv) | 53 × 43 | **Master dataset**: one row per Indian million-plus city, merging MoRTH + NCRB tables |
| [`backend/ml/india_city_slot_month.csv`](backend/ml/india_city_slot_month.csv) | 424 × 13 | Long format: city × 3-hour time slot (used to evaluate the frequency model) |
| [`backend/ml/real_data/uk_stats19_2023_model_features.csv.gz`](backend/ml/real_data/uk_stats19_2023_model_features.csv.gz) | 104,258 × 21 | Record-level police collision data used to train the **severity model** |
| [`backend/ml/real_model_metadata.json`](backend/ml/real_model_metadata.json) | — | Model card: metrics, feature importances, per-city profiles, weather factors |
| [`backend/ml/risk_zones.json`](backend/ml/risk_zones.json) | 53 zones | Map layer generated from the master dataset |
| `backend/ml/real_data/raw/*.csv` | — | Untouched copies of the source tables (see [sources](#sources)) |

Rebuild everything from the raw files with:

```bash
cd backend && python ml/real_pipeline.py
```

---

## Sources

| Source | Publisher | Used for |
|---|---|---|
| *Road Accidents in India 2022*, million-plus cities table (accidents, deaths, injured for 2021 & 2022) | Ministry of Road Transport & Highways (MoRTH), Transport Research Wing | City accident volume, deaths, fatality rate, YoY change |
| *Road Accidents in India 2020*, city-wise accidents by time of day (8 × 3-hour slots) | MoRTH | Hourly risk profile per city |
| *Road Accidents in India 2020*, city-wise accidents by month | MoRTH | Seasonality (note: the April–May 2020 COVID lockdown dip) |
| *Road Accidents in India 2018*, state-wise accidents/killed by weather; national time-of-day | MoRTH | Weather fatality multipliers; fallback time profile |
| *Accidental Deaths & Suicides in India (ADSI)*, Table 1A.2, state/UT/city traffic accidents | National Crime Records Bureau (NCRB) | Cross-check of city cases / injured / died |
| ADSI 2020, cause-wise distribution of road accidents by state/city | NCRB | Over-speeding / careless / drunk-driving / visibility shares |
| *STATS19 road safety data 2023*, collision file | UK Department for Transport (Open Government Licence v3.0) | Record-level training data for the severity model |

**Why UK records?** India does not publish geocoded, per-crash records. MoRTH and NCRB publish
aggregate tables only. So the effect of *conditions on severity* (light, weather, surface, speed limit,
junctions, number of vehicles/casualties) is learned from 104k real police-reported collisions. It is
then combined with **Indian** rates, time profiles and weather fatality ratios. This is a standard
transfer approach, and it is the honest alternative to generating synthetic Indian records.

---

## 1. Master dataset: `india_road_accident_master.csv`

One row per city (53 million-plus cities). Empty cells mean the city is absent from that source table
(e.g. Durg-Bhilainagar, Ranchi and Vasai-Virar are not in the MoRTH 2022 city table).

### Identity & location
| Column | Type | Description |
|---|---|---|
| `city` | text | City name (MoRTH/NCRB spellings normalised, e.g. *Vizaq* → Visakhapatnam, *Allahabad* → Prayagraj) |
| `state` | text | State / UT |
| `latitude`, `longitude` | float (°) | City-centre coordinates (WGS84) |

### Annual totals (MoRTH 2022 report)
| Column | Type | Description |
|---|---|---|
| `accidents_2021`, `accidents_2022` | int | Road accidents recorded in the city that year |
| `deaths_2021`, `deaths_2022` | int | Persons killed |
| `injured_2021`, `injured_2022` | int | Persons injured |

### Time of day (MoRTH 2020)
| Column | Type | Description |
|---|---|---|
| `acc_2020_slot_00-03` … `acc_2020_slot_21-24` | int | Accidents in each 3-hour window (8 columns, local time) |
| `accidents_2020` | int | Sum of the 8 slots = city total for 2020 |
| `night_share_2020` | 0–1 | Share of accidents between 18:00 and 06:00 |

### Month (MoRTH 2020)
| Column | Type | Description |
|---|---|---|
| `acc_2020_jan` … `acc_2020_dec` | int | Accidents per month. April–May are depressed by the COVID-19 lockdown |

### NCRB cross-check
| Column | Type | Description |
|---|---|---|
| `ncrb_road_cases` | int | Road-accident cases registered by police (NCRB ADSI Table 1A.2) |
| `ncrb_road_injured` | int | Injured |
| `ncrb_road_died` | int | Died |

> MoRTH and NCRB numbers differ slightly by design: MoRTH collects from state transport/police
> departments, NCRB from police FIRs. Both are official.

### Causes (NCRB 2020)
| Column | Type | Description |
|---|---|---|
| `share_overspeeding_2020` | 0–1 | Share of the city's road accidents attributed to over-speeding |
| `share_careless_driving_2020` | 0–1 | Dangerous / careless driving, overtaking |
| `share_drunk_driving_2020` | 0–1 | Driving under influence of drugs/alcohol |
| `share_poor_visibility_2020` | 0–1 | Weather condition: poor visibility |

> A few cities report 0% or 100% in a single cause category. That is how those cities filed
> their returns, not a processing error.

### Derived features (computed by `ml/real_pipeline.py`)
| Column | Formula | Meaning |
|---|---|---|
| `fatality_rate_2022` | `deaths_2022 / accidents_2022` | Deaths per accident. Very high values (e.g. Ludhiana 0.78, Asansol-Durgapur 0.73, Patna 0.72) usually mean non-fatal crashes are under-reported there |
| `yoy_change_2021_2022` | `(acc_2022 − acc_2021) / acc_2021` | Growth in accidents |
| `risk_index` | `accidents_latest × fatality_rate`, scaled so max = 100 | Expected deaths per year, relative. Delhi = 100 |
| `risk_tier` | quantiles of `risk_index` | **High** = top 20 %, **Medium** = top 50 %, **Low** = rest |

---

## 2. Severity training set: `uk_stats19_2023_model_features.csv.gz`

One row per police-reported injury collision in Great Britain, 2023. Codes follow the official
STATS19 guide (`-1` = missing → blank).

| Column | Values |
|---|---|
| `hour` | 0–23 |
| `month` | 1–12 |
| `day_of_week` | 1 = Sunday … 7 = Saturday |
| `light_conditions` | 1 daylight · 4 dark, lit · 5 dark, unlit · 6 dark, no lighting · 7 unknown |
| `weather_conditions` | 1 fine · 2 rain · 3 snow · 4 fine + wind · 5 rain + wind · 6 snow + wind · 7 fog/mist · 8 other · 9 unknown |
| `road_surface_conditions` | 1 dry · 2 wet · 3 snow · 4 frost/ice · 5 flood · 6–7 oil/mud |
| `speed_limit` | mph (20, 30, 40, 50, 60, 70) |
| `road_type` | 1 roundabout · 2 one-way · 3 dual carriageway · 6 single carriageway · 7 slip road · 9 unknown |
| `urban_or_rural_area` | 1 urban · 2 rural |
| `junction_detail` | 0 not at junction · 1 roundabout · 3 T-junction · 6 crossroads · … |
| `junction_control` | 1 authorised person · 2 signals · 3 stop sign · 4 give way / uncontrolled |
| `number_of_vehicles` | vehicles involved |
| `number_of_casualties` | casualties |
| `first_road_class` | 1 motorway · 2 A(M) · 3 A · 4 B · 5 C · 6 unclassified |
| `pedestrian_crossing` | 0 none · 1–5 crossing types |
| `carriageway_hazards` | 0 none · 1–7 hazard types |
| `special_conditions_at_site` | 0 none · 1–7 (signals out, roadworks, …) |
| `latitude`, `longitude` | collision location (not used as model features) |
| `severity` | 1 fatal · 2 serious · 3 slight |
| **`ksi`** (target) | 1 if fatal or serious (**23.9 %** of rows), else 0 |

---

## 3. City × time slot table: `india_city_slot_month.csv`

| Column | Description |
|---|---|
| `city`, `latitude`, `longitude` | City |
| `slot_index`, `slot`, `slot_mid_hour`, `is_night` | 3-hour window (0 = 00–03 … 7 = 21–24) |
| `accidents_2020_slot` | **Target**: accidents in that city-slot (MoRTH 2020) |
| `city_accidents_2020`, `city_accidents_2022` | City totals |
| `city_fatality_rate_2022` | Deaths / accidents |
| `city_slot_share` | `accidents_2020_slot / city_accidents_2020` |
| `city_monthly_cv` | Coefficient of variation across months (seasonality strength) |

---

## 4. Models & honest results

### A. Severity model (deployed): `severity_model.pkl`
XGBoost classifier · 17 features · 80/20 stratified split · tuned with early stopping.

| Metric | Value |
|---|---|
| Training rows | 104,258 |
| ROC-AUC (held-out) | **0.647** |
| Brier score | 0.173 (baseline 0.182) |
| Fatal/serious rate in the riskiest 10 % | 42 % (vs 24 % average) → **1.75× lift** |
| Top features | number of vehicles, urban/rural, number of casualties, pedestrian crossing, road type, speed limit |

An AUC around 0.65 is typical for collision-severity models in published studies. Severity depends on
seat-belt use, vehicle type, age and medical response, none of which is recorded at scene level.
Tuning (depth 4–8, 300–700 rounds) plateaued at 0.647, so that is the honest ceiling of these features.

### B. Frequency model (evaluated, **not deployed**)
XGBoost Poisson regressor predicting accidents per city × slot, validated with **GroupKFold by city**
(the model never sees the test city).

| | MAE (accidents / slot) |
|---|---|
| XGBoost, unseen cities | 51.1 |
| Baseline: city's 2022 total × national MoRTH time profile | **48.1** |

The ML model does **not** beat the simple real-data baseline, so the app uses each city's real MoRTH
time profile directly. This result is recorded in the model card rather than hidden.

### How the app turns these into a risk level
```
expected deaths/hr = city accidents per hour   (MoRTH 2022 total × city's MoRTH 2020 slot share)
                   × city fatality rate        (MoRTH 2022)
                   × Indian weather multiplier (MoRTH 2018: clear 1.00 · rain 1.10 · fog 1.40 · hail 1.71)
                   × relative severity         (model A probability / 23.9 % base rate)
```
The result is ranked against all 424 real city × slot combinations:
**High** = top 15 %, **Medium** = top 50 %, **Low** = the rest. Every response lists each factor.

### C. Superseded models (removed)
The previous `model.pkl` and `accident_risk_model.pkl` were trained on uniformly random coordinates
with random labels (`backend/ml/final_dataset.csv`, NYC lat/lng). Their 0.35 accuracy on 3 classes was
chance level. Both were deleted together with that data.

---

## What is still simulated (and labelled as such)

| Feature | Why |
|---|---|
| Ambulance positions / movement | No public live GPS feed. Units are stationed at real hospitals and drive toward real incidents |
| Hospital bed occupancy | No national real-time bed API. Hospitals, locations and bed totals are real; occupancy is a time-driven simulation (replace `_tick()` in `services/hospital_registry.py` with an HMIS feed) |
| Live incident alerts | Generated in proportion to each city's real MoRTH 2022 accident count |
