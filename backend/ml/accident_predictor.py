"""
Accident Risk Prediction ML Pipeline
=====================================
Trains an XGBoost classifier on real CSV datasets to predict
accident-prone zones as High / Medium / Low risk.

Features (X): latitude, longitude, traffic_density, accident_history,
              time_of_day, weather
Target  (y): risk_level  → 0 (Low), 1 (Medium), 2 (High)

Usage:
    python ml/accident_predictor.py
"""

import os
import sys
import json
import joblib
import numpy as np
import pandas as pd
from datetime import datetime
from xgboost import XGBClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report
from sklearn.preprocessing import LabelEncoder

# ── Paths ──
BASE_DIR = os.path.dirname(os.path.dirname(__file__))           # backend/
PROJECT_ROOT = os.path.dirname(os.path.dirname(BASE_DIR))       # Project Ui/
ML_DIR = os.path.join(BASE_DIR, "ml")

ACCIDENTS_CSV = os.path.join(PROJECT_ROOT, "india_road_accidents_large.csv")
TRAFFIC_CSV = os.path.join(PROJECT_ROOT, "all_features_traffic_dataset.csv")
ROAD_CSV = os.path.join(PROJECT_ROOT, "Road.csv")

MODEL_PATH = os.path.join(ML_DIR, "accident_risk_model.pkl")
METADATA_PATH = os.path.join(ML_DIR, "accident_risk_metadata.json")
GRID_CACHE_PATH = os.path.join(ML_DIR, "grid_accident_counts.json")


# ── Step 1: Load Data ──

def load_accidents():
    """Load and parse the India road accidents dataset."""
    print("📂 Loading accidents data...")
    df = pd.read_csv(ACCIDENTS_CSV)
    print(f"   → {len(df)} records loaded. Columns: {list(df.columns)}")
    return df


def load_traffic():
    """Load the comprehensive traffic features dataset."""
    print("📂 Loading traffic data...")
    df = pd.read_csv(TRAFFIC_CSV)
    print(f"   → {len(df)} records loaded. Columns: {list(df.columns)[:10]}...")
    return df


# ── Step 2: Clean & Preprocess ──

def preprocess_accidents(df: pd.DataFrame) -> pd.DataFrame:
    """Clean accidents data and extract features."""
    # Keep essential columns
    cols_needed = ["latitude", "longitude", "severity", "traffic_density",
                   "weather", "road_condition", "date"]
    available = [c for c in cols_needed if c in df.columns]
    df = df[available].copy()

    # Handle missing values
    df.dropna(subset=["latitude", "longitude"], inplace=True)
    df["severity"].fillna("Medium", inplace=True)
    df["traffic_density"].fillna("Medium", inplace=True)
    df["weather"].fillna("Clear", inplace=True)

    # Extract time_of_day from date
    if "date" in df.columns:
        df["date"] = pd.to_datetime(df["date"], errors="coerce")
        df["hour"] = df["date"].dt.hour.fillna(12).astype(int)
    else:
        df["hour"] = 12  # default noon

    # Encode categoricals
    severity_map = {"Low": 0, "Medium": 1, "High": 2}
    df["severity_num"] = df["severity"].map(severity_map).fillna(1).astype(int)

    density_map = {"Low": 1, "Medium": 2, "High": 3}
    df["traffic_density_num"] = df["traffic_density"].map(density_map).fillna(2).astype(int)

    weather_map = {"Clear": 0, "Rain": 1, "Fog": 2, "Storm": 3,
                   "Cloudy": 1, "Snow": 2}
    df["weather_num"] = df["weather"].map(weather_map).fillna(0).astype(int)

    # Time of day encoding: morning=0, afternoon=1, evening=2, night=3
    def hour_to_period(h):
        if 6 <= h < 12:
            return 0   # morning
        elif 12 <= h < 18:
            return 1   # afternoon
        elif 18 <= h < 22:
            return 2   # evening
        else:
            return 3   # night
    df["time_of_day"] = df["hour"].apply(hour_to_period)

    print(f"   ✅ Preprocessed: {len(df)} records after cleaning")
    return df


# ── Step 3: Feature Engineering ──

def compute_accident_history(df: pd.DataFrame, grid_size: float = 0.01) -> pd.DataFrame:
    """
    Group accidents into geographic grid cells and compute
    accident frequency per cell. grid_size ≈ 0.01° ≈ 1.1km.
    """
    df["grid_lat"] = (df["latitude"] / grid_size).round(0) * grid_size
    df["grid_lng"] = (df["longitude"] / grid_size).round(0) * grid_size

    # Count accidents per grid cell
    grid_counts = df.groupby(["grid_lat", "grid_lng"]).size().reset_index(name="accident_count")
    df = df.merge(grid_counts, on=["grid_lat", "grid_lng"], how="left")
    df["accident_history"] = df["accident_count"].fillna(0).astype(int)

    # Save grid counts for inference-time lookup
    grid_dict = {}
    for _, row in grid_counts.iterrows():
        key = f"{row['grid_lat']:.2f},{row['grid_lng']:.2f}"
        grid_dict[key] = int(row["accident_count"])

    with open(GRID_CACHE_PATH, "w") as f:
        json.dump(grid_dict, f)
    print(f"   📊 Grid accident counts saved: {len(grid_dict)} cells")

    return df


def build_features(df: pd.DataFrame) -> tuple:
    """Build feature matrix X and target y."""

    # Feature columns
    feature_cols = ["latitude", "longitude", "traffic_density_num",
                    "accident_history", "time_of_day", "weather_num"]

    X = df[feature_cols].copy()
    X.columns = ["latitude", "longitude", "traffic_density",
                  "accident_history", "time_of_day", "weather"]

    # Target: risk_level based on severity + frequency
    # Use percentile-based thresholds to guarantee all 3 classes exist
    severity_vals = df["severity_num"].values
    freq_vals = df["accident_history"].values

    # Normalize frequency to 0-1 using max value
    max_freq = max(freq_vals.max(), 1)
    freq_norm = freq_vals / max_freq

    # Combined risk score
    scores = severity_vals * 0.4 / 2.0 + freq_norm * 0.6  # Scale severity to 0-1

    # Use percentile-based thresholds for balanced classes
    p33 = np.percentile(scores, 33)
    p66 = np.percentile(scores, 66)

    y = pd.Series(np.where(scores >= p66, 2, np.where(scores >= p33, 1, 0)),
                  index=df.index, dtype=int)

    print(f"   Risk thresholds: Low < {p33:.3f} < Medium < {p66:.3f} < High")
    print(f"   Features shape: {X.shape}")
    print(f"   Target distribution: Low={sum(y==0)}, Medium={sum(y==1)}, High={sum(y==2)}")

    return X, y


# ── Step 4: Train Model ──

def train_model(X: pd.DataFrame, y: pd.Series) -> tuple:
    """Train XGBoost classifier and evaluate."""

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    model = XGBClassifier(
        objective="multi:softprob",
        num_class=3,
        n_estimators=150,
        max_depth=6,
        learning_rate=0.1,
        random_state=42,
        eval_metric="mlogloss",
        use_label_encoder=False
    )

    model.fit(X_train, y_train)

    # Evaluate
    y_pred = model.predict(X_test)
    accuracy = accuracy_score(y_test, y_pred)

    print(f"\n🎯 Model Accuracy: {accuracy:.4f}")
    print("\n📋 Classification Report:")
    print(classification_report(y_test, y_pred,
                                target_names=["Low", "Medium", "High"]))

    # Feature importance
    importance = dict(zip(X.columns.tolist(),
                         [float(v) for v in model.feature_importances_]))
    print("📊 Feature Importance:")
    for feat, imp in sorted(importance.items(), key=lambda x: x[1], reverse=True):
        print(f"   {feat}: {imp:.4f}")

    return model, accuracy, importance, X_train


# ── Step 5: Save Model & Metadata ──

def save_model(model, accuracy, importance, X_train):
    """Save trained model and metadata."""
    joblib.dump(model, MODEL_PATH)
    print(f"\n💾 Model saved: {MODEL_PATH}")

    metadata = {
        "model_version": "accident_risk_v1.0",
        "accuracy": accuracy,
        "n_classes": 3,
        "class_mapping": {"0": "Low", "1": "Medium", "2": "High"},
        "features": list(X_train.columns),
        "feature_means": X_train.mean().to_dict(),
        "feature_stds": X_train.std().to_dict(),
        "timestamp": datetime.utcnow().isoformat(),
        "feature_importance": importance
    }

    with open(METADATA_PATH, "w") as f:
        json.dump(metadata, f, indent=4)
    print(f"📄 Metadata saved: {METADATA_PATH}")


# ── Main Pipeline ──

def main():
    print("=" * 60)
    print("🚀 ACCIDENT RISK PREDICTION — ML TRAINING PIPELINE")
    print("=" * 60)

    # Step 1: Load
    print("\n📦 STEP 1: LOADING DATA")
    df_accidents = load_accidents()

    # Step 2: Preprocess
    print("\n🧹 STEP 2: PREPROCESSING")
    df = preprocess_accidents(df_accidents)

    # Step 3: Feature engineering
    print("\n⚙️ STEP 3: FEATURE ENGINEERING")
    df = compute_accident_history(df)
    X, y = build_features(df)

    # Step 4: Train
    print("\n🧠 STEP 4: TRAINING XGBOOST MODEL")
    model, accuracy, importance, X_train = train_model(X, y)

    # Step 5: Save
    print("\n💾 STEP 5: SAVING MODEL")
    save_model(model, accuracy, importance, X_train)

    print("\n✅ Pipeline completed successfully!")
    print("=" * 60)


if __name__ == "__main__":
    main()
