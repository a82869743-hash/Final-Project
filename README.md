# Aegis Tactical: AI Emergency Dispatch Command Center

An emergency-dispatch command center for Indian cities. It combines live ambulance tracking,
hospital bed monitoring, voice and video incident intake, and an accident-risk engine
trained on **real government road-accident data**.

- **Frontend:** Next.js 16 · React 19 · Tailwind 4 · Leaflet (key-free HD basemaps) · Recharts. Deployed on Vercel
- **Backend:** FastAPI · XGBoost · OpenCV / YOLOv8 · Whisper (optional). Deployed on Render
- **Database:** Supabase, with automatic **local SQLite fallback** when Supabase isn't configured

## Pages

| Page | What it does |
|---|---|
| **Dashboard** | Live fleet, alerts, real-data risk forecast per city, national risk map |
| **Dispatch** | Assign an ambulance; the typed location is geocoded and ETA comes from real distance |
| **Tracking** | Live ambulance positions over WebSocket |
| **Hospitals** *(new)* | Live bed occupancy by ward (ICU, ventilators, HDU, trauma, general, pediatric, maternity, isolation, burns), oxygen, blood bank, ER wait, diversion status, capacity alerts, and a "best hospital for this patient" ranking |
| **Risk AI** *(new)* | Interactive accident-risk predictor: city, hour, weather, road type, speed, vehicles, casualties. Explains every factor and includes the model card |
| **Analytics** | Real MoRTH/NCRB statistics for 53 cities: time-of-day and month patterns, deaths, YoY change, weather fatality, causes, 24-hour forecast, dispatch log |
| **Analyzer** | Upload a call recording for transcription and severity |
| **Voice Command** | Speak (English-India / Hindi), type, or upload a call. Intent and location are detected, the nearest ambulance is auto-dispatched, and hospitals are ranked by live beds |
| **Video Intel** | Upload CCTV/dashcam clips for vehicle/person detection, accident classification, geotagging and one-click dispatch |

## Data & models

See **[DATASETS.md](DATASETS.md)** for sources, the full data dictionary and honest model metrics.

- Severity model: XGBoost on **104,258 real police-reported collisions** (UK DfT STATS19 2023), ROC-AUC 0.647, 1.75× lift in the top decile
- Indian risk: MoRTH 2022 city accidents and deaths, MoRTH 2020 city time-of-day profiles, MoRTH 2018 weather fatality ratios, NCRB ADSI
- Master dataset: `backend/ml/india_road_accident_master.csv` (53 cities × 43 attributes)

## Run locally

Backend (Python 3.11):

```bash
cd backend
```

```bash
pip install -r requirements.txt
```

```bash
uvicorn main:app --reload --port 8000
```

Frontend:

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:3000. To rebuild the datasets and models from the raw government tables:

```bash
cd backend && python ml/real_pipeline.py
```

## Configuration

| Variable | Where | Default | Purpose |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | frontend | Render URL in prod, `http://127.0.0.1:8000` in dev | Backend base URL |
| `SUPABASE_URL`, `SUPABASE_KEY` | backend | unset → local SQLite | Database |
| `LOCAL_DB_PATH` | backend | `backend/data/aegis_local.db` | SQLite file location |
| `OPENAI_API_KEY` | backend | unset | Whisper transcription of uploaded audio (live voice uses the browser instead) |
| `ENABLE_VIDEO_AI` | backend | `false` | Load the YOLOv8 model (needs ~1 GB RAM). When off, video uses the OpenCV detector |
| `VIDEO_YOLO_MODEL` | backend | `yolov8n.pt` | YOLO weights |
| `VIDEO_DEMO_MODE` | backend | `false` | Allow labelled demo reports if real video analysis fails |

## What is simulated

There are no public live feeds for these, so they are simulations built on real anchors, and the UI labels them:
ambulance GPS (units are based at real hospitals), live hospital bed occupancy (real hospitals and bed
totals), and the live incident alert stream (weighted by real city accident counts).
