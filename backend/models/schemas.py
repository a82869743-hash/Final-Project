"""Pydantic models for API request/response shapes."""

from pydantic import BaseModel
from typing import Literal, Optional


class DashboardStats(BaseModel):
    active_ambulances: int
    avg_response_time: float
    incidents_today: int
    critical_alerts: int


class Alert(BaseModel):
    id: str
    severity: Literal["critical", "warning", "info"]
    title: str
    location: str
    time: str


class Vehicle(BaseModel):
    id: str
    name: str
    lat: float
    lng: float
    status: Literal["available", "en_route", "on_scene", "critical", "offline"]
    speed: float = 0.0
    heading: float = 0.0
    driver: str = ""
    destination: str = ""


class PredictionRequest(BaseModel):
    hour: int
    day_of_week: int = 0
    zone_id: int = 1
    temperature: float = 28.0
    humidity: float = 60.0
    traffic_index: float = 0.5
    population_density: float = 1.0
    historical_incidents: int = 0
    # Real-data engine inputs (default: Delhi, clear weather)
    latitude: float = 28.6139
    longitude: float = 77.2090
    weather: int = 0               # 0 clear, 1 rain, 2 fog, 3 storm/hail


class PredictionResponse(BaseModel):
    risk_score: float
    risk_level: Literal["low", "medium", "high", "critical"]
    confidence: float
    recommended_ambulances: int
    model_version: str = "v2.0"
    drift_detected: bool = False
    drift_features: list[str] = []
    warning: str = ""
    percentile: float | None = None
    nearest_city: str | None = None
    p_fatal_or_serious: float | None = None
    factors: list[dict] = []


class AnalysisResponse(BaseModel):
    transcription: str
    category: str
    confidence: float
    severity: Literal["critical", "warning", "info"]
    keywords: list[str]
    error: Optional[str] = None


class DispatchRequest(BaseModel):
    vehicle_id: str
    incident_location: str
    incident_lat: float
    incident_lng: float
    priority: Literal["critical", "high", "normal"]


class DispatchResponse(BaseModel):
    success: bool
    message: str
    vehicle_id: str
    estimated_arrival: str
