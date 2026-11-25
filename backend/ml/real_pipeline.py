"""
Aegis Tactical — Real-Data Accident Risk Pipeline
=================================================
Every number here comes from published government road-accident data.
Nothing is randomly generated.

Sources (raw copies in ml/real_data/raw/, see ml/real_data/README.md):
  India
    - MoRTH "Road Accidents in India 2022": accidents, deaths and injured in
      50 million-plus cities, 2021 and 2022
    - MoRTH 2020 city-wise accidents by time of day (8 x 3-hour slots)
    - MoRTH 2020 city-wise accidents by month
    - MoRTH 2018 state-wise accidents and deaths by weather condition
    - NCRB ADSI: state and city road-accident cases, injured, died
    - NCRB 2020 cause-wise distribution (over-speeding, drunk driving, ...)
  Record level
    - UK DfT STATS19 2023: 104,258 police-reported collisions with
      severity, time, light, weather, surface, speed limit, road type,
      junction and urban/rural. India publishes no geocoded per-crash
      data, so condition-to-severity effects are learned from these
      records and applied to Indian conditions.

Outputs (ml/):
  india_road_accident_master.csv        master city dataset (1 row per city)
  india_city_slot_month.csv             long training table for model B
  severity_model.pkl                    model A (XGBoost, KSI probability)
  (model B, a city x time-slot frequency regressor, is evaluated and its
   result recorded, but it is NOT deployed: on unseen cities it does not
   beat the real MoRTH national time profile, so the app uses the real
   per-city profiles directly instead of an ML approximation.)
  real_model_metadata.json              metrics + feature lists
  risk_zones.json                       real city risk zones for the map

Run:  python ml/real_pipeline.py            (downloads STATS19 if missing)
"""

from __future__ import annotations

import json
import os
import re
import urllib.request
from datetime import datetime

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import (accuracy_score, brier_score_loss, mean_absolute_error,
                             r2_score, roc_auc_score)
from sklearn.model_selection import GroupKFold, train_test_split
from xgboost import XGBClassifier, XGBRegressor

ML = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(ML, "real_data", "raw")
STATS19_URL = ("https://data.dft.gov.uk/road-accidents-safety-data/"
               "dft-road-casualty-statistics-collision-2023.csv")
STATS19_RAW = os.path.join(RAW, "stats19_collisions_2023.csv")
STATS19_PROCESSED = os.path.join(ML, "real_data", "uk_stats19_2023_model_features.csv.gz")

# Canonical city key -> (display name, state, lat, lng)
CITIES = {
    "AGRA": ("Agra", "Uttar Pradesh", 27.1767, 78.0081),
    "AHMEDABAD": ("Ahmedabad", "Gujarat", 23.0225, 72.5714),
    "PRAYAGRAJ": ("Prayagraj", "Uttar Pradesh", 25.4358, 81.8463),
    "AMRITSAR": ("Amritsar", "Punjab", 31.6340, 74.8723),
    "ASANSOL": ("Asansol-Durgapur", "West Bengal", 23.6739, 86.9524),
    "AURANGABAD": ("Aurangabad", "Maharashtra", 19.8762, 75.3433),
    "BENGALURU": ("Bengaluru", "Karnataka", 12.9716, 77.5946),
    "BHOPAL": ("Bhopal", "Madhya Pradesh", 23.2599, 77.4126),
    "CHANDIGARH": ("Chandigarh", "Chandigarh", 30.7333, 76.7794),
    "CHENNAI": ("Chennai", "Tamil Nadu", 13.0827, 80.2707),
    "COIMBATORE": ("Coimbatore", "Tamil Nadu", 11.0168, 76.9558),
    "DELHI": ("Delhi", "Delhi", 28.6139, 77.2090),
    "DHANBAD": ("Dhanbad", "Jharkhand", 23.7957, 86.4304),
    "DURG": ("Durg-Bhilainagar", "Chhattisgarh", 21.1938, 81.3509),
    "FARIDABAD": ("Faridabad", "Haryana", 28.4089, 77.3178),
    "GHAZIABAD": ("Ghaziabad", "Uttar Pradesh", 28.6692, 77.4538),
    "GWALIOR": ("Gwalior", "Madhya Pradesh", 26.2183, 78.1828),
    "HYDERABAD": ("Hyderabad", "Telangana", 17.3850, 78.4867),
    "INDORE": ("Indore", "Madhya Pradesh", 22.7196, 75.8577),
    "JABALPUR": ("Jabalpur", "Madhya Pradesh", 23.1815, 79.9864),
    "JAIPUR": ("Jaipur", "Rajasthan", 26.9124, 75.7873),
    "JAMSHEDPUR": ("Jamshedpur", "Jharkhand", 22.8046, 86.2029),
    "JODHPUR": ("Jodhpur", "Rajasthan", 26.2389, 73.0243),
    "KANNUR": ("Kannur", "Kerala", 11.8745, 75.3704),
    "KANPUR": ("Kanpur", "Uttar Pradesh", 26.4499, 80.3319),
    "KOCHI": ("Kochi", "Kerala", 9.9312, 76.2673),
    "KOLKATA": ("Kolkata", "West Bengal", 22.5726, 88.3639),
    "KOLLAM": ("Kollam", "Kerala", 8.8932, 76.6141),
    "KOTA": ("Kota", "Rajasthan", 25.2138, 75.8648),
    "KOZHIKODE": ("Kozhikode", "Kerala", 11.2588, 75.7804),
    "LUCKNOW": ("Lucknow", "Uttar Pradesh", 26.8467, 80.9462),
    "LUDHIANA": ("Ludhiana", "Punjab", 30.9010, 75.8573),
    "MADURAI": ("Madurai", "Tamil Nadu", 9.9252, 78.1198),
    "MALAPPURAM": ("Malappuram", "Kerala", 11.0732, 76.0740),
    "MEERUT": ("Meerut", "Uttar Pradesh", 28.9845, 77.7064),
    "MUMBAI": ("Mumbai", "Maharashtra", 19.0760, 72.8777),
    "NAGPUR": ("Nagpur", "Maharashtra", 21.1458, 79.0882),
    "NASHIK": ("Nashik", "Maharashtra", 19.9975, 73.7898),
    "PATNA": ("Patna", "Bihar", 25.5941, 85.1376),
    "PUNE": ("Pune", "Maharashtra", 18.5204, 73.8567),
    "RAIPUR": ("Raipur", "Chhattisgarh", 21.2514, 81.6296),
    "RAJKOT": ("Rajkot", "Gujarat", 22.3039, 70.8022),
    "RANCHI": ("Ranchi", "Jharkhand", 23.3441, 85.3096),
    "SRINAGAR": ("Srinagar", "Jammu and Kashmir", 34.0837, 74.7973),
    "SURAT": ("Surat", "Gujarat", 21.1702, 72.8311),
    "THIRUVANANTHAPURAM": ("Thiruvananthapuram", "Kerala", 8.5241, 76.9366),
    "THRISSUR": ("Thrissur", "Kerala", 10.5276, 76.2144),
    "TIRUCHIRAPPALLI": ("Tiruchirappalli", "Tamil Nadu", 10.7905, 78.7047),
    "VADODARA": ("Vadodara", "Gujarat", 22.3072, 73.1812),
    "VARANASI": ("Varanasi", "Uttar Pradesh", 25.3176, 82.9739),
    "VASAI": ("Vasai-Virar", "Maharashtra", 19.3919, 72.8397),
    "VIJAYAWADA": ("Vijayawada", "Andhra Pradesh", 16.5062, 80.6480),
    "VISAKHAPATNAM": ("Visakhapatnam", "Andhra Pradesh", 17.6868, 83.2185),
}

ALIASES = {"ALLAHABAD": "PRAYAGRAJ", "ALLAHABADPRAYAGRAJ": "PRAYAGRAJ", "PRAYAGRAJ+": "PRAYAGRAJ",
           "ASANSOLDURGAPUR": "ASANSOL", "CHANDIGARHCITY": "CHANDIGARH", "DELHICITY": "DELHI",
           "DURGBHILAINAGAR": "DURG", "NASIK": "NASHIK", "THIRUVANTHAPURAM": "THIRUVANANTHAPURAM",
           "VASAIVIRAR": "VASAI", "VIJAYAWADACITY": "VIJAYAWADA", "VIZAQ": "VISAKHAPATNAM",
           "VISHAKHAPATNAM": "VISAKHAPATNAM"}

SLOTS = ["00-03", "03-06", "06-09", "09-12", "12-15", "15-18", "18-21", "21-24"]
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def city_key(name: str) -> str | None:
    k = re.sub(r"[^A-Z+]", "", str(name).upper())
    k = ALIASES.get(k, k)
    if k in CITIES:
        return k
    k2 = k.rstrip("+")
    return ALIASES.get(k2, k2) if ALIASES.get(k2, k2) in CITIES else None


def num(x) -> float:
    try:
        return float(str(x).replace(",", "").strip())
    except ValueError:
        return np.nan


# ───────────────────────── India master dataset ─────────────────────────

def build_india_master() -> tuple[pd.DataFrame, pd.DataFrame]:
    m22 = pd.read_csv(os.path.join(RAW, "morth_cities_2021_2022.csv"), encoding="utf-8-sig")
    m22["key"] = m22["Cities"].map(city_key)
    m22 = m22.dropna(subset=["key"])
    cols = {"Accidents 2021": "accidents_2021", "Accidents 2022": "accidents_2022",
            "Deaths 2021": "deaths_2021", "Deaths 2022": "deaths_2022",
            "Injured 2021": "injured_2021", "Injured 2022": "injured_2022"}
    m22 = m22[["key", *cols]].rename(columns=cols)
    for c in cols.values():
        m22[c] = m22[c].map(num)

    tod = pd.read_csv(os.path.join(RAW, "morth_cities_time_2020.csv"))
    tod["key"] = tod["City"].map(city_key)
    tod["slot"] = tod["Time"].map(lambda t: SLOTS[int(re.match(r"\s*(\d\d)", t).group(1)) // 3])
    tod_w = tod.pivot_table(index="key", columns="slot", values="Accidents", aggfunc="sum")[SLOTS]
    tod_w.columns = [f"acc_2020_slot_{s}" for s in SLOTS]

    mon = pd.read_csv(os.path.join(RAW, "morth_cities_month_2020.csv"))
    mon["key"] = mon["City"].map(city_key)
    mon["m"] = mon["Month"].str.strip(". ").str[:3]
    mon = mon[mon["m"].isin(MONTHS)]
    mon_w = mon.pivot_table(index="key", columns="m", values="Accidents", aggfunc="sum")[MONTHS]
    mon_w.columns = [f"acc_2020_{m.lower()}" for m in MONTHS]

    ncrb = pd.read_csv(os.path.join(RAW, "ncrb_adsi_state_city.csv"))
    ncrb["key"] = ncrb["State/UT/City"].map(city_key)
    ncrb = ncrb.dropna(subset=["key"]).drop_duplicates("key", keep="last")
    ncrb = ncrb[["key", "Road Accidents - Cases", "Road Accidents - Injured", "Road Accidents - Died"]]
    ncrb.columns = ["key", "ncrb_road_cases", "ncrb_road_injured", "ncrb_road_died"]

    cause = pd.read_csv(os.path.join(RAW, "ncrb_cause_state_city_2020.csv"))
    cause["key"] = cause["State/UT/City"].map(city_key)
    cause = cause[(cause["Category"].str.lower().str.contains("city")) & cause["key"].notna()]
    tot = cause["Total Road Accidents - Cases"].replace(0, np.nan)
    cause_df = pd.DataFrame({
        "key": cause["key"],
        "share_overspeeding_2020": (cause["Over Speeding - Cases"] / tot).round(4),
        "share_careless_driving_2020": (cause["Dangerous or Careless Driving/ Over-taking/etc. - Cases"] / tot).round(4),
        "share_drunk_driving_2020": (cause["Driving under Influence of Drug/Alcohol - Cases"] / tot).round(4),
        "share_poor_visibility_2020": (cause["Weather Condition (Poor Visibility) - Cases"] / tot).round(4),
    }).drop_duplicates("key")

    base = pd.DataFrame([{"key": k, "city": v[0], "state": v[1], "latitude": v[2], "longitude": v[3]}
                         for k, v in CITIES.items()])
    df = (base.merge(m22, on="key", how="left").merge(tod_w, on="key", how="left")
          .merge(mon_w, on="key", how="left").merge(ncrb, on="key", how="left")
          .merge(cause_df, on="key", how="left"))

    slot_cols = [c for c in df.columns if c.startswith("acc_2020_slot_")]
    df["accidents_2020"] = df[slot_cols].sum(axis=1, min_count=1)
    df["fatality_rate_2022"] = (df["deaths_2022"] / df["accidents_2022"]).round(4)
    df["yoy_change_2021_2022"] = ((df["accidents_2022"] - df["accidents_2021"]) / df["accidents_2021"]).round(4)
    df["night_share_2020"] = (df[["acc_2020_slot_18-21", "acc_2020_slot_21-24",
                                  "acc_2020_slot_00-03", "acc_2020_slot_03-06"]].sum(axis=1)
                              / df["accidents_2020"]).round(4)
    # Composite: expected deaths per year (latest year available)
    latest_acc = df["accidents_2022"].fillna(df["accidents_2020"])
    df["risk_index"] = (latest_acc * df["fatality_rate_2022"].fillna(df["fatality_rate_2022"].median()))
    df["risk_index"] = (df["risk_index"] / df["risk_index"].max() * 100).round(1)
    q = df["risk_index"].quantile([0.5, 0.8])
    df["risk_tier"] = np.where(df["risk_index"] >= q[0.8], "High",
                               np.where(df["risk_index"] >= q[0.5], "Medium", "Low"))
    df = df.drop(columns=["key"]).sort_values("risk_index", ascending=False)

    # Long table: city x slot x month (model B training data)
    rows = []
    for k in CITIES:
        if k not in tod_w.index or k not in mon_w.index:
            continue
        slot_vals = tod_w.loc[k].values.astype(float)
        mon_vals = mon_w.loc[k].values.astype(float)
        total = slot_vals.sum()
        if not total or np.isnan(total):
            continue
        acc22 = m22.set_index("key")["accidents_2022"].get(k, np.nan)
        fr22 = (m22.set_index("key")["deaths_2022"].get(k, np.nan) / acc22) if acc22 else np.nan
        for si, s in enumerate(SLOTS):
            rows.append({"city": CITIES[k][0], "latitude": CITIES[k][2], "longitude": CITIES[k][3],
                         "slot_index": si, "slot": s, "slot_mid_hour": si * 3 + 1.5,
                         "is_night": int(si in (0, 1, 6, 7)),
                         "accidents_2020_slot": slot_vals[si],
                         "city_accidents_2020": total, "city_accidents_2022": acc22,
                         "city_fatality_rate_2022": fr22,
                         "city_slot_share": slot_vals[si] / total,
                         "city_monthly_cv": np.nanstd(mon_vals) / np.nanmean(mon_vals)})
    long = pd.DataFrame(rows)
    return df, long


# ───────────────────────── Model A: severity (STATS19) ─────────────────────────

SEV_FEATURES = ["hour", "day_of_week", "month", "light_conditions", "weather_conditions",
                "road_surface_conditions", "speed_limit", "road_type", "urban_or_rural_area",
                "junction_detail", "junction_control", "number_of_vehicles", "number_of_casualties",
                "first_road_class", "pedestrian_crossing", "carriageway_hazards",
                "special_conditions_at_site"]


def load_stats19() -> pd.DataFrame:
    if os.path.exists(STATS19_PROCESSED):
        return pd.read_csv(STATS19_PROCESSED)
    if not os.path.exists(STATS19_RAW):
        print("    downloading STATS19 2023 (~20 MB)...")
        urllib.request.urlretrieve(STATS19_URL, STATS19_RAW)
    raw = pd.read_csv(STATS19_RAW, low_memory=False)
    d = pd.DataFrame()
    t = pd.to_datetime(raw["time"], format="%H:%M", errors="coerce")
    d["hour"] = t.dt.hour
    dt = pd.to_datetime(raw["date"], format="%d/%m/%Y", errors="coerce")
    d["month"] = dt.dt.month
    d["day_of_week"] = raw["day_of_week"]           # 1=Sunday ... 7=Saturday
    for c in SEV_FEATURES:
        if c not in d.columns:
            d[c] = raw[c]
    d["latitude"] = raw["latitude"]; d["longitude"] = raw["longitude"]
    d["severity"] = raw["collision_severity"]       # 1 fatal, 2 serious, 3 slight
    d["ksi"] = (d["severity"] <= 2).astype(int)     # killed or seriously injured
    d = d.replace(-1, np.nan).dropna(subset=["hour", "speed_limit", "severity"])
    d.to_csv(STATS19_PROCESSED, index=False, compression="gzip")
    return d


def train_severity(d: pd.DataFrame) -> tuple[XGBClassifier, dict]:
    X, y = d[SEV_FEATURES], d["ksi"]
    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.2, stratify=y, random_state=42)
    pos_w = (ytr == 0).sum() / (ytr == 1).sum()
    # Tuned with early stopping on a validation split (best ~700 rounds at depth 4)
    model = XGBClassifier(n_estimators=700, max_depth=4, learning_rate=0.03, subsample=0.85,
                          colsample_bytree=0.7, min_child_weight=10, eval_metric="auc",
                          scale_pos_weight=pos_w, random_state=42, n_jobs=-1)
    model.fit(Xtr, ytr)
    p = model.predict_proba(Xte)[:, 1]
    base_rate = float(ytr.mean())
    # Calibration-free probability: undo class weighting for display
    odds = p / (1 - p) / pos_w
    p_cal = odds / (1 + odds)
    metrics = {
        "dataset": "UK DfT STATS19 2023 collisions", "rows": int(len(d)),
        "target": "KSI (fatal or serious collision)", "base_rate_ksi": round(base_rate, 4),
        "roc_auc": round(float(roc_auc_score(yte, p)), 4),
        "brier_calibrated": round(float(brier_score_loss(yte, p_cal)), 4),
        "brier_baseline": round(float(brier_score_loss(yte, np.full(len(yte), base_rate))), 4),
        "accuracy_at_0.5": round(float(accuracy_score(yte, p >= 0.5)), 4),
        "pos_weight": round(float(pos_w), 4),
        "feature_importance": {f: round(float(v), 4) for f, v in zip(SEV_FEATURES, model.feature_importances_)},
    }
    # relative risk lift for the top decile vs base rate
    top = p >= np.quantile(p, 0.9)
    metrics["top_decile_ksi_rate"] = round(float(yte[top].mean()), 4)
    metrics["top_decile_lift"] = round(float(yte[top].mean() / base_rate), 2)
    return model, metrics


# ───────────────────────── Model B: Indian frequency ─────────────────────────

FREQ_FEATURES = ["slot_mid_hour", "is_night", "national_slot_share", "naive_expected",
                 "city_accidents_2022", "city_fatality_rate_2022", "latitude", "longitude",
                 "city_monthly_cv"]


def train_frequency(long: pd.DataFrame) -> tuple[XGBRegressor, dict]:
    d = long.dropna(subset=["city_accidents_2022"]).copy()
    nat = national_time_profile()
    d["national_slot_share"] = d["slot"].map(nat)
    # scale 2022 totals to 2020 level using the all-city ratio (2020 was a COVID year)
    covid_ratio = d.groupby("city")["city_accidents_2020"].first().sum() / \
        d.groupby("city")["city_accidents_2022"].first().sum()
    d["naive_expected"] = d["city_accidents_2022"] * covid_ratio * d["national_slot_share"]
    X, y, groups = d[FREQ_FEATURES], d["accidents_2020_slot"], d["city"]
    params = dict(objective="count:poisson", n_estimators=500, max_depth=3, learning_rate=0.05,
                  subsample=0.9, colsample_bytree=0.9, random_state=42, n_jobs=-1)
    oof = np.zeros(len(d))
    for tr, te in GroupKFold(n_splits=5).split(X, y, groups):
        m = XGBRegressor(**params).fit(X.iloc[tr], y.iloc[tr])
        oof[te] = m.predict(X.iloc[te])
    model = XGBRegressor(**params).fit(X, y)
    # Fair baseline (same information as the model): 2022 city total, COVID-scaled,
    # split by the national MoRTH time-of-day profile
    flat = d["naive_expected"]
    metrics = {
        "dataset": "MoRTH 2020 city x 3-hour slot accidents + MoRTH 2022 city totals",
        "rows": int(len(d)), "cities": int(d["city"].nunique()),
        "validation": "5-fold GroupKFold by city (model never sees the test city)",
        "r2_unseen_city": round(float(r2_score(y, oof)), 4),
        "mae_unseen_city": round(float(mean_absolute_error(y, oof)), 2),
        "r2_log_unseen_city": round(float(r2_score(np.log1p(y), np.log1p(oof))), 4),
        "mae_baseline_national_profile": round(float(mean_absolute_error(y, flat)), 2),
        "r2_baseline_national_profile": round(float(r2_score(y, flat)), 4),
        "covid_ratio_2020_vs_2022": round(float(covid_ratio), 4),
        "feature_importance": {f: round(float(v), 4) for f, v in zip(FREQ_FEATURES, model.feature_importances_)},
    }
    model.covid_ratio_ = float(covid_ratio)
    return model, metrics


# ───────────────────────── India weather severity factors ─────────────────────────

def weather_factors() -> dict:
    w = pd.read_csv(os.path.join(RAW, "morth_state_weather_2018.csv"))
    w = w[~w["States/UTs"].astype(str).str.contains("Total", case=False)]
    pairs = {"clear": ("Sunny/Clear - Total Accidents - Number", "Sunny/Clear - Persons Killed - Number"),
             "rain": ("Rainy - Total Accidents", "Rainy - Persons Killed"),
             "fog": ("Foggy & Misty - Total Accidents", "Foggy & Misty - Persons Killed"),
             "hail": ("Hail/Sleet - Total Accidents", "Hail/Sleet - Persons Killed")}
    out = {}
    for k, (a, kcol) in pairs.items():
        acc, killed = w[a].map(num).sum(), w[kcol].map(num).sum()
        out[k] = {"accidents": int(acc), "killed": int(killed), "deaths_per_100": round(killed / acc * 100, 2)}
    base = out["clear"]["deaths_per_100"]
    for k in out:
        out[k]["severity_multiplier"] = round(out[k]["deaths_per_100"] / base, 3)
    return out


def national_time_profile() -> dict:
    t = pd.read_csv(os.path.join(RAW, "morth_national_time_2018.csv"))
    t["slot"] = t["Time"].map(lambda s: SLOTS[int(re.match(r"\s*(\d\d)", s).group(1)) // 3])
    tot = t["Number of Accidents"].sum()
    return {r.slot: round(r["Number of Accidents"] / tot, 4) for _, r in t.iterrows()}


def build_zones(master: pd.DataFrame) -> list:
    colors = {"Low": "#10b981", "Medium": "#f59e0b", "High": "#ef4444"}
    zones = []
    for r in master.itertuples():
        acc = r.accidents_2022 if not np.isnan(r.accidents_2022) else r.accidents_2020
        if np.isnan(acc):
            continue
        zones.append({"lat": r.latitude, "lng": r.longitude, "risk_level": r.risk_tier,
                      "color": colors[r.risk_tier], "accident_count": int(acc),
                      "deaths": None if np.isnan(r.deaths_2022) else int(r.deaths_2022),
                      "fatality_rate": None if np.isnan(r.fatality_rate_2022) else float(r.fatality_rate_2022),
                      "risk_index": float(r.risk_index), "area": r.city, "state": r.state,
                      "radius": int(4000 + 14000 * r.risk_index / 100),
                      "source": "MoRTH 2022" if not np.isnan(r.accidents_2022) else "MoRTH 2020"})
    return zones


def _profile_frame(master: pd.DataFrame) -> pd.DataFrame:
    f = master.copy()
    sc = [f"acc_2020_slot_{s}" for s in SLOTS]
    mc = [f"acc_2020_{m.lower()}" for m in MONTHS]
    st, mt = f[sc].sum(axis=1), f[mc].sum(axis=1)
    for i, c in enumerate(sc):
        f[f"s{i}"] = f[c] / st
    for i, c in enumerate(mc):
        f[f"m{i}"] = f[c] / mt
    return f


def main():
    print("1/4 building India master dataset from MoRTH + NCRB...")
    master, long = build_india_master()
    master.to_csv(os.path.join(ML, "india_road_accident_master.csv"), index=False)
    long.to_csv(os.path.join(ML, "india_city_slot_month.csv"), index=False)
    print(f"    {len(master)} cities, {len(long)} city x slot rows")

    print("2/4 training severity model on STATS19 records...")
    d = load_stats19()
    sev, sev_m = train_severity(d)
    joblib.dump(sev, os.path.join(ML, "severity_model.pkl"))
    print(f"    rows={sev_m['rows']} AUC={sev_m['roc_auc']} top-decile lift={sev_m['top_decile_lift']}x")

    print("3/4 evaluating Indian frequency model (MoRTH city x time)...")
    _, freq_m = train_frequency(long)
    freq_m["deployed"] = freq_m["mae_unseen_city"] < freq_m["mae_baseline_national_profile"]
    freq_m["decision"] = ("deployed" if freq_m["deployed"] else
                          "not deployed: real per-city MoRTH time profiles are used directly")
    print(f"    unseen-city MAE={freq_m['mae_unseen_city']} vs baseline "
          f"{freq_m['mae_baseline_national_profile']} -> {freq_m['decision']}")

    print("4/4 writing zones + metadata...")
    zones = build_zones(master)
    with open(os.path.join(ML, "risk_zones.json"), "w") as f:
        json.dump(zones, f)
    meta = {
        "model_version": "aegis_real_v3.0", "timestamp": datetime.now().isoformat(),
        "severity_model": {**sev_m, "features": SEV_FEATURES},
        "frequency_model": {**freq_m, "features": FREQ_FEATURES},
        "india_weather_factors_2018": weather_factors(),
        "india_national_time_profile_2018": national_time_profile(),
        "slots": SLOTS,
        "city_profiles": {
            r.city: {"lat": r.latitude, "lng": r.longitude, "state": r.state,
                     "accidents_2022": None if pd.isna(r.accidents_2022) else int(r.accidents_2022),
                     "deaths_2022": None if pd.isna(r.deaths_2022) else int(r.deaths_2022),
                     "fatality_rate_2022": None if pd.isna(r.fatality_rate_2022) else float(r.fatality_rate_2022),
                     "risk_index": float(r.risk_index), "risk_tier": r.risk_tier,
                     "slot_share": [None if pd.isna(getattr(r, f"s{i}")) else round(float(getattr(r, f"s{i}")), 4)
                                    for i in range(8)],
                     "month_share": [None if pd.isna(getattr(r, f"m{i}")) else round(float(getattr(r, f"m{i}")), 4)
                                     for i in range(12)]}
            for r in _profile_frame(master).itertuples()},
    }
    with open(os.path.join(ML, "real_model_metadata.json"), "w") as f:
        json.dump(meta, f, indent=2)
    print(f"    {len(zones)} zones written")


if __name__ == "__main__":
    main()
