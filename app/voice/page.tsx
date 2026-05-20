"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Mic,
  MicOff,
  Upload,
  Loader2,
  AlertTriangle,
  Activity,
  Ambulance,
  MapPin,
  Brain,
  Waves,
  FileAudio,
  ArrowRight,
  Hospital,
  Siren,
  CheckCircle2,
} from "lucide-react";
import dynamic from "next/dynamic";
import { api } from "@/lib/api";

/* Dynamic Leaflet map for showing emergency locations */
const VoiceResultMap = dynamic(
  () => import("react-leaflet").then((mod) => {
    const { MapContainer, TileLayer, Marker, Popup, Circle, useMap } = mod;
    const L = require("leaflet");

    // Fix default icon
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png",
      iconUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
      shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
    });

    const makeIcon = (color: string, label: string) => L.divIcon({
      className: "",
      html: `<div style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.35);color:#fff;font-size:12px;font-weight:700">${label}</div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });

    /* Auto-fit map bounds to all markers */
    function AutoFit({ points }: { points: [number, number][] }) {
      const map = useMap();
      const { useEffect, useRef } = require("react");
      const fitted = useRef(false);
      useEffect(() => {
        if (!fitted.current && points.length > 0) {
          const bounds = L.latLngBounds(points);
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 10, animate: true });
          fitted.current = true;
        }
      }, [points, map]);
      return null;
    }

    function ResultMap({ data }: { data: any }) {
      if (!data) return null;
      const inc = data.incident_location || {};
      const center: [number, number] = [inc.latitude || 19.076, inc.longitude || 72.877];
      const ambs = data.all_nearby_ambulances || [];
      const hosps = data.all_nearby_hospitals || [];

      // Collect ALL points for auto-fit
      const allPoints: [number, number][] = [center];
      ambs.forEach((a: any) => allPoints.push([a.latitude, a.longitude]));
      hosps.forEach((h: any) => allPoints.push([h.latitude, h.longitude]));

      return (
        <MapContainer center={center} zoom={8} scrollWheelZoom style={{ height: "100%", width: "100%", zIndex: 0 }}>
          <TileLayer url="https://tile.openstreetmap.de/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap' maxZoom={19} />
          <AutoFit points={allPoints} />
          {/* Incident location */}
          <Circle center={center} radius={2000} pathOptions={{ color: "#f59e0b", fillColor: "#f59e0b", fillOpacity: 0.15, weight: 2 }} />
          <Marker position={center} icon={makeIcon("#f59e0b", "!")}>
            <Popup><strong>Incident Location</strong><br />{inc.latitude?.toFixed(4)}, {inc.longitude?.toFixed(4)}</Popup>
          </Marker>
          {/* Ambulances */}
          {ambs.map((a: any, i: number) => (
            <Marker key={`a${i}`} position={[a.latitude, a.longitude]} icon={makeIcon("#ef4444", "A")}>
              <Popup><strong>{a.vehicle_id}</strong><br />Distance: {a.distance_km} km<br />ETA: {a.estimated_arrival_min} min<br />Status: {a.status}</Popup>
            </Marker>
          ))}
          {/* Hospitals */}
          {hosps.map((h: any, i: number) => (
            <Marker key={`h${i}`} position={[h.latitude, h.longitude]} icon={makeIcon("#3b82f6", "H")}>
              <Popup><strong>{h.hospital_name}</strong><br />Distance: {h.distance_km} km<br />City: {h.city}<br />Beds: {h.available_beds} / {h.total_beds}<br />Emergency: {h.has_emergency}<br />ICU: {h.icu_beds}</Popup>
            </Marker>
          ))}
        </MapContainer>
      );
    }
    return ResultMap;
  }),
  { ssr: false, loading: () => <div className="w-full h-full flex justify-center items-center bg-[var(--color-surface-container-low)] rounded-[var(--radius-md)] text-[var(--color-on-surface-muted)]">Loading map...</div> }
);

type ProcessingStage = "idle" | "recording" | "transcribing" | "detecting" | "routing" | "complete";

interface IntentResult {
  intent: string;
  confidence: number;
  action: string;
  description: string;
  priority: string;
  matched_keywords: string[];
  extracted_location: { name: string; latitude: number; longitude: number } | null;
}

interface ActionResult {
  type: string;
  message: string;
  data: any;
}

export default function VoiceCommandPage() {
  const [stage, setStage] = useState<ProcessingStage>("idle");
  const [isRecording, setIsRecording] = useState(false);
  const [transcription, setTranscription] = useState("");
  const [intentResult, setIntentResult] = useState<IntentResult | null>(null);
  const [actionResult, setActionResult] = useState<ActionResult | null>(null);
  const [error, setError] = useState("");
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isMock, setIsMock] = useState(false);

  const recognitionRef = useRef<any>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const liveTextRef = useRef<string>("");

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (recognitionRef.current) try { recognitionRef.current.abort(); } catch {}
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, []);

  const startRecording = useCallback(async () => {
    try {
      setError("");
      setTranscription("");
      setIntentResult(null);
      setActionResult(null);
      setIsMock(false);
      liveTextRef.current = "";

      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SR) {
        setError("Speech Recognition not supported. Use Chrome or Edge.");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateLevel = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        setAudioLevel(avg / 128);
        animFrameRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();

      const recognition = new SR();
      recognition.lang = "en-US";
      recognition.continuous = true;
      recognition.interimResults = true;
      recognitionRef.current = recognition;

      recognition.onresult = (event: any) => {
        let finalT = "";
        let interimT = "";
        for (let i = 0; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            finalT += event.results[i][0].transcript + " ";
          } else {
            interimT += event.results[i][0].transcript;
          }
        }
        const full = (finalT + interimT).trim();
        liveTextRef.current = full;
        setTranscription(full);
      };

      recognition.onerror = (event: any) => {
        if (event.error !== "aborted" && event.error !== "no-speech") {
          console.warn("Speech error:", event.error);
        }
      };

      recognition.start();
      setIsRecording(true);
      setStage("recording");
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime((t) => t + 1);
      }, 1000);

      setTimeout(() => {
        if (recognitionRef.current) stopRecording();
      }, 10000);
    } catch (err: any) {
      setError("Microphone access denied. Please allow microphone permissions.");
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    setAudioLevel(0);
    if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch {} recognitionRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (audioCtxRef.current) { audioCtxRef.current.close(); audioCtxRef.current = null; }
    analyserRef.current = null;
    setIsRecording(false);

    setTimeout(() => {
      const text = liveTextRef.current.trim();
      if (text) {
        processText(text);
      } else {
        setError("No speech detected. Try speaking louder or longer.");
        setStage("idle");
      }
    }, 400);
  }, []);

  const processText = async (text: string) => {
    try {
      setStage("transcribing");
      await new Promise((r) => setTimeout(r, 300));
      setStage("detecting");

      const result = await api.textIntent(text);

      setIntentResult(result.intent || null);
      setStage("routing");
      await new Promise((r) => setTimeout(r, 400));
      setActionResult(result.action_result || null);
      setStage("complete");
    } catch (err: any) {
      setError(err.message || "Failed to process. Is the backend running?");
      setStage("idle");
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(""); setTranscription(""); setIntentResult(null); setActionResult(null);
    try {
      setStage("transcribing");
      const result = await api.voiceIntent(file);
      if (result.whisper_error && !result.transcription) {
        setError(result.whisper_error);
        setStage("idle");
        return;
      }
      setTranscription(result.transcription || "");
      setStage("detecting");
      await new Promise((r) => setTimeout(r, 400));
      setIntentResult(result.intent || null);
      setStage("routing");
      await new Promise((r) => setTimeout(r, 400));
      setActionResult(result.action_result || null);
      setStage("complete");
    } catch (err: any) {
      setError(err.message || "Failed to process audio file.");
      setStage("idle");
    }
  };

  const resetState = () => {
    setStage("idle");
    setTranscription("");
    setIntentResult(null);
    setActionResult(null);
    setError("");
    setRecordingTime(0);
    setIsMock(false);
  };

  const priorityColor = (priority: string) => {
    switch (priority) {
      case "critical": return "var(--color-error)";
      case "high": return "var(--color-warning)";
      default: return "var(--color-success)";
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-[var(--font-display)] text-[22px] font-bold tracking-tight text-[var(--color-on-surface)]">
            Voice Command Center
          </h1>
          <p className="text-[13px] text-[var(--color-on-surface-muted)] mt-1">
            Speak or upload audio — the system will detect intent and trigger actions automatically
          </p>
        </div>
        {stage !== "idle" && (
          <button
            onClick={resetState}
            className="px-4 py-2 rounded-[var(--radius-md)] bg-[var(--color-surface-container-high)] text-[12px] font-medium text-[var(--color-on-surface-muted)] hover:text-[var(--color-on-surface)] transition-colors"
          >
            Reset
          </button>
        )}
      </div>

      {/* Pipeline Progress */}
      <div className="card-lifted p-4">
        <div className="flex items-center gap-3">
          {["recording", "transcribing", "detecting", "routing", "complete"].map((s, i) => {
            const stageNames = ["Voice Input", "Transcription", "Intent Detection", "Action Routing", "Complete"];
            const icons = [Mic, Waves, Brain, ArrowRight, CheckCircle2];
            const Icon = icons[i];
            const isActive = stage === s;
            const isPast = ["recording", "transcribing", "detecting", "routing", "complete"].indexOf(stage) > i;
            return (
              <div key={s} className="flex items-center gap-3 flex-1">
                <div className={`flex items-center gap-2 px-3 py-2 rounded-[var(--radius-md)] transition-all duration-300 flex-1 ${
                  isActive ? "bg-[var(--color-primary)] text-white shadow-lg" :
                  isPast ? "bg-[rgba(0,103,127,0.1)] text-[var(--color-primary)]" :
                  "bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-muted)]"
                }`}>
                  {isActive && stage !== "complete" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Icon className="h-3.5 w-3.5" />
                  )}
                  <span className="text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap">
                    {stageNames[i]}
                  </span>
                </div>
                {i < 4 && <div className={`h-[2px] w-4 rounded-full transition-colors duration-300 shrink-0 ${isPast ? "bg-[var(--color-primary)]" : "bg-[var(--color-surface-container-high)]"}`} />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="flex items-center gap-3 rounded-[var(--radius-md)] bg-[rgba(239,68,68,0.06)] px-4 py-3 animate-fade-in">
          <AlertTriangle className="h-4 w-4 text-[var(--color-error)] shrink-0" />
          <span className="text-[12px] font-medium text-[var(--color-error)]">{error}</span>
        </div>
      )}

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Left: Voice Input */}
        <div className="space-y-4">
          {/* Microphone Card */}
          <div className="card-lifted p-6 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-[rgba(0,103,127,0.03)] to-transparent" />
            <div className="relative z-10">
              <h3 className="font-[var(--font-display)] text-[13px] font-semibold tracking-tight text-[var(--color-on-surface)] mb-4 flex items-center gap-2">
                <Mic className="h-4 w-4 text-[var(--color-primary)]" />
                Live Microphone
              </h3>

              <div className="flex flex-col items-center py-6">
                {/* Audio Visualizer Ring */}
                <div className="relative mb-6">
                  <div
                    className="absolute inset-0 rounded-full transition-all duration-150"
                    style={{
                      transform: `scale(${1 + audioLevel * 0.5})`,
                      background: isRecording
                        ? `radial-gradient(circle, rgba(239,68,68,${0.1 + audioLevel * 0.2}) 0%, transparent 70%)`
                        : "transparent",
                    }}
                  />
                  <button
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={stage === "transcribing" || stage === "detecting" || stage === "routing"}
                    className={`relative h-20 w-20 rounded-full flex items-center justify-center transition-all duration-300 ${
                      isRecording
                        ? "bg-[var(--color-error)] text-white shadow-[0_0_20px_rgba(239,68,68,0.4)] animate-pulse"
                        : "bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-dim)] text-white shadow-lg hover:shadow-xl hover:scale-105"
                    } disabled:opacity-40 disabled:cursor-not-allowed`}
                  >
                    {isRecording ? <MicOff className="h-8 w-8" /> : <Mic className="h-8 w-8" />}
                  </button>
                </div>

                <p className="text-[12px] text-[var(--color-on-surface-muted)] text-center">
                  {isRecording
                    ? `Recording... ${recordingTime}s (max 10s)`
                    : stage === "idle"
                    ? "Click to start recording (5-10 sec)"
                    : "Processing..."}
                </p>

                {/* Recording time bar */}
                {isRecording && (
                  <div className="w-full mt-4 h-1.5 rounded-full bg-[var(--color-surface-container-high)] overflow-hidden">
                    <div
                      className="h-full bg-[var(--color-error)] rounded-full transition-all duration-1000"
                      style={{ width: `${(recordingTime / 10) * 100}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* File Upload Card */}
          <div className="card-lifted p-5">
            <h3 className="font-[var(--font-display)] text-[13px] font-semibold tracking-tight text-[var(--color-on-surface)] mb-3 flex items-center gap-2">
              <FileAudio className="h-4 w-4 text-[var(--color-primary)]" />
              Upload Audio File
            </h3>
            <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-[var(--color-surface-container-high)] rounded-[var(--radius-md)] cursor-pointer hover:border-[var(--color-primary)] hover:bg-[rgba(0,103,127,0.02)] transition-all">
              <Upload className="h-5 w-5 text-[var(--color-on-surface-muted)] mb-1" />
              <span className="text-[11px] text-[var(--color-on-surface-muted)]">
                Drop audio file or click to browse
              </span>
              <span className="text-[10px] text-[var(--color-on-surface-muted)] opacity-60 mt-0.5">
                .wav .mp3 .webm .ogg .m4a
              </span>
              <input
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={handleFileUpload}
                disabled={stage !== "idle" && stage !== "complete"}
              />
            </label>
          </div>

          {/* Transcription Result */}
          {transcription && (
            <div className="card-lifted p-5 animate-fade-in">
              <h3 className="font-[var(--font-display)] text-[13px] font-semibold tracking-tight text-[var(--color-on-surface)] mb-3 flex items-center gap-2">
                <Waves className="h-4 w-4 text-[var(--color-primary)]" />
                Transcription
                <span className={`ml-auto px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                  isMock
                    ? "bg-[rgba(245,158,11,0.1)] text-[var(--color-warning)]"
                    : "bg-[rgba(16,185,129,0.1)] text-[var(--color-success)]"
                }`}>
                  {isMock ? "Demo" : "Live"}
                </span>
              </h3>
              <p className="text-[13px] text-[var(--color-on-surface)] leading-relaxed bg-[var(--color-surface-container-low)] rounded-[var(--radius-sm)] p-3 italic">
                &ldquo;{transcription}&rdquo;
              </p>
            </div>
          )}
        </div>

        {/* Right: Results */}
        <div className="space-y-4">
          {/* Intent Detection Card */}
          {intentResult && (
            <div className="card-lifted p-5 animate-fade-in relative overflow-hidden">
              <div
                className="absolute inset-0 opacity-[0.04]"
                style={{ backgroundColor: priorityColor(intentResult.priority) }}
              />
              <div className="relative z-10">
                <h3 className="font-[var(--font-display)] text-[13px] font-semibold tracking-tight text-[var(--color-on-surface)] mb-4 flex items-center gap-2">
                  <Brain className="h-4 w-4 text-[var(--color-primary)]" />
                  Intent Detection
                </h3>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-[var(--color-on-surface-muted)] uppercase tracking-wider font-semibold">
                      Detected Intent
                    </span>
                    <span
                      className="px-3 py-1 rounded-full text-[12px] font-bold uppercase"
                      style={{
                        backgroundColor: `${priorityColor(intentResult.priority)}15`,
                        color: priorityColor(intentResult.priority),
                      }}
                    >
                      {intentResult.intent}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-[var(--color-on-surface-muted)] uppercase tracking-wider font-semibold">
                      Confidence
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 rounded-full bg-[var(--color-surface-container-high)] overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${intentResult.confidence * 100}%`,
                            backgroundColor: priorityColor(intentResult.priority),
                          }}
                        />
                      </div>
                      <span className="font-[var(--font-display)] text-[12px] font-bold"
                        style={{ color: priorityColor(intentResult.priority) }}>
                        {(intentResult.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-[var(--color-on-surface-muted)] uppercase tracking-wider font-semibold">
                      Priority
                    </span>
                    <span className="text-[12px] font-semibold capitalize"
                      style={{ color: priorityColor(intentResult.priority) }}>
                      {intentResult.priority}
                    </span>
                  </div>

                  {intentResult.matched_keywords.length > 0 && (
                    <div>
                      <span className="text-[11px] text-[var(--color-on-surface-muted)] uppercase tracking-wider font-semibold">
                        Matched Keywords
                      </span>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {intentResult.matched_keywords.map((kw) => (
                          <span
                            key={kw}
                            className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)]"
                          >
                            {kw}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {intentResult.extracted_location && (
                    <div className="flex items-center gap-2 mt-2 px-3 py-2 rounded-[var(--radius-sm)] bg-[var(--color-surface-container-low)]">
                      <MapPin className="h-3.5 w-3.5 text-[var(--color-primary)]" />
                      <span className="text-[12px] font-medium">
                        Location: {intentResult.extracted_location.name}
                      </span>
                      <span className="text-[10px] text-[var(--color-on-surface-muted)]">
                        ({intentResult.extracted_location.latitude.toFixed(3)}, {intentResult.extracted_location.longitude.toFixed(3)})
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Action Result Card */}
          {actionResult && (
            <div className="card-lifted p-5 animate-fade-in">
              <h3 className="font-[var(--font-display)] text-[13px] font-semibold tracking-tight text-[var(--color-on-surface)] mb-4 flex items-center gap-2">
                <Activity className="h-4 w-4 text-[var(--color-primary)]" />
                Action Result
              </h3>

              <div className="bg-[var(--color-surface-container-low)] rounded-[var(--radius-md)] p-4 space-y-3">
                <p className="text-[12px] font-medium text-[var(--color-on-surface)]">
                  {actionResult.message}
                </p>

                {/* Emergency Response Data */}
                {(actionResult.type === "emergency" || actionResult.type === "help") && actionResult.data && (
                  <div className="space-y-3 mt-3">
                    {actionResult.data.nearest_ambulance && (
                      <div className="flex items-start gap-3 p-3 rounded-[var(--radius-sm)] bg-[var(--color-surface)]">
                        <Siren className="h-5 w-5 text-[var(--color-error)] mt-0.5 shrink-0" />
                        <div>
                          <p className="text-[12px] font-semibold text-[var(--color-on-surface)]">
                            Nearest Ambulance: {actionResult.data.nearest_ambulance.vehicle_id}
                          </p>
                          <p className="text-[11px] text-[var(--color-on-surface-muted)]">
                            Distance: {actionResult.data.nearest_ambulance.distance_km} km •
                            ETA: {actionResult.data.nearest_ambulance.estimated_arrival_min} min •
                            Status: {actionResult.data.nearest_ambulance.status}
                          </p>
                        </div>
                      </div>
                    )}

                    {actionResult.data.nearest_hospital && (
                      <div className="flex items-start gap-3 p-3 rounded-[var(--radius-sm)] bg-[var(--color-surface)]">
                        <Hospital className="h-5 w-5 text-[var(--color-primary)] mt-0.5 shrink-0" />
                        <div>
                          <p className="text-[12px] font-semibold text-[var(--color-on-surface)]">
                            Nearest Hospital: {actionResult.data.nearest_hospital.hospital_name}
                          </p>
                          <p className="text-[11px] text-[var(--color-on-surface-muted)]">
                            Distance: {actionResult.data.nearest_hospital.distance_km} km •
                            City: {actionResult.data.nearest_hospital.city} •
                            Beds: {actionResult.data.nearest_hospital.available_beds}
                          </p>
                          <p className="text-[10px] text-[var(--color-on-surface-muted)]">
                            Emergency: {actionResult.data.nearest_hospital.has_emergency} •
                            ICU: {actionResult.data.nearest_hospital.icu_beds} beds
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {actionResult.type === "traffic" && (
                  <div className="flex items-center gap-2 p-3 rounded-[var(--radius-sm)] bg-[var(--color-surface)]">
                    <Activity className="h-4 w-4 text-[var(--color-warning)]" />
                    <span className="text-[12px]">Redirecting to traffic dashboard...</span>
                  </div>
                )}

                {actionResult.type === "risk" && (
                  <div className="flex items-center gap-2 p-3 rounded-[var(--radius-sm)] bg-[var(--color-surface)]">
                    <AlertTriangle className="h-4 w-4 text-[var(--color-warning)]" />
                    <span className="text-[12px]">
                      Risk prediction loaded for coordinates
                      {actionResult.data?.coordinates && (
                        <span className="text-[var(--color-on-surface-muted)]">
                          {" "}({actionResult.data.coordinates.latitude}, {actionResult.data.coordinates.longitude})
                        </span>
                      )}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Map Preview with real markers */}
          {stage === "complete" && actionResult && (actionResult.type === "emergency" || actionResult.type === "help") && actionResult.data && (
            <div className="card-lifted overflow-hidden animate-fade-in">
              <div className="px-4 pt-3 pb-2 flex items-center justify-between">
                <h3 className="text-[13px] font-semibold text-[var(--color-on-surface)] flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-[var(--color-primary)]" />
                  Emergency Response Map
                </h3>
                <div className="flex items-center gap-3 text-[10px]">
                  <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-[#f59e0b]" />Incident</span>
                  <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-[#ef4444]" />Ambulance</span>
                  <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-[#3b82f6]" />Hospital</span>
                </div>
              </div>
              <div style={{ height: 320 }}>
                <VoiceResultMap data={actionResult.data} />
              </div>
            </div>
          )}

          {/* All nearby ambulances & hospitals list */}
          {stage === "complete" && actionResult && (actionResult.type === "emergency" || actionResult.type === "help") && actionResult.data && (
            <div className="card-lifted p-4 animate-fade-in">
              <h4 className="text-[12px] font-semibold text-[var(--color-on-surface)] mb-3 flex items-center gap-2">
                <Ambulance className="h-4 w-4 text-[var(--color-error)]" />
                All Nearby Ambulances ({actionResult.data.all_nearby_ambulances?.length || 0})
              </h4>
              <div className="space-y-2">
                {(actionResult.data.all_nearby_ambulances || []).map((a: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 p-2.5 rounded-[var(--radius-sm)] bg-[var(--color-surface-container-low)]">
                    <div className="h-7 w-7 rounded-full bg-[rgba(239,68,68,0.15)] flex items-center justify-center shrink-0">
                      <Siren className="h-3.5 w-3.5 text-[var(--color-error)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold text-[var(--color-on-surface)]">{a.vehicle_id}</p>
                      <p className="text-[10px] text-[var(--color-on-surface-muted)]">{a.distance_km} km • ETA {a.estimated_arrival_min} min • {a.status}</p>
                    </div>
                  </div>
                ))}
              </div>

              <h4 className="text-[12px] font-semibold text-[var(--color-on-surface)] mt-4 mb-3 flex items-center gap-2">
                <Hospital className="h-4 w-4 text-[var(--color-primary)]" />
                All Nearby Hospitals ({actionResult.data.all_nearby_hospitals?.length || 0})
              </h4>
              <div className="space-y-2">
                {(actionResult.data.all_nearby_hospitals || []).map((h: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 p-2.5 rounded-[var(--radius-sm)] bg-[var(--color-surface-container-low)]">
                    <div className="h-7 w-7 rounded-full bg-[rgba(59,130,246,0.15)] flex items-center justify-center shrink-0">
                      <Hospital className="h-3.5 w-3.5 text-[var(--color-primary)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold text-[var(--color-on-surface)]">{h.hospital_name}</p>
                      <p className="text-[10px] text-[var(--color-on-surface-muted)]">{h.distance_km} km • {h.city} • Beds: {h.available_beds}/{h.total_beds} • ICU: {h.icu_beds}</p>
                      <p className="text-[10px] text-[var(--color-on-surface-muted)]">Emergency: {h.has_emergency} • Ambulance: {h.has_ambulance}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Idle State Info */}
          {stage === "idle" && !intentResult && (
            <div className="card-lifted p-6">
              <h3 className="font-[var(--font-display)] text-[13px] font-semibold tracking-tight text-[var(--color-on-surface)] mb-4">
                How It Works
              </h3>
              <div className="space-y-4">
                {[
                  { icon: Mic, label: "1. Voice Input", desc: "Record audio or upload a file" },
                  { icon: Waves, label: "2. Speech-to-Text", desc: "Whisper AI converts audio to text" },
                  { icon: Brain, label: "3. Intent Detection", desc: "NLP detects: accident, traffic, help, risk" },
                  { icon: ArrowRight, label: "4. Action Routing", desc: "System triggers appropriate response" },
                ].map((step) => (
                  <div key={step.label} className="flex items-start gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-surface-container-high)] shrink-0">
                      <step.icon className="h-4 w-4 text-[var(--color-primary)]" />
                    </div>
                    <div>
                      <p className="text-[12px] font-semibold text-[var(--color-on-surface)]">{step.label}</p>
                      <p className="text-[11px] text-[var(--color-on-surface-muted)]">{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5 pt-4 border-t border-[var(--color-surface-container-high)]">
                <p className="text-[11px] text-[var(--color-on-surface-muted)] font-medium uppercase tracking-wider mb-2">
                  Try saying:
                </p>
                <div className="space-y-1.5">
                  {[
                    "\"Accident near Andheri\"",
                    "\"Show traffic congestion\"",
                    "\"Help! Need an ambulance near Bandra\"",
                    "\"What is the risk level in this area?\"",
                  ].map((example) => (
                    <p key={example} className="text-[12px] text-[var(--color-on-surface-muted)] italic">
                      {example}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
