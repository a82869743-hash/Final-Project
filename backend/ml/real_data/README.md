# Raw source tables

Unmodified copies of the public tables used by `ml/real_pipeline.py`.
Full data dictionary: [`/DATASETS.md`](../../../DATASETS.md).

| File | Source |
|---|---|
| `raw/morth_cities_2021_2022.csv` | MoRTH, *Road Accidents in India 2022*: million-plus cities (accidents / deaths / injured, 2021–2022) |
| `raw/morth_cities_time_2020.csv` | MoRTH, *Road Accidents in India 2020*: city-wise accidents by time of day |
| `raw/morth_cities_month_2020.csv` | MoRTH, *Road Accidents in India 2020*: city-wise accidents by month |
| `raw/morth_state_weather_2018.csv` | MoRTH, *Road Accidents in India 2018*: state-wise accidents by weather |
| `raw/morth_national_time_2018.csv` | MoRTH, *Road Accidents in India 2018*: all-India accidents by time of day |
| `raw/ncrb_adsi_state_city.csv` | NCRB, *ADSI* Table 1A.2: state/UT/city traffic accidents |
| `raw/ncrb_cause_state_city_2020.csv` | NCRB, *ADSI 2020*: cause-wise distribution of road accidents |
| `raw/ncrb_adsi_state_monthly_2023.csv` | NCRB, *ADSI 2023*: state-wise monthly road accidents (reference) |
| `raw/stats19_collisions_2023.csv` | UK DfT STATS19 2023 collisions (~20 MB, **git-ignored**; downloaded automatically) |
| `uk_stats19_2023_model_features.csv.gz` | Model-ready extract of the STATS19 file (committed, so training works offline) |

The Indian tables are open government data (data.gov.in / MoRTH / NCRB publications), retrieved
via public mirrors of the official releases. STATS19 is published under the UK Open Government Licence v3.0.
