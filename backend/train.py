import os
import pandas as pd
import numpy as np
import json
import joblib
import shap
from datetime import datetime
from xgboost import XGBClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report
from sklearn.utils.class_weight import compute_sample_weight
from dotenv import load_dotenv

# Ensure we load env vars since we are accessing Supabase
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))
from db import supabase

def fetch_data():
    """Fetch predictions and dispatch_logs from Supabase"""
    if not supabase:
        raise Exception("Supabase is not configured. Cannot train model on live data.")
        
    print("Fetching predictions...")
    res_pred = supabase.table("predictions").select("*").execute()
    predictions = res_pred.data if res_pred.data else []
    
    print("Fetching dispatch logs...")
    res_disp = supabase.table("dispatch_logs").select("*").execute()
    dispatch_logs = res_disp.data if res_disp.data else []
    
    return pd.DataFrame(predictions), pd.DataFrame(dispatch_logs)

def encode_categorical(df):
    """Encode categorical features manually to keep it simple and lightweight"""
    
    # Encode time_of_day
    time_map = {"morning": 0, "afternoon": 1, "evening": 2, "night": 3, "unknown": 1}
    if "time_of_day" in df.columns:
        df["time_of_day"] = df["time_of_day"].map(time_map).fillna(1)
        
    # Encode day_of_week
    day_map = {"weekday": 0, "weekend": 1, "unknown": 0}
    if "day_of_week" in df.columns:
        df["day_of_week"] = df["day_of_week"].map(day_map).fillna(0)
        
    # Encode weather
    weather_map = {"clear": 0, "rainy": 1, "storm": 2, "unknown": 0}
    if "weather" in df.columns:
        df["weather"] = df["weather"].map(weather_map).fillna(0)
        
    return df

def generate_mock_if_empty(df):
    """If the dataset from Supabase is too small to train on, seed it with synthetic data"""
    if len(df) > 50:
        return df
        
    print("Supabase dataset too small. Generating synthetic base data...")
    n_samples = 200
    mock_data = {
        "risk_score": np.random.uniform(0.1, 1.0, n_samples),
        "lat": np.random.uniform(19.0, 19.2, n_samples),
        "lng": np.random.uniform(72.7, 72.9, n_samples),
        "time_of_day": np.random.choice(["morning", "afternoon", "evening", "night"], n_samples),
        "day_of_week": np.random.choice(["weekday", "weekend"], n_samples),
        "vehicle_density": np.random.randint(2, 10, n_samples),
        "past_incidents": np.random.randint(0, 5, n_samples),
        "weather": np.random.choice(["clear", "rainy"], n_samples)
    }
    return pd.DataFrame(mock_data)

def main():
    print("🚀 STEP 3: PREPARING TRAINING DATASET")
    df_pred, df_disp = fetch_data()
    
    # 🚀 ML UPGRADE: LOAD EXTERNAL CONTINENT DATASETS
    external_df_path = os.path.join(os.path.dirname(__file__), "ml", "final_dataset.csv")
    if os.path.exists(external_df_path):
        df_external = pd.read_csv(external_df_path)
        print(f"Loaded {len(df_external)} records from external dataset.")
        # Normalize external format if needed
        if "is_emergency" in df_external.columns:
            # Map old external data formats back to our risk_score scalar logically
            df_external["risk_score"] = df_external["is_emergency"].apply(lambda e: 0.85 if e == 1 else 0.1)
            
        required_cols = ["lat", "lng", "timestamp", "risk_score", "time_of_day", "day_of_week", "vehicle_density", "past_incidents", "weather"]
        valid_cols = [c for c in required_cols if c in df_external.columns]
        df_external = df_external[valid_cols]
            
        df = pd.concat([df_pred, df_external], ignore_index=True)
        print(f"Merged Datasets. Total size: {len(df)}")
    else:
        df = df_pred
        
    # Seed mock if completely empty locally
    df = generate_mock_if_empty(df)
    
    # Clean: remove nulls
    df.dropna(inplace=True)
    
    print("🚀 STEP 4: FEATURE ENGINEERING")
    df = encode_categorical(df)
    
    # To match the XGBoost input shape from `predict.py` which takes: 
    # [hour, day_of_week, zone_id, temperature, humidity, traffic_index, population_density, historical_incidents]
    # We must construct these exact 8 features from our new rich data (or remap our ML pipeline).
    # Since the request asks to upgrade the pipeline without breaking current API:
    
    # We map our new features backwards slightly to fit the shape, or expand shape.
    # From predict.py: Request contains -> hour, day_of_week, zone_id, temperature, humidity, traffic_index, population_density, historical_incidents
    # But wait, predict.py also does: `features = np.array([[request.hour, request.day_of_week, request.zone_id, request.temperature, request.humidity, request.traffic_index, request.population_density, request.historical_incidents]])`
    # So the model expects exactly 8 columns. We will manufacture those 8 columns from our enriched dataset to ensure no breakage.
    
    # hour <- time_of_day * 6 + 6
    # day_of_week <- day_of_week (0 or 1)
    # zone_id <- derived from lat
    # temperature <- weather derived (clear=30, rainy=22)
    # humidity <- weather derived (clear=40, rainy=85)
    # traffic_index <- vehicle_density / 10.0
    # population_density <- past_incidents
    # historical_incidents <- past_incidents
    
    X = pd.DataFrame()
    X['hour'] = df['time_of_day'] * 6 + 6
    X['day_of_week'] = df['day_of_week']
    X['zone_id'] = (df['lat'] * 100).astype(int) % 10
    X['temperature'] = df['weather'].apply(lambda w: 30.0 if w == 0 else 22.0)
    X['humidity'] = df['weather'].apply(lambda w: 40.0 if w == 0 else 85.0)
    X['traffic_index'] = df['vehicle_density'] / 10.0
    X['population_density'] = df['vehicle_density'] * 100
    X['historical_incidents'] = df['past_incidents']
    
    # Target variable: Multiclass Risk Level (0:low, 1:med, 2:high, 3:critical)
    def map_to_class(score):
        if score >= 0.75: return 3
        elif score >= 0.50: return 2
        elif score >= 0.25: return 1
        return 0
        
    df['risk_level'] = df['risk_score'].apply(map_to_class)
    
    # 🚀 ML UPGRADE: FEEDBACK LOOP LEARNING
    if "actual_response_time" in df.columns:
        # Convert to numeric safely
        df["actual_response_time"] = pd.to_numeric(df["actual_response_time"], errors="coerce").fillna(0)
        df["adjusted_label"] = np.where(df["actual_response_time"] > 10, 2, df["risk_level"])
        y = df['adjusted_label'].astype(int)
    else:
        y = df['risk_level'].astype(int)
    
    print("🚀 STEP 5: TRAIN MODEL")
    
    # 🚀 ML UPGRADE: TIME-BASED SPLIT (Step 8)
    if 'timestamp' in df.columns:
        df = df.sort_values("timestamp")
        
    split_idx = int(len(X) * 0.8)
    X_train, X_test = X.iloc[:split_idx], X.iloc[split_idx:]
    y_train, y_test = y.iloc[:split_idx], y.iloc[split_idx:]
    
    model = XGBClassifier(
        objective="multi:softprob",
        num_class=4,
        n_estimators=100,
        max_depth=5,
        learning_rate=0.1,
        random_state=42,
        eval_metric='mlogloss'
    )
    
    # 🚀 ML UPGRADE: HANDLE CLASS IMBALANCE
    weights = compute_sample_weight(class_weight="balanced", y=y_train)
    
    model.fit(X_train, y_train, sample_weight=weights)
    
    print("🚀 STEP 6: EVALUATION")
    y_pred = model.predict(X_test)
    acc = accuracy_score(y_test, y_pred)
    print(f"Accuracy: {acc:.4f}\n")
    print("Classification Report:")
    print(classification_report(y_test, y_pred))
    
    # 🚀 ML UPGRADE: MODEL VALIDATION GATE (Step 3) 
    metrics_path = os.path.join(os.path.dirname(__file__), "ml_metrics.json")
    previous_accuracy = 0.0
    
    if os.path.exists(metrics_path):
        try:
            with open(metrics_path, "r") as f:
                old_metrics = json.load(f)
                previous_accuracy = old_metrics.get("accuracy", 0.0)
        except Exception:
            pass
            
    print(f"Previous Accuracy: {previous_accuracy:.4f}")
    
    if acc >= previous_accuracy:
        print("✅ Model updated: Performance improved or matching.")
        print("🚀 STEP 7: SAVE MODEL")
        model_path = os.path.join(os.path.dirname(__file__), "model.pkl")
        joblib.dump(model, model_path)
        print(f"Saved: {model_path}")
        
        # 🚀 ML UPGRADE: EXPLAINABILITY AND DRIFT METRICS
        
        # 1. Feature Importances
        feature_importance_dict = dict(zip(X.columns.tolist(), [float(val) for val in model.feature_importances_]))
        top_5 = dict(sorted(feature_importance_dict.items(), key=lambda item: item[1], reverse=True)[:5])
        print("Top 5 Features:", top_5)
        
        # 2. SHAP Explainability Summarization (Background performance safe)
        try:
            X_sample = X_test.sample(min(100, len(X_test)))
            explainer = shap.TreeExplainer(model)
            _ = explainer(X_sample)  # Warmup / compute to ensure shapes are right
            print("SHAP explainer values computed successfully.")
        except Exception as e:
            print("SHAP Computation notice:", e)

        # 3. Save new standardized metrics format
        new_metrics = {
            "model_version": "v2.0",
            "accuracy": acc,
            "dataset_size": len(df),
            "timestamp": datetime.utcnow().isoformat(),
            "feature_means": X_train.mean().to_dict(),
            "feature_importance": feature_importance_dict
        }
        with open(metrics_path, "w") as f:
            json.dump(new_metrics, f, indent=4)
        print("Training metrics saved.")
    else:
        print("❌ Model rejected: Performance degraded compared to prior iteration.")

    print("Pipeline completed successfully!")

if __name__ == "__main__":
    main()
