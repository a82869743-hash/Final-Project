"""
Aegis Tactical — Real-Data Accident Demand Model
================================================
Forecasts expected road accidents per city, per 3-hour slot, for any date,
so the fleet planner can pre-position ambulances where demand will be.

    accidents(city, date, slot) = annual_2023(city) / 365
                                  x 12 * month_share(city, month)
                                  x 8  * slot_share(city, slot)

Every input is a real published count:
  - NCRB ADSI 2023  city-wise monthly road accidents (53 million-plus cities)
  - MoRTH 2020      city-wise accidents by 3-hour slot
  - MoRTH 2018      all-India accidents by 3-hour slot (prior)
  - MoRTH 2022      city deaths / accidents (fatality rate)

What is *learned*: raw monthly/slot shares of small cities are noisy
(Amritsar logged 147 accidents in 2023, ~12 a month). Each city's profile is
shrunk toward a prior (its state's 2023 profile for months, the national
profile for time of day) with an empirical-Bayes Dirichlet-multinomial:

    share = (count + k * prior) / (total + k)

The pseudo-count k is fitted by Poisson-thinning cross-validation: each
city's counts are split at random into two halves, the profile is estimated
on one half and scored (multinomial log-likelihood) on the other. k is only
deployed if it beats the raw profile (k = 0) on held-out counts.

Output: ml/demand_model.json
Run:    python ml/demand_pipeline.py
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime

import numpy as np
import pandas as pd

ML = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(ML, "real_data", "raw")
sys.path.insert(0, ML)
from real_pipeline import CITIES, SLOTS, MONTHS, city_key, national_time_profile  # noqa: E402

MONTH_COLS = [f"road_accidents_{m}_2023" for m in
              ["january", "february", "march", "april", "may", "june", "july",
               "august", "september", "october", "november", "december"]]
K_GRID = [0, 1, 2, 5, 10, 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240, 20480]
STATE_ALIASES = {"Andaman and Nicobar Island": "Andaman and Nicobar Islands"}


def load_ncrb_2023() -> tuple[pd.DataFrame, pd.DataFrame]:
    d = pd.read_csv(os.path.join(RAW, "ncrb_adsi_state_monthly_2023.csv"))
    # Rows 0..35 are states/UTs, the rest are cities (same file, NCRB ordering)
    first_city = d.index[d["location_name"] == "Agra"][0]
    states = d.iloc[:first_city].set_index("location_name")
    cities = d.iloc[first_city:].copy()
    cities["key"] = cities["location_name"].str.replace(r"\s*\(City\)", "", regex=True).map(city_key)
    cities = cities.dropna(subset=["key"]).drop_duplicates("key").set_index("key")
    return states, cities


def load_slots_2020() -> pd.DataFrame:
    import re
    t = pd.read_csv(os.path.join(RAW, "morth_cities_time_2020.csv"))
    t["key"] = t["City"].map(city_key)
    t["slot"] = t["Time"].map(lambda s: SLOTS[int(re.match(r"\s*(\d\d)", s).group(1)) // 3])
    return t.pivot_table(index="key", columns="slot", values="Accidents", aggfunc="sum")[SLOTS]


def thinning_cv(counts: np.ndarray, priors: np.ndarray, reps: int = 40, seed: int = 0) -> dict:
    """Held-out multinomial log-likelihood per accident for each k (higher is better).

    counts: (n_cities, n_bins) integer counts; priors: same shape, rows sum to 1.
    """
    rng = np.random.default_rng(seed)
    scores = {k: 0.0 for k in K_GRID}
    n_test = 0
    eps = 1e-9
    for _ in range(reps):
        train = rng.binomial(counts.astype(int), 0.5)
        test = counts - train
        n_test += test.sum()
        tot = train.sum(axis=1, keepdims=True)
        for k in K_GRID:
            share = (train + k * priors) / np.maximum(tot + k, eps)
            share = np.where(share > 0, share, eps)
            scores[k] += float((test * np.log(share)).sum())
    return {k: v / n_test for k, v in scores.items()}


def fit_shrinkage(counts: np.ndarray, priors: np.ndarray, label: str) -> tuple[int, dict]:
    cv = thinning_cv(counts, priors)
    best_k = max(cv, key=cv.get)
    raw, best = cv[0], cv[best_k]
    # Prior alone (k -> infinity): score the held-out half against the prior directly
    rng = np.random.default_rng(0)
    pl, nt = 0.0, 0
    for _ in range(40):
        test = counts - rng.binomial(counts.astype(int), 0.5)
        pl += float((test * np.log(priors)).sum()); nt += test.sum()
    prior_only = round(float(np.exp(-pl / nt)), 4)
    # Perplexity per accident = exp(-loglik); lower is better
    metrics = {
        "label": label,
        "validation": "Poisson thinning CV (50/50 split of each city's counts, 40 repeats)",
        "k_grid": K_GRID,
        "heldout_loglik_per_accident": {str(k): round(v, 5) for k, v in cv.items()},
        "best_k": int(best_k),
        "perplexity_raw_profile": round(float(np.exp(-raw)), 4),
        "perplexity_shrunk_profile": round(float(np.exp(-best)), 4),
        "perplexity_prior_only": prior_only,
        "improvement_vs_raw_pct": round(float((np.exp(-raw) - np.exp(-best)) / np.exp(-raw) * 100), 3),
        "deployed": bool(best > raw),
    }
    return (best_k if best > raw else 0), metrics


def main():
    print("1/3 loading NCRB 2023 monthly + MoRTH 2020 time-of-day tables...")
    states, cities = load_ncrb_2023()
    slots = load_slots_2020()
    nat_slot = national_time_profile()
    nat_slot_vec = np.array([nat_slot[s] for s in SLOTS])

    keys = [k for k in CITIES if k in cities.index]
    print(f"    {len(keys)} cities with 2023 monthly counts, {len(slots)} with 2020 slot counts")

    # ── Monthly seasonality: city counts, prior = the city's state 2023 profile ──
    m_counts, m_priors = [], []
    for k in keys:
        c = cities.loc[k, MONTH_COLS].astype(float).values
        st = STATE_ALIASES.get(CITIES[k][1], CITIES[k][1])
        if st in states.index:
            s = states.loc[st, MONTH_COLS].astype(float).values
        else:
            s = states[MONTH_COLS].astype(float).sum().values
        m_counts.append(c)
        m_priors.append(s / s.sum())
    m_counts, m_priors = np.array(m_counts), np.array(m_priors)

    print("2/3 fitting shrinkage strength (Poisson-thinning CV)...")
    k_month, month_metrics = fit_shrinkage(m_counts, m_priors, "monthly seasonality (prior: state 2023)")
    print(f"    months: best k={month_metrics['best_k']}  perplexity raw={month_metrics['perplexity_raw_profile']}"
          f" -> shrunk={month_metrics['perplexity_shrunk_profile']}  deployed={month_metrics['deployed']}")

    # ── Time of day: city 2020 slot counts, prior = national 2018 profile ──
    s_keys = [k for k in keys if k in slots.index and slots.loc[k].notna().all()]
    s_counts = np.array([slots.loc[k].astype(float).values for k in s_keys])
    s_priors = np.tile(nat_slot_vec / nat_slot_vec.sum(), (len(s_keys), 1))
    k_slot, slot_metrics = fit_shrinkage(s_counts, s_priors, "time of day (prior: national 2018)")
    print(f"    slots:  best k={slot_metrics['best_k']}  perplexity raw={slot_metrics['perplexity_raw_profile']}"
          f" -> shrunk={slot_metrics['perplexity_shrunk_profile']}  deployed={slot_metrics['deployed']}")

    # ── Fatality (MoRTH 2022) from the existing master dataset ──
    master = pd.read_csv(os.path.join(ML, "india_road_accident_master.csv")).set_index("city")

    print("3/3 writing demand_model.json...")
    out_cities = {}
    for i, k in enumerate(keys):
        name, state, lat, lng = CITIES[k]
        mc = m_counts[i]
        month_share = (mc + k_month * m_priors[i]) / (mc.sum() + k_month)
        if k in s_keys:
            sc = s_counts[s_keys.index(k)]
            slot_share = (sc + k_slot * s_priors[0]) / (sc.sum() + k_slot)
            slot_src = "MoRTH 2020 (shrunk)"
        else:
            slot_share = s_priors[0]
            slot_src = "MoRTH 2018 national"
        fr = master["fatality_rate_2022"].get(name, np.nan)
        out_cities[name] = {
            "state": state, "lat": lat, "lng": lng,
            "accidents_2023": int(mc.sum()),
            "accidents_2022": None if pd.isna(master["accidents_2022"].get(name, np.nan))
            else int(master["accidents_2022"].get(name)),
            "fatality_rate_2022": None if pd.isna(fr) else round(float(fr), 4),
            "month_share": [round(float(x), 5) for x in month_share],
            "month_counts_2023": [int(x) for x in mc],
            "slot_share": [round(float(x), 5) for x in slot_share],
            "slot_source": slot_src,
        }
    nat_month = m_counts.sum(axis=0)
    model = {
        "model_version": "aegis_demand_v1.0",
        "timestamp": datetime.now().isoformat(),
        "formula": "annual_2023 / 365 x 12*month_share x 8*slot_share  (accidents per 3-hour slot / 3)",
        "sources": ["NCRB ADSI 2023 city monthly", "MoRTH 2020 city time-of-day",
                    "MoRTH 2018 national time-of-day", "MoRTH 2022 city deaths"],
        "slots": SLOTS, "months": MONTHS,
        "national_month_share_2023": [round(float(x), 5) for x in nat_month / nat_month.sum()],
        "national_slot_share_2018": [round(float(x), 5) for x in nat_slot_vec / nat_slot_vec.sum()],
        "shrinkage": {"month": month_metrics, "slot": slot_metrics},
        "total_accidents_2023": int(m_counts.sum()),
        "cities": out_cities,
    }
    with open(os.path.join(ML, "demand_model.json"), "w") as f:
        json.dump(model, f, indent=2)
    print(f"    {len(out_cities)} cities, {model['total_accidents_2023']:,} accidents in 2023")


if __name__ == "__main__":
    main()
