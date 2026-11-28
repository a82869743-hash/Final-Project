/**
 * Aegis Tactical — API client
 * Centralizes all backend communication.
 */

const IS_PROD = process.env.NODE_ENV === "production";
const RENDER_BACKEND = "https://final-project-qly6.onrender.com";
const RENDER_WS = "wss://final-project-qly6.onrender.com";

// NEXT_PUBLIC_API_URL (e.g. https://my-backend.onrender.com) overrides the defaults
const ENV_BACKEND = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
const BACKEND = ENV_BACKEND || (IS_PROD ? RENDER_BACKEND : "http://127.0.0.1:8000");
export const API_BASE = `${BACKEND}/api`;
export const WS_BASE = ENV_BACKEND
  ? `${ENV_BACKEND.replace(/^http/, "ws")}/ws`
  : IS_PROD ? `${RENDER_WS}/ws` : "ws://127.0.0.1:8000/ws";

/** Loosely-typed backend payloads (shape varies by mode; narrowed at the call site). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

// ── Types matching backend schemas ──

export interface DashboardStats {
  active_ambulances: number;
  avg_response_time: number;
  incidents_today: number;
  critical_alerts: number;
}

export interface Alert {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  location: string;
  time: string;
}

export interface Vehicle {
  id: string;
  name: string;
  lat: number;
  lng: number;
  status: "available" | "en_route" | "on_scene" | "critical" | "offline";
  speed: number;
  heading: number;
  driver: string;
  destination: string;
}

export interface PredictionRequest {
  hour: number;
  day_of_week: number;
  zone_id: number;
  temperature: number;
  humidity: number;
  traffic_index: number;
  population_density: number;
  historical_incidents: number;
}

export interface RiskFactor {
  factor: string;
  value: string;
  detail: string;
  impact: "up" | "down" | "neutral";
}

export interface PredictionResponse {
  risk_score: number;
  risk_level: "low" | "medium" | "high" | "critical";
  confidence: number;
  recommended_ambulances: number;
  model_version?: string;
  warning?: string;
  percentile?: number | null;
  nearest_city?: string | null;
  p_fatal_or_serious?: number | null;
  factors?: RiskFactor[];
}

export interface AnalysisResponse {
  transcription: string;
  category: string;
  confidence: number;
  severity: "critical" | "warning" | "info";
  keywords: string[];
  error?: string;
}

export interface DispatchRequest {
  vehicle_id: string;
  incident_location: string;
  incident_lat: number;
  incident_lng: number;
  priority: "critical" | "high" | "normal";
}

export interface DispatchResponse {
  success: boolean;
  message: string;
  vehicle_id: string;
  estimated_arrival: string;
}

export interface SubsystemStatus {
  status: "online" | "offline" | "degraded";
  latency: string;
  /** Optional services don't count against overall system health */
  optional?: boolean;
}

export interface HealthStatus {
  fastapi: SubsystemStatus;
  ml_model: SubsystemStatus;
  supabase: SubsystemStatus;
  whisper: SubsystemStatus;
  weather?: SubsystemStatus;
}

export interface AnalyticsStats {
  total_dispatches: number;
  avg_eta: number | string;
  active_vehicles: number;
  high_risk_zones: number;
  recent_dispatches?: Loose[];
}

export interface AccidentRiskRequest {
  latitude: number;
  longitude: number;
  traffic_density?: number;
  time?: string;
  weather?: number;        // 0 clear, 1 rain, 2 fog, 3 storm/hail
  speed_kmh?: number;
  highway?: boolean;
  vehicles?: number;
  casualties?: number;
  pedestrian?: boolean;
}

export interface AccidentRiskResponse {
  risk_level: "Low" | "Medium" | "High";
  risk_score: number;
  percentile: number;
  confidence: number;
  color: string;
  p_fatal_or_serious: number;
  expected_deaths_per_hour: number;
  nearest_city: string;
  distance_km: number;
  in_coverage: boolean;
  factors: RiskFactor[];
  features_used: Record<string, unknown>;
}

export interface RiskZone {
  lat: number;
  lng: number;
  risk_level: "Low" | "Medium" | "High";
  color: string;
  accident_count: number;
  radius: number;
  deaths?: number | null;
  fatality_rate?: number | null;
  risk_index?: number;
  area?: string;
  state?: string;
  source?: string;
}

// ── Hospitals ──

export type CapacityStatus = "normal" | "moderate" | "high" | "critical";

export interface WardStatus {
  label: string;
  capacity: number;
  occupied: number;
  available: number;
  occupancy_pct: number;
  status: CapacityStatus;
  critical_care: boolean;
}

export interface Hospital {
  id: string;
  name: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  type: "Government" | "Private";
  total_beds: number;
  trauma_level: number;
  wards: Record<string, WardStatus>;
  occupied_beds: number;
  capacity_beds: number;
  available_beds: number;
  occupancy_pct: number;
  critical_beds_available: number;
  status: CapacityStatus;
  accepting_critical: boolean;
  oxygen_pct: number;
  blood_units: number;
  doctors_on_duty: number;
  er_wait_min: number;
  admissions_hr: number;
  discharges_hr: number;
  incoming_ambulances: number;
  history?: { t: string; occupancy: number; icu: number }[];
}

export interface HospitalSummary {
  timestamp: string;
  total_hospitals: number;
  total_beds: number;
  occupied_beds: number;
  available_beds: number;
  occupancy_pct: number;
  icu_available: number;
  ventilators_available: number;
  critical_beds_available: number;
  hospitals_on_diversion: number;
  incoming_ambulances: number;
  wards: Record<string, Omit<WardStatus, "critical_care"> & { critical_care: boolean }>;
  cities: { city: string; hospitals: number; capacity: number; occupied: number; icu_available: number; occupancy_pct: number }[];
  trend: { t: string; occupancy: number }[];
  data_mode: string;
}

export interface HospitalAlert {
  severity: "critical" | "warning";
  hospital: string;
  city: string;
  message: string;
}

export interface HospitalRecommendation {
  id: string;
  name: string;
  city: string;
  lat: number;
  lng: number;
  distance_km: number;
  eta_min: number;
  need: string;
  ward_available: number;
  er_wait_min: number;
  accepting_critical: boolean;
  score: number;
}

export interface EmergencyRequest {
  latitude: number;
  longitude: number;
}

export interface EmergencyResponse {
  nearest_ambulance: Loose;
  nearest_hospital: Loose;
  all_nearby_ambulances: Loose[];
  all_nearby_hospitals: Loose[];
  incident_location: { latitude: number; longitude: number };
}

export interface VoiceIntentResponse {
  transcription: string;
  is_mock: boolean;
  whisper_error?: string;
  intent: {
    intent: string;
    confidence: number;
    action: string;
    description: string;
    priority: string;
    matched_keywords: string[];
    extracted_location: { name: string; latitude: number; longitude: number } | null;
  };
  action_result: {
    type: string;
    message: string;
    data: Loose;
  };
  pipeline: string;
}


// ── Live conditions, demand forecasting & fleet planning ──

export interface CityWeather {
  lat: number;
  lng: number;
  live: boolean;
  temperature_c: number | null;
  weather_code: number | null;
  description: string;
  weather_class: number;      // 0 clear, 1 rain, 2 fog, 3 storm/hail
  weather_label: string;
  visibility_m: number | null;
  precipitation_mm: number | null;
  wind_kmh: number | null;
}

export interface NearestWeather extends Partial<CityWeather> {
  city: string;
  distance_km: number;
}

export interface CityRiskNow {
  city: string;
  state: string;
  lat: number;
  lng: number;
  risk_level: "Low" | "Medium" | "High";
  percentile: number;
  expected_deaths_per_hour: number;
  expected_accidents_next_hour: number;
  weather_class: number;
  weather_label: string;
  temperature_c: number | null;
  description: string | null;
}

export interface RiskNowResponse {
  generated_at: string;
  hour_ist: number;
  weather_live: boolean;
  weather_source: string;
  counts: { High: number; Medium: number; Low: number };
  cities: CityRiskNow[];
}

export interface DemandHour {
  time: string;
  hour: string;
  slot?: string;
  expected_accidents: number;
  expected_deaths?: number;
  weather_class?: number;
  weather_multiplier?: number;
}

export interface CityForecast {
  city: string;
  state: string;
  lat: number;
  lng: number;
  hours: DemandHour[];
  total_expected_accidents: number;
  total_expected_deaths: number;
  peak_hour: string;
  fatality_rate_2022: number;
  accidents_2023: number;
  month_share: number[];
  month_counts_2023: number[];
  slot_share: number[];
  slot_source: string;
  weather_live: boolean;
  weather_now: CityWeather | null;
}

export interface FleetMove {
  from: string;
  to: string;
  units: number;
  unit_ids: string[];
  distance_km: number;
  drive_min: number;
}

export interface FleetPlanCity {
  city: string;
  state: string;
  lat: number;
  lng: number;
  expected_accidents: number;
  expected_deaths: number;
  demand_share: number;
  current_units: number;
  target_units: number;
  delta: number;
  after_units: number;
  unmet: number;
  accidents_per_unit: number | null;
}

export interface FleetPlan {
  generated_at: string;
  horizon_hours: number;
  fleet: { total: number; deployable: number; busy: number; offline: number; outside_coverage: number };
  expected_accidents_total: number;
  expected_deaths_total: number;
  coverage_now: number;
  coverage_after: number;
  moves: FleetMove[];
  units_to_move: number;
  unmet_units: number;
  unmet_cities: string[];
  max_reposition_km: number;
  cities: FleetPlanCity[];
  weather: { live: boolean; source: string; adverse_cities: string[] };
  method: string;
}

export interface ShrinkageMetrics {
  label: string;
  validation: string;
  best_k: number;
  perplexity_raw_profile: number;
  perplexity_shrunk_profile: number;
  perplexity_prior_only: number | null;
  improvement_vs_raw_pct: number;
  deployed: boolean;
}

export interface DemandModelCard {
  model_version: string;
  formula: string;
  sources: string[];
  slots: string[];
  months: string[];
  national_month_share_2023: number[];
  national_slot_share_2018: number[];
  shrinkage: { month: ShrinkageMetrics; slot: ShrinkageMetrics };
  total_accidents_2023: number;
  cities_covered: number;
}

// ── Fetch helpers with timeout ──

const FETCH_TIMEOUT = 10000; // 10 seconds timeout for snappy UI

async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeout?: number } = {},
): Promise<Response> {
  const { timeout = FETCH_TIMEOUT, ...fetchOptions } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...fetchOptions, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

async function get<T>(path: string, options: RequestInit & { timeout?: number } = {}): Promise<T> {
  const res = await fetchWithTimeout(`${API_BASE}${path}`, {
    cache: "no-store",
    ...options,
  });
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
  return res.json();
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetchWithTimeout(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
  return res.json();
}

async function postForm<T>(path: string, formData: FormData, timeout = FETCH_TIMEOUT): Promise<T> {
  const res = await fetchWithTimeout(`${API_BASE}${path}`, {
    method: "POST",
    body: formData,
    timeout,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
  return res.json();
}

// ── API functions ──

export const api = {
  getDashboard: () => get<DashboardStats>("/dashboard"),
  getAlerts: () => get<Alert[]>("/alerts"),
  getVehicles: () => get<Vehicle[]>("/vehicles"),
  getAnalytics: () => get<AnalyticsStats>("/analytics"),
  async predict(body: Record<string, unknown>): Promise<PredictionResponse> {
    return post<PredictionResponse>("/predict", body);
  },
  
  async transcribe(fileOrBlob: Blob | File): Promise<{ text?: string; error?: string }> {
    const formData = new FormData();
    formData.append("file", fileOrBlob, "audio.wav");
    return postForm<{ text?: string; error?: string }>("/transcribe", formData);
  },

  async analyze(file: File): Promise<AnalysisResponse> {
    const fd = new FormData();
    fd.append("file", file);
    return postForm<AnalysisResponse>("/analyze", fd);
  },

  async analyzeTextBasic(text: string): Promise<AnalysisResponse> {
    return post<AnalysisResponse>("/analyze-text-basic", { text });
  },

  async streamTranscribe(audioBlob: Blob): Promise<{ partial_text?: string; status?: string; error?: string }> {
    const fd = new FormData();
    fd.append("file", audioBlob, "chunk.webm");
    return postForm<{ partial_text?: string; status?: string; error?: string }>("/stream-transcribe", fd);
  },

  async analyzeFull(fileOrBlob: Blob | File): Promise<Loose> {
    const fd = new FormData();
    fd.append("file", fileOrBlob, "audio.webm");
    return postForm<Loose>("/analyze-full", fd);
  },

  dispatch: (data: DispatchRequest) =>
    post<DispatchResponse>("/dispatch", data),
  health: () => get<HealthStatus>("/health"),

  // ── New: Smart Traffic & Accident Prediction APIs ──
  predictRisk: (body: AccidentRiskRequest) =>
    post<AccidentRiskResponse>("/predict-risk", body),
  getRiskZones: () => get<{ zones: RiskZone[]; total: number }>("/risk-zones"),
  getRiskModel: () => get<Record<string, unknown>>("/risk-model"),

  // ── Live conditions, demand forecast & fleet pre-positioning ──
  getRiskNow: () => get<RiskNowResponse>("/risk-now", { timeout: 20000 }),
  getWeatherNearest: (lat: number, lng: number) =>
    get<NearestWeather>(`/weather/nearest?lat=${lat}&lng=${lng}`, { timeout: 20000 }),
  getCityForecast: (city: string, hours = 24) =>
    get<CityForecast>(`/demand/forecast?city=${encodeURIComponent(city)}&hours=${hours}`, { timeout: 20000 }),
  getNationalDemand: () => get<{ generated_at: string; hours: DemandHour[] }>("/demand/national"),
  getDemandModel: () => get<DemandModelCard>("/demand/model"),
  getFleetPlan: (horizon = 6) => get<FleetPlan>(`/fleet/plan?horizon=${horizon}`, { timeout: 20000 }),
  applyFleetPlan: (horizon = 6) =>
    post<{ applied: number; relocations: { vehicle_id: string; from: string; to: string; drive_min: number }[];
      coverage_before: number; coverage_after: number }>(`/fleet/apply?horizon=${horizon}`, {}),

  // ── Live hospital monitoring ──
  getHospitals: (city?: string) =>
    get<{ hospitals: Hospital[]; total: number }>(`/hospitals${city ? `?city=${encodeURIComponent(city)}` : ""}`),
  getHospitalSummary: () => get<HospitalSummary>("/hospitals/summary"),
  getHospitalAlerts: (limit = 25) => get<{ alerts: HospitalAlert[] }>(`/hospitals/alerts?limit=${limit}`),
  getHospital: (id: string) => get<Hospital>(`/hospitals/${encodeURIComponent(id)}`),
  recommendHospitals: (lat: number, lng: number, need = "icu", topN = 5) =>
    get<{ recommendations: HospitalRecommendation[] }>(`/hospitals/recommend?lat=${lat}&lng=${lng}&need=${need}&top_n=${topN}`),
  geocode: (q: string) =>
    get<{ query: string; latitude: number; longitude: number }>(`/geocode?q=${encodeURIComponent(q)}`, { timeout: 12000 }),
  emergency: (body: EmergencyRequest) =>
    post<EmergencyResponse>("/emergency", body),

  async voiceToText(fileOrBlob: Blob | File): Promise<Loose> {
    const fd = new FormData();
    fd.append("file", fileOrBlob, "audio.webm");
    return postForm<Loose>("/voice-to-text", fd);
  },

  async voiceIntent(fileOrBlob: Blob | File): Promise<VoiceIntentResponse> {
    const fd = new FormData();
    fd.append("file", fileOrBlob, "audio.webm");
    return postForm<VoiceIntentResponse>("/voice-intent", fd);
  },

  async liveVoice(audioBlob: Blob): Promise<Loose> {
    const fd = new FormData();
    fd.append("file", audioBlob, "live_chunk.webm");
    return postForm<Loose>("/live-voice", fd);
  },

  /** Send pre-transcribed text (from browser Speech API) for intent detection */
  textIntent: (text: string, latitude?: number, longitude?: number) =>
    post<VoiceIntentResponse>("/text-intent", { text, latitude, longitude }),

  ping: async (): Promise<{ ok: boolean; latency: number }> => {
    const start = Date.now();
    try {
      const res = await fetchWithTimeout(
        API_BASE.replace("/api", "/"),
        { cache: "no-store" }
      );
      return { ok: res.ok, latency: Date.now() - start };
    } catch {
      return { ok: false, latency: Date.now() - start };
    }
  },
};

// ── WebSocket with resilient reconnection ──

let _wsInstance: WebSocket | null = null;
let _wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let _wsReconnectDelay = 3000; // starts at 3s, backs off to 30s max
let _wsReconnectAttempts = 0;
let _wsDisconnected = false; // tracks intentional disconnect
let _wsFallbackTimer: ReturnType<typeof setInterval> | null = null;

export function connectVehicleWS(
  onMessage: (vehicles: Vehicle[]) => void,
  onError?: (err: Event) => void,
  onStateChange?: (state: "CONNECTING" | "RECONNECTING" | "CONNECTED" | "FAILED" | "POLLING") => void
): void {
  // Clean up Loose existing connection
  if (_wsInstance) {
    _wsInstance.onclose = null;
    _wsInstance.close();
    _wsInstance = null;
  }
  if (_wsReconnectTimer) {
    clearTimeout(_wsReconnectTimer);
    _wsReconnectTimer = null;
  }

  _wsDisconnected = false;

  if (_wsReconnectAttempts === 0) {
    onStateChange?.("CONNECTING");
  } else if (_wsReconnectAttempts >= 3) {
    onStateChange?.("POLLING");
    if (!_wsFallbackTimer) {
      _wsFallbackTimer = setInterval(async () => {
        try {
          const vehicles = await api.getVehicles();
          onMessage(vehicles);
        } catch {}
      }, 10000);
    }
  } else {
    onStateChange?.("RECONNECTING");
  }

  // Pre-check: only attempt WS if the backend is reachable
  fetch(API_BASE.replace("/api", "/"), { mode: "no-cors" })
    .then(() => {
      if (_wsDisconnected) return; // user navigated away
      _createWS(onMessage, onError, onStateChange);
    })
    .catch(() => {
      // Backend unreachable — retry silently after delay
      if (!_wsDisconnected) {
        _wsReconnectAttempts++;
        if (_wsReconnectAttempts === 3) onStateChange?.("FAILED");
        _wsReconnectTimer = setTimeout(() => {
          _wsReconnectTimer = null;
          connectVehicleWS(onMessage, onError, onStateChange);
        }, _wsReconnectDelay);
        _wsReconnectDelay = Math.min(_wsReconnectDelay * 1.5, 30000);
      }
      onError?.(new Event("backend-offline"));
    });
}

let _wsPingTimer: ReturnType<typeof setInterval> | null = null;

function _createWS(
  onMessage: (vehicles: Vehicle[]) => void,
  onError?: (err: Event) => void,
  onStateChange?: (state: "CONNECTING" | "RECONNECTING" | "CONNECTED" | "FAILED" | "POLLING") => void
) {
  const ws = new WebSocket(WS_BASE);
  _wsInstance = ws;

  ws.onopen = () => {
    _wsReconnectDelay = 3000; // reset backoff on success
    _wsReconnectAttempts = 0;
    onStateChange?.("CONNECTED");
    if (_wsFallbackTimer) {
      clearInterval(_wsFallbackTimer);
      _wsFallbackTimer = null;
    }
    // Send ping every 30 seconds to keep Render connection alive
    if (_wsPingTimer) clearInterval(_wsPingTimer);
    _wsPingTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send("ping");
      }
    }, 30000);
  };

  ws.onmessage = (event) => {
    try {
      if (event.data === '{"type":"pong"}') return;
      const vehicles: Vehicle[] = JSON.parse(event.data);
      onMessage(vehicles);
    } catch {
      // silently ignore malformed messages
    }
  };

  ws.onerror = () => {
    // Intentionally no console.error — prevents Next.js dev overlay from catching it
    onError?.(new Event("ws-error"));
  };

  ws.onclose = () => {
    _wsInstance = null;
    if (_wsPingTimer) {
      clearInterval(_wsPingTimer);
      _wsPingTimer = null;
    }
    if (!_wsDisconnected) {
      _wsReconnectAttempts++;
      if (_wsReconnectAttempts === 3) onStateChange?.("FAILED");
      _wsReconnectTimer = setTimeout(() => {
        _wsReconnectTimer = null;
        connectVehicleWS(onMessage, onError, onStateChange);
      }, _wsReconnectDelay);
      _wsReconnectDelay = Math.min(_wsReconnectDelay * 1.5, 30000);
    }
  };
}

export function disconnectVehicleWS() {
  _wsDisconnected = true;
  if (_wsReconnectTimer) {
    clearTimeout(_wsReconnectTimer);
    _wsReconnectTimer = null;
  }
  if (_wsFallbackTimer) {
    clearInterval(_wsFallbackTimer);
    _wsFallbackTimer = null;
  }
  if (_wsInstance) {
    _wsInstance.onclose = null;
    _wsInstance.close();
    _wsInstance = null;
  }
}

// ════════════════════════════════════════════════════════════════
// VIDEO INTELLIGENCE MODULE — New types & API functions
// Does NOT modify Loose existing type or function above.
// ════════════════════════════════════════════════════════════════

export interface VideoAnalysisResponse {
  id: string;
  event_type: string;
  severity: string;
  confidence: number;
  objects_detected: string[];
  vehicle_count: number;
  people_count: number;
  timestamp: string;
  latitude: number;
  longitude: number;
  video_source: string;
  frames_analyzed: number;
  processing_time_seconds: number;
  detection_method: string;
  scene_label: string;
  error?: string;
  // Enhanced accident analysis fields
  accident_type?: string;
  accident_description?: string;
  severity_score?: number;
  vehicle_types?: Record<string, number>;
  vehicle_breakdown?: string;
  overlap_ratio?: number;
  accident_frames?: number;
  accident_frame_ratio?: number;
  video_metadata?: { width: number; height: number; fps: number; duration_sec: number; total_frames: number };
  // Location intelligence
  action_recommendation?: string;
  alert_status?: string;
  location?: string;
  location_confidence?: string;
  location_method?: string;
  source_camera?: string;
  demo_mode?: boolean;
}

export interface VideoEvent {
  id: string;
  timestamp: string;
  event_type: string;
  severity: string;
  confidence: number;
  objects_detected: string[];
  latitude: number;
  longitude: number;
  video_source: string;
  created_at: string;
}

export interface VideoAlert {
  type: "VIDEO_ALERT";
  location: string;
  severity: string;
  event: string;
  confidence: number;
  timestamp: string;
}

export interface VideoAIStatus {
  status: string;
  feature_flag: boolean;
  demo_mode?: boolean;
  opencv_available: boolean;
  yolo_available: boolean;
  frame_interval: number;
  confidence_threshold: number;
  alert_threshold: number;
  detector?: string;
  capabilities?: string[];
}

// Video Intelligence API
export const videoApi = {
  async analyzeVideo(
    file: File,
    opts: { latitude?: number; longitude?: number; videoSource?: string; frameInterval?: number; asyncMode?: boolean } = {}
  ): Promise<VideoAnalysisResponse> {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("latitude", String(opts.latitude ?? 0));
    fd.append("longitude", String(opts.longitude ?? 0));
    fd.append("video_source", opts.videoSource ?? "upload");
    fd.append("frame_interval", String(opts.frameInterval ?? 5));
    fd.append("async_mode", String(opts.asyncMode ?? false));
    // Video analysis can take minutes on CPU — the default 10s timeout aborted it
    const res = await fetchWithTimeout(`${API_BASE}/video/analyze`, { method: "POST", body: fd, timeout: 300000 });
    if (!res.ok) {
      let detail = `${res.status} ${res.statusText}`;
      try { detail = (await res.json()).detail ?? detail; } catch { /* not JSON */ }
      throw new Error(detail);
    }
    return res.json();
  },

  getEvents: (limit = 50) =>
    get<{ events: VideoEvent[]; total: number }>(`/video/events?limit=${limit}`),

  getStatus: () => get<VideoAIStatus>("/video/status"),
};

// ── Video Alert WebSocket ──

const WS_VIDEO_BASE = `${WS_BASE}/video`;

let _videoWsInstance: WebSocket | null = null;
let _videoWsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let _videoWsDisconnected = false;
let _videoWsReconnectDelay = 3000;
let _videoWsPingTimer: ReturnType<typeof setInterval> | null = null;

export function connectVideoAlertWS(
  onAlert: (alert: VideoAlert) => void,
  onError?: (err: Event) => void
): void {
  if (_videoWsInstance) {
    _videoWsInstance.onclose = null;
    _videoWsInstance.close();
    _videoWsInstance = null;
  }
  if (_videoWsReconnectTimer) {
    clearTimeout(_videoWsReconnectTimer);
    _videoWsReconnectTimer = null;
  }
  if (_videoWsPingTimer) {
    clearInterval(_videoWsPingTimer);
    _videoWsPingTimer = null;
  }
  _videoWsDisconnected = false;

  try {
    const ws = new WebSocket(WS_VIDEO_BASE);
    _videoWsInstance = ws;

    ws.onopen = () => {
      _videoWsReconnectDelay = 3000;
      // Send ping every 30 seconds to keep Render connection alive
      _videoWsPingTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send("ping");
        }
      }, 30000);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "VIDEO_ALERT") {
          onAlert(data as VideoAlert);
        }
      } catch { /* ignore malformed */ }
    };

    ws.onerror = () => onError?.(new Event("video-ws-error"));

    ws.onclose = () => {
      _videoWsInstance = null;
      if (_videoWsPingTimer) {
        clearInterval(_videoWsPingTimer);
        _videoWsPingTimer = null;
      }
      if (!_videoWsDisconnected) {
        _videoWsReconnectTimer = setTimeout(() => {
          _videoWsReconnectTimer = null;
          connectVideoAlertWS(onAlert, onError);
        }, _videoWsReconnectDelay);
        _videoWsReconnectDelay = Math.min(_videoWsReconnectDelay * 1.5, 30000);
      }
    };
  } catch {
    onError?.(new Event("video-ws-failed"));
  }
}

export function disconnectVideoAlertWS() {
  _videoWsDisconnected = true;
  if (_videoWsReconnectTimer) {
    clearTimeout(_videoWsReconnectTimer);
    _videoWsReconnectTimer = null;
  }
  if (_videoWsInstance) {
    _videoWsInstance.onclose = null;
    _videoWsInstance.close();
    _videoWsInstance = null;
  }
}
