"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Video,
  Upload,
  AlertTriangle,
  Activity,
  Eye,
  Shield,
  Clock,
  MapPin,
  Flame,
  Car,
  Users,
  Radio,
  CheckCircle,
  XCircle,
  Loader2,
  Camera,
  Navigation,
  Zap,
} from "lucide-react";
import {
  type VideoAnalysisResponse,
  type VideoEvent,
  type VideoAlert,
  type VideoAIStatus,
  videoApi,
  connectVideoAlertWS,
  disconnectVideoAlertWS,
  api,
} from "@/lib/api";

/* Camera locations used to geotag an uploaded clip */
const CAMERA_SITES = [
  { name: "Mumbai — Western Express Hwy", lat: 19.1136, lng: 72.8697 },
  { name: "Delhi — Ring Road, AIIMS", lat: 28.5672, lng: 77.2100 },
  { name: "Bengaluru — Silk Board Jn", lat: 12.9172, lng: 77.6229 },
  { name: "Chennai — Kathipara Jn", lat: 13.0067, lng: 80.2006 },
  { name: "Pune — Mumbai-Pune Expwy", lat: 18.7546, lng: 73.4062 },
  { name: "Ahmedabad — SG Highway", lat: 23.0300, lng: 72.5070 },
  { name: "Vadodara — NH48", lat: 22.3072, lng: 73.1812 },
  { name: "Hyderabad — ORR Gachibowli", lat: 17.4401, lng: 78.3489 },
  { name: "Kolkata — EM Bypass", lat: 22.5390, lng: 88.3950 },
  { name: "Jaipur — NH48 Delhi Rd", lat: 26.9600, lng: 75.8400 },
];
const MAX_MB = 80;
const ALLOWED_EXT = [".mp4", ".avi", ".mov", ".mkv", ".webm", ".m4v"];

const severityColors: Record<string, string> = {
  critical: "var(--color-error)",
  high: "#f59e0b",
  medium: "#eab308",
  low: "var(--color-success)",
};

const severityBg: Record<string, string> = {
  critical: "rgba(239,68,68,0.15)",
  high: "rgba(245,158,11,0.15)",
  medium: "rgba(234,179,8,0.12)",
  low: "rgba(16,185,129,0.12)",
};

const eventIcons: Record<string, React.ReactNode> = {
  fire_smoke: <Flame className="h-4 w-4" />,
  vehicle_accident: <Car className="h-4 w-4" />,
  crowd_gathering: <Users className="h-4 w-4" />,
  traffic_congestion: <Car className="h-4 w-4" />,
  road_blockage: <AlertTriangle className="h-4 w-4" />,
  fallen_person: <Users className="h-4 w-4" />,
  normal: <CheckCircle className="h-4 w-4" />,
};

export default function VideoIntelligencePage() {
  const [status, setStatus] = useState<VideoAIStatus | null>(null);
  const [events, setEvents] = useState<VideoEvent[]>([]);
  const [alerts, setAlerts] = useState<VideoAlert[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<VideoAnalysisResponse | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [statusError, setStatusError] = useState(false);
  const [site, setSite] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [dispatching, setDispatching] = useState(false);
  const [dispatchMsg, setDispatchMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load status and events
  useEffect(() => {
    videoApi.getStatus().then((s) => { setStatus(s); setStatusError(false); }).catch(() => setStatusError(true));
    videoApi.getEvents(20).then((r) => setEvents(r.events ?? [])).catch(() => {});
  }, []);

  // Release the preview object URL when replaced/unmounted
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  // Connect to video alert WebSocket
  useEffect(() => {
    connectVideoAlertWS((alert) => {
      setAlerts((prev) => [alert, ...prev].slice(0, 50));
    });
    return () => disconnectVideoAlertWS();
  }, []);

  // Handle file upload
  const handleFile = useCallback(async (file: File) => {
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    setDispatchMsg(null);
    if (!ALLOWED_EXT.includes(ext)) {
      setResult({ id: "", event_type: "error", severity: "low", confidence: 0, objects_detected: [], vehicle_count: 0, people_count: 0, timestamp: "", latitude: 0, longitude: 0, video_source: "", frames_analyzed: 0, processing_time_seconds: 0, detection_method: "", scene_label: "", error: `Unsupported format ${ext}. Use ${ALLOWED_EXT.join(", ")}` });
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setResult({ id: "", event_type: "error", severity: "low", confidence: 0, objects_detected: [], vehicle_count: 0, people_count: 0, timestamp: "", latitude: 0, longitude: 0, video_source: "", frames_analyzed: 0, processing_time_seconds: 0, detection_method: "", scene_label: "", error: `File is ${(file.size / 1048576).toFixed(0)} MB — max ${MAX_MB} MB` });
      return;
    }
    setPreview(URL.createObjectURL(file));
    setFileName(file.name);
    setAnalyzing(true);
    setResult(null);
    const cam = CAMERA_SITES[site];
    try {
      const res = await videoApi.analyzeVideo(file, {
        videoSource: cam.name, latitude: cam.lat, longitude: cam.lng, frameInterval: 2,
      });
      setResult(res);
      // Refresh events list
      videoApi.getEvents(20).then((r) => setEvents(r.events)).catch(() => {});
    } catch (e) {
      setResult({
        id: "",
        event_type: "error",
        severity: "low",
        confidence: 0,
        objects_detected: [],
        vehicle_count: 0,
        people_count: 0,
        timestamp: "",
        latitude: 0,
        longitude: 0,
        video_source: "",
        frames_analyzed: 0,
        processing_time_seconds: 0,
        detection_method: "",
        scene_label: "",
        error: e instanceof Error
          ? (e.name === "AbortError" ? "Analysis timed out — try a shorter clip" : e.message)
          : "Analysis failed",
      });
    } finally {
      setAnalyzing(false);
    }
  }, [site]);

  const dispatchToIncident = useCallback(async () => {
    if (!result) return;
    const cam = CAMERA_SITES[site];
    setDispatching(true); setDispatchMsg(null);
    try {
      const em = await api.emergency({ latitude: result.latitude || cam.lat, longitude: result.longitude || cam.lng });
      const amb = em.nearest_ambulance;
      if (!amb?.vehicle_id) throw new Error("No ambulance available nearby");
      const d = await api.dispatch({
        vehicle_id: amb.vehicle_id, incident_location: `Video incident · ${cam.name}`,
        incident_lat: result.latitude || cam.lat, incident_lng: result.longitude || cam.lng,
        priority: result.severity === "critical" ? "critical" : "high",
      });
      setDispatchMsg(`${d.vehicle_id} dispatched — ETA ${d.estimated_arrival}. Nearest hospital: ${em.nearest_hospital?.hospital_name ?? "—"}`);
    } catch (e) {
      setDispatchMsg(e instanceof Error ? e.message : "Dispatch failed");
    } finally { setDispatching(false); }
  }, [result, site]);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  return (
    <div className="flex flex-col gap-4 lg:h-[calc(100vh-7rem)] animate-fade-in">
      {/* ── Top Stats Bar ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card-lifted p-4 flex items-center gap-3">
          <div
            className="h-10 w-10 rounded-[var(--radius-md)] flex items-center justify-center"
            style={{
              background:
                status?.status === "online"
                  ? "rgba(16,185,129,0.15)"
                  : "rgba(239,68,68,0.15)",
            }}
          >
            {status?.status === "online" ? (
              <CheckCircle className="h-5 w-5 text-[var(--color-success)]" />
            ) : (
              <XCircle className="h-5 w-5 text-[var(--color-error)]" />
            )}
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-[var(--color-on-surface-muted)]">
              AI Engine
            </span>
            <p className="text-sm font-semibold text-[var(--color-on-surface)] capitalize">
              {statusError ? "Backend unreachable" : status?.status ?? "Loading..."}
              {status?.demo_mode && (
                <span className="ml-1.5 text-[9px] font-bold text-[#6366f1] bg-[rgba(99,102,241,0.12)] px-1.5 py-0.5 rounded-full uppercase">Demo</span>
              )}
            </p>
          </div>
        </div>

        <div className="card-lifted p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-[var(--radius-md)] flex items-center justify-center bg-[rgba(99,102,241,0.15)]">
            <Eye className="h-5 w-5 text-[#6366f1]" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-[var(--color-on-surface-muted)]">
              Detection
            </span>
            <p className="text-sm font-semibold text-[var(--color-on-surface)]">
              {status?.detector ?? (status?.yolo_available ? "YOLOv8" : "OpenCV heuristic")}
            </p>
          </div>
        </div>

        <div className="card-lifted p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-[var(--radius-md)] flex items-center justify-center bg-[rgba(245,158,11,0.15)]">
            <AlertTriangle className="h-5 w-5 text-[#f59e0b]" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-[var(--color-on-surface-muted)]">
              Live Alerts
            </span>
            <p className="text-sm font-semibold text-[var(--color-on-surface)]">
              {alerts.length}
            </p>
          </div>
        </div>

        <div className="card-lifted p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-[var(--radius-md)] flex items-center justify-center bg-[rgba(16,185,129,0.15)]">
            <Activity className="h-5 w-5 text-[var(--color-success)]" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-[var(--color-on-surface-muted)]">
              Events Logged
            </span>
            <p className="text-sm font-semibold text-[var(--color-on-surface)]">
              {events.length}
            </p>
          </div>
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="flex flex-col lg:flex-row gap-4 flex-1 lg:overflow-hidden">
        {/* Left: Upload + Results */}
        <div className="flex-1 flex flex-col gap-4 lg:overflow-y-auto pr-1">
          {/* Camera site */}
          <div className="card-lifted p-4 flex flex-wrap items-center gap-3">
            <Camera className="h-4 w-4 text-[var(--color-primary)]" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-on-surface-muted)]">Camera site</span>
            <select value={site} onChange={(e) => setSite(+e.target.value)} disabled={analyzing}
              className="flex-1 min-w-[200px] text-[12px] bg-[var(--color-surface-container-low)] rounded-md px-2 py-1.5 outline-none">
              {CAMERA_SITES.map((c, i) => <option key={c.name} value={i}>{c.name}</option>)}
            </select>
            <span className="text-[10px] text-[var(--color-on-surface-muted)]">Geotags the clip so alerts and dispatch go to the right place</span>
          </div>
          {/* Upload Zone */}
          <div
            className={`card-lifted p-6 border-2 border-dashed transition-all duration-300 cursor-pointer ${
              dragOver
                ? "border-[var(--color-primary)] bg-[rgba(99,102,241,0.08)]"
                : "border-[var(--color-surface-container-high)]"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => !analyzing && fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              disabled={analyzing}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = ""; // allow analysing the same file again
                if (f) handleFile(f);
              }}
            />
            <div className="flex flex-col items-center justify-center gap-3">
              {analyzing ? (
                <>
                  <Loader2 className="h-8 w-8 text-[var(--color-primary)] animate-spin" />
                  <span className="text-sm text-[var(--color-on-surface-muted)]">
                    Analyzing video frames...
                  </span>
                  <span className="text-[10px] text-[var(--color-on-surface-muted)]">
                    {fileName} · {status?.detector ?? "detector"} on {CAMERA_SITES[site].name}
                  </span>
                </>
              ) : (
                <>
                  <Upload className="h-8 w-8 text-[var(--color-primary)]" />
                  <span className="text-sm font-medium text-[var(--color-on-surface)]">
                    Drop video file or click to upload
                  </span>
                  <span className="text-[11px] text-[var(--color-on-surface-muted)]">
                    MP4, AVI, MOV, MKV, WebM · up to {MAX_MB} MB
                  </span>
                </>
              )}
            </div>
          </div>

          {preview && (
            <div className="card-lifted overflow-hidden">
              <video src={preview} controls muted className="w-full max-h-[260px] bg-black" />
            </div>
          )}

          {/* Analysis Result */}
          {result && (
            <div
              className="card-lifted p-5 animate-fade-in"
              style={{
                borderLeft: `3px solid ${
                  severityColors[result.severity] || "var(--color-outline-variant)"
                }`,
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-[var(--color-on-surface)] flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Emergency Intelligence Report
                </h3>
                <div className="flex items-center gap-2">
                  {result.demo_mode && (
                    <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full text-[#6366f1] bg-[rgba(99,102,241,0.12)]">
                      Demo Mode
                    </span>
                  )}
                  <span
                    className="text-[11px] font-bold uppercase px-2 py-0.5 rounded-full"
                    style={{
                      color: severityColors[result.severity],
                      background: severityBg[result.severity],
                    }}
                  >
                    {result.severity}
                  </span>
                </div>
              </div>

              {result.error ? (
                <p className="text-sm text-[var(--color-error)]">
                  {result.error}
                </p>
              ) : (
                <div className="space-y-4">
                  {/* Accident Description Banner */}
                  {result.accident_type && result.accident_type !== "none" && (
                    <div className="p-3 rounded-[var(--radius-md)]" style={{
                      background: severityBg[result.severity],
                      borderLeft: `3px solid ${severityColors[result.severity]}`,
                    }}>
                      <p className="text-[13px] font-semibold text-[var(--color-on-surface)] capitalize">
                        {result.accident_type.replace(/_/g, " ")}
                      </p>
                      <p className="text-[11px] text-[var(--color-on-surface-muted)] mt-0.5">
                        {result.accident_description}
                      </p>
                      {typeof result.severity_score === "number" && (
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-[10px] text-[var(--color-on-surface-muted)] uppercase font-semibold">Severity</span>
                          <div className="flex-1 h-1.5 rounded-full bg-[var(--color-surface-container-high)] overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-700" style={{
                              width: `${result.severity_score * 100}%`,
                              backgroundColor: severityColors[result.severity],
                            }} />
                          </div>
                          <span className="text-[11px] font-bold" style={{ color: severityColors[result.severity] }}>
                            {(result.severity_score * 100).toFixed(0)}%
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Dispatch from video */}
                  {(result.severity === "high" || result.severity === "critical" ||
                    (result.accident_type && result.accident_type !== "none")) && (
                    <div className="flex flex-wrap items-center gap-3 p-3 rounded-[var(--radius-md)] bg-[var(--color-error)]/6">
                      <button onClick={dispatchToIncident} disabled={dispatching}
                        className="btn-primary text-[11px] px-3 py-1.5 rounded-md flex items-center gap-1.5 disabled:opacity-50">
                        {dispatching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Navigation className="h-3.5 w-3.5" />}
                        Dispatch nearest ambulance
                      </button>
                      <span className="text-[11px] text-[var(--color-on-surface-muted)]">{dispatchMsg ?? `to ${CAMERA_SITES[site].name}`}</span>
                    </div>
                  )}

                  {/* Action Recommendation */}
                  {result.action_recommendation && (
                    <div className="flex items-center gap-2 p-2.5 rounded-[var(--radius-md)] bg-[rgba(99,102,241,0.08)] border border-[rgba(99,102,241,0.2)]">
                      <Zap className="h-4 w-4 text-[#6366f1] shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-[10px] uppercase font-bold text-[#6366f1]">Recommended Action</span>
                        <p className="text-[12px] font-semibold text-[var(--color-on-surface)]">{result.action_recommendation}</p>
                      </div>
                      {result.alert_status && (
                        <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0" style={{
                          color: result.alert_status === "Alert Triggered" ? severityColors.critical : severityColors.medium,
                          background: result.alert_status === "Alert Triggered" ? severityBg.critical : severityBg.medium,
                        }}>
                          {result.alert_status}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Location Intelligence */}
                  {result.location && (
                    <div className="flex items-center gap-2 p-2.5 rounded-[var(--radius-md)] bg-[rgba(16,185,129,0.06)] border border-[rgba(16,185,129,0.15)]">
                      <MapPin className="h-4 w-4 text-[var(--color-success)] shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-[10px] uppercase font-bold text-[var(--color-success)]">Incident Location</span>
                        <p className="text-[12px] font-semibold text-[var(--color-on-surface)]">{result.location}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {result.source_camera && (
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-muted)] flex items-center gap-1">
                            <Camera className="h-3 w-3" /> {result.source_camera}
                          </span>
                        )}
                        {result.location_confidence && (
                          <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full" style={{
                            color: result.location_confidence === "high" ? "var(--color-success)" : "#f59e0b",
                            background: result.location_confidence === "high" ? "rgba(16,185,129,0.12)" : "rgba(245,158,11,0.12)",
                          }}>
                            {result.location_confidence} conf
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Core Stats Grid */}
                  <div className="grid grid-cols-3 gap-3 text-[12px]">
                    <div>
                      <span className="text-[var(--color-on-surface-muted)]">Event Type</span>
                      <p className="font-semibold text-[var(--color-on-surface)] capitalize">{result.scene_label || result.event_type.replace(/_/g, " ")}</p>
                    </div>
                    <div>
                      <span className="text-[var(--color-on-surface-muted)]">Confidence</span>
                      <p className="font-semibold text-[var(--color-on-surface)]">{(result.confidence * 100).toFixed(1)}%</p>
                    </div>
                    <div>
                      <span className="text-[var(--color-on-surface-muted)]">Detection</span>
                      <p className="font-semibold text-[var(--color-on-surface)] uppercase">{result.detection_method}</p>
                    </div>
                    <div>
                      <span className="text-[var(--color-on-surface-muted)]">Total Vehicles</span>
                      <p className="font-semibold text-[var(--color-on-surface)]">{result.vehicle_count}</p>
                    </div>
                    <div>
                      <span className="text-[var(--color-on-surface-muted)]">People Detected</span>
                      <p className="font-semibold text-[var(--color-on-surface)]">{result.people_count}</p>
                    </div>
                    <div>
                      <span className="text-[var(--color-on-surface-muted)]">Frames Analyzed</span>
                      <p className="font-semibold text-[var(--color-on-surface)]">{result.frames_analyzed}</p>
                    </div>
                  </div>

                  {/* Vehicle Breakdown */}
                  {result.vehicle_types && Object.keys(result.vehicle_types).length > 0 && (
                    <div>
                      <span className="text-[10px] text-[var(--color-on-surface-muted)] uppercase font-semibold tracking-wider">Vehicle Breakdown</span>
                      <div className="flex flex-wrap gap-2 mt-1.5">
                        {Object.entries(result.vehicle_types).map(([type, count]) => (
                          <div key={type} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--color-surface-container-high)]">
                            <Car className="h-3 w-3 text-[var(--color-primary)]" />
                            <span className="text-[11px] font-semibold text-[var(--color-on-surface)] capitalize">{count}× {type}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Objects Detected */}
                  {result.objects_detected.length > 0 && (
                    <div>
                      <span className="text-[10px] text-[var(--color-on-surface-muted)] uppercase font-semibold tracking-wider">Objects Detected</span>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {result.objects_detected.map((obj) => (
                          <span key={obj} className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)]">{obj}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Processing Metadata */}
                  <div className="grid grid-cols-3 gap-3 text-[11px] pt-2 border-t border-[var(--color-surface-container-high)]">
                    <div>
                      <span className="text-[var(--color-on-surface-muted)]">Processing Time</span>
                      <p className="font-semibold text-[var(--color-on-surface)]">{result.processing_time_seconds}s</p>
                    </div>
                    {typeof result.accident_frame_ratio === "number" && (
                      <div>
                        <span className="text-[var(--color-on-surface-muted)]">Accident Frames</span>
                        <p className="font-semibold text-[var(--color-on-surface)]">{result.accident_frames}/{result.frames_analyzed} ({(result.accident_frame_ratio * 100).toFixed(0)}%)</p>
                      </div>
                    )}
                    {result.video_metadata && (
                      <div>
                        <span className="text-[var(--color-on-surface-muted)]">Video Info</span>
                        <p className="font-semibold text-[var(--color-on-surface)]">{result.video_metadata.width}×{result.video_metadata.height} • {result.video_metadata.fps}fps</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Event History */}
          <div className="card-lifted p-4">
            <h3 className="text-[13px] font-semibold text-[var(--color-on-surface)] mb-3 flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Recent Events
            </h3>
            {events.length === 0 ? (
              <p className="text-[12px] text-[var(--color-on-surface-muted)] text-center py-4">
                No video events recorded yet
              </p>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {events.map((evt) => (
                  <div
                    key={evt.id}
                    className="flex items-center gap-3 p-2.5 rounded-[var(--radius-md)] hover:bg-[var(--color-surface-container-high)] transition-colors"
                  >
                    <div
                      className="h-8 w-8 rounded-full flex items-center justify-center shrink-0"
                      style={{
                        background:
                          severityBg[evt.severity] || "rgba(100,100,100,0.1)",
                        color:
                          severityColors[evt.severity] ||
                          "var(--color-on-surface-muted)",
                      }}
                    >
                      {eventIcons[evt.event_type] || (
                        <Video className="h-4 w-4" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium text-[var(--color-on-surface)] capitalize truncate">
                        {evt.event_type.replace(/_/g, " ")}
                      </p>
                      <p className="text-[10px] text-[var(--color-on-surface-muted)]">
                        {new Date(evt.timestamp).toLocaleString()} •{" "}
                        {(evt.confidence * 100).toFixed(0)}% confidence
                      </p>
                    </div>
                    <span
                      className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full shrink-0"
                      style={{
                        color: severityColors[evt.severity],
                        background: severityBg[evt.severity],
                      }}
                    >
                      {evt.severity}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Live Alerts Feed */}
        <div className="w-full lg:w-[320px] min-h-[260px] shrink-0 card-lifted overflow-hidden flex flex-col">
          <div className="px-4 pt-4 pb-3 flex items-center justify-between">
            <h3 className="text-[13px] font-semibold text-[var(--color-on-surface)] flex items-center gap-2">
              <Radio className="h-4 w-4 text-[var(--color-error)]" />
              Live Video Alerts
            </h3>
            <span className="text-[10px] font-medium text-[var(--color-success)] flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-success)] animate-pulse" />
              LIVE
            </span>
          </div>

          <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
            {alerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <Shield className="h-8 w-8 text-[var(--color-outline-variant)] mb-2" />
                <p className="text-[12px] text-[var(--color-on-surface-muted)]">
                  No active alerts
                </p>
                <p className="text-[10px] text-[var(--color-on-surface-muted)] mt-1">
                  Alerts appear here when video AI detects high-confidence emergency events
                </p>
              </div>
            ) : (
              alerts.map((alert, i) => (
                <div
                  key={`${alert.timestamp}-${i}`}
                  className="p-3 rounded-[var(--radius-md)] animate-fade-in"
                  style={{
                    background:
                      severityBg[alert.severity] || "rgba(100,100,100,0.08)",
                    borderLeft: `3px solid ${
                      severityColors[alert.severity] ||
                      "var(--color-outline-variant)"
                    }`,
                  }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className="text-[11px] font-bold uppercase"
                      style={{
                        color: severityColors[alert.severity],
                      }}
                    >
                      {alert.severity}
                    </span>
                    <span className="text-[9px] text-[var(--color-on-surface-muted)]">
                      {alert.timestamp
                        ? new Date(alert.timestamp).toLocaleTimeString()
                        : "now"}
                    </span>
                  </div>
                  <p className="text-[12px] font-medium text-[var(--color-on-surface)] capitalize">
                    {alert.event.replace(/_/g, " ")}
                  </p>
                  {alert.location && (
                    <p className="text-[10px] text-[var(--color-on-surface-muted)] flex items-center gap-1 mt-1">
                      <MapPin className="h-3 w-3" />
                      {alert.location}
                    </p>
                  )}
                  <p className="text-[10px] text-[var(--color-on-surface-muted)] mt-0.5">
                    Confidence: {((alert.confidence || 0) * 100).toFixed(0)}%
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
