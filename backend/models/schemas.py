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
    day_of_week: int
    zone_id: int
    temperature: float
    humidity: float
    traffic_index: float
    population_density: float
    historical_incidents: int


class PredictionResponse(BaseModel):
    risk_score: float
    risk_level: Literal["low", "medium", "high", "critical"]
    confidence: float
    recommended_ambulances: int
    model_version: str = "v2.0"
    drift_detected: bool = False
    drift_features: list[str] = []
    warning: str = ""


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
