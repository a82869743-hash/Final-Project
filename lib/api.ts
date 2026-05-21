/**
 * Aegis Tactical — API client
 * Centralizes all backend communication.
 * Uses 127.0.0.1 to avoid DNS resolution issues.
 */

const RENDER_BACKEND = "https://final-project-qly6.onrender.com";

const API_BASE = "http://127.0.0.1:8000/api";
const WS_BASE = "ws://127.0.0.1:8000/ws";

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

export interface PredictionResponse {
  risk_score: number;
  risk_level: "low" | "medium" | "high" | "critical";
  confidence: number;
  recommended_ambulances: number;
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
}

export interface HealthStatus {
  fastapi: SubsystemStatus;
  ml_model: SubsystemStatus;
  supabase: SubsystemStatus;
  whisper: SubsystemStatus;
}

export interface AnalyticsStats {
  total_dispatches: number;
  avg_eta: number | string;
  active_vehicles: number;
  high_risk_zones: number;
  recent_dispatches?: any[];
}

export interface AccidentRiskRequest {
  latitude: number;
  longitude: number;
  traffic_density?: number;
  time?: string;
}

export interface AccidentRiskResponse {
  risk_level: "Low" | "Medium" | "High";
  risk_score: number;
  confidence: number;
  color: string;
  features_used: Record<string, number>;
}

export interface RiskZone {
  lat: number;
  lng: number;
  risk_level: "Low" | "Medium" | "High";
  color: string;
  accident_count: number;
  radius: number;
}

export interface EmergencyRequest {
  latitude: number;
  longitude: number;
}

export interface EmergencyResponse {
  nearest_ambulance: any;
  nearest_hospital: any;
  all_nearby_ambulances: any[];
  all_nearby_hospitals: any[];
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
    data: any;
  };
  pipeline: string;
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

async function postForm<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetchWithTimeout(`${API_BASE}${path}`, {
    method: "POST",
    body: formData,
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
  async predict(body: any): Promise<PredictionResponse> {
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

  async analyzeFull(fileOrBlob: Blob | File): Promise<any> {
    const fd = new FormData();
    fd.append("file", fileOrBlob, "audio.webm");
    return postForm<any>("/analyze-full", fd);
  },

  dispatch: (data: DispatchRequest) =>
    post<DispatchResponse>("/dispatch", data),
  health: () => get<HealthStatus>("/health"),

  // ── New: Smart Traffic & Accident Prediction APIs ──
  predictRisk: (body: AccidentRiskRequest) =>
    post<AccidentRiskResponse>("/predict-risk", body),
  getRiskZones: () => get<{ zones: RiskZone[]; total: number }>("/risk-zones"),
  emergency: (body: EmergencyRequest) =>
    post<EmergencyResponse>("/emergency", body),

  async voiceToText(fileOrBlob: Blob | File): Promise<any> {
    const fd = new FormData();
    fd.append("file", fileOrBlob, "audio.webm");
    return postForm<any>("/voice-to-text", fd);
  },

  async voiceIntent(fileOrBlob: Blob | File): Promise<VoiceIntentResponse> {
    const fd = new FormData();
    fd.append("file", fileOrBlob, "audio.webm");
    return postForm<VoiceIntentResponse>("/voice-intent", fd);
  },

  async liveVoice(audioBlob: Blob): Promise<any> {
    const fd = new FormData();
    fd.append("file", audioBlob, "live_chunk.webm");
    return postForm<any>("/live-voice", fd);
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
  // Clean up any existing connection
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
// Does NOT modify any existing type or function above.
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
    return postForm<VideoAnalysisResponse>("/video/analyze", fd);
  },

  getEvents: (limit = 50) =>
    get<{ events: VideoEvent[]; total: number }>(`/video/events?limit=${limit}`),

  getStatus: () => get<VideoAIStatus>("/video/status"),
};

// ── Video Alert WebSocket ──

const WS_VIDEO_BASE = "ws://127.0.0.1:8000/ws/video";

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
