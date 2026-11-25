"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  Mic, MicOff, Upload, Loader2, AlertTriangle, Activity, Ambulance, MapPin, Brain, Waves, FileAudio,
  ArrowRight, Hospital, Siren, CheckCircle2, Send, LocateFixed, Keyboard, BrainCircuit,
} from "lucide-react";
import { api, type RiskFactor } from "@/lib/api";
import type { EmergencyMapData } from "@/components/map/VoiceResultMap";

const VoiceResultMap = dynamic(() => import("@/components/map/VoiceResultMap"), {
  ssr: false,
  loading: () => <div className="w-full h-full flex justify-center items-center bg-[var(--color-surface-container-low)] text-[var(--color-on-surface-muted)] text-[11px]">Loading map…</div>,
});

type ProcessingStage = "idle" | "recording" | "transcribing" | "detecting" | "routing" | "complete";
const STAGES: ProcessingStage[] = ["recording", "transcribing", "detecting", "routing", "complete"];
const MAX_SECONDS = 15;

interface IntentResult {
  intent: string;
  confidence: number;
  action: string;
  description: string;
  priority: string;
  matched_keywords: string[];
  extracted_location: { name: string; latitude: number; longitude: number } | null;
}

interface Ambulance { vehicle_id: string; distance_km: number; estimated_arrival_min: number; status: string }
interface RecHospital { id: string; name: string; city: string; distance_km: number; eta_min: number; ward_available: number; er_wait_min: number; accepting_critical: boolean }
interface EmergencyData extends EmergencyMapData {
  nearest_ambulance?: Ambulance | null;
  all_nearby_ambulances?: (Ambulance & { latitude: number; longitude: number })[];
  recommended_hospitals?: (RecHospital & { lat: number; lng: number })[];
  bed_need?: string;
  dispatched?: { vehicle_id: string; name: string; eta_min: number; then_to: string } | null;
  area_risk?: { level: string; percentile: number; city: string };
}
interface RiskData {
  risk: { risk_level: string; percentile: number; nearest_city: string; p_fatal_or_serious: number; factors: RiskFactor[] };
  profile?: { slots: string[]; slot_share: (number | null)[] } | null;
}
interface ActionResult {
  type: "emergency" | "help" | "risk" | "traffic" | "general" | "need_location" | "error";
  message: string;
  location_source?: string;
  data: EmergencyData | RiskData | null;
}

/* Minimal typing for the browser Web Speech API */
interface SpeechRecognitionLike {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((e: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
type SRCtor = new () => SpeechRecognitionLike;

const EXAMPLES = [
  "Accident near Andheri, two people are bleeding",
  "Need an ambulance in Koramangala",
  "Fire at Connaught Place",
  "Is it risky near Delhi right now?",
  "Heavy traffic at Silk Board",
];

const LEVEL_COLOR: Record<string, string> = { High: "#dc2626", Medium: "#d97706", Low: "#16a34a" };

export default function VoiceCommandPage() {
  const [stage, setStage] = useState<ProcessingStage>("idle");
  const [isRecording, setIsRecording] = useState(false);
  const [transcription, setTranscription] = useState("");
  const [intentResult, setIntentResult] = useState<IntentResult | null>(null);
  const [actionResult, setActionResult] = useState<ActionResult | null>(null);
  const [error, setError] = useState("");
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [lang, setLang] = useState("en-IN");
  const [typed, setTyped] = useState("");
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [geoState, setGeoState] = useState<"off" | "asking" | "on" | "denied">("off");
  const [speechSupported, setSpeechSupported] = useState(true);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const liveTextRef = useRef("");
  const geoRef = useRef<{ lat: number; lng: number } | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
    const supported = !!(w.SpeechRecognition || w.webkitSpeechRecognition);
    const t = setTimeout(() => setSpeechSupported(supported), 0);
    return () => clearTimeout(t);
  }, []);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) { setGeoState("denied"); return; }
    setGeoState("asking");
    navigator.geolocation.getCurrentPosition(
      (p) => { const g = { lat: p.coords.latitude, lng: p.coords.longitude }; geoRef.current = g; setGeo(g); setGeoState("on"); },
      () => setGeoState("denied"),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }, []);

  /* ── tear down mic / recognizer / timers (safe to call repeatedly) ── */
  const teardown = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (autoStopRef.current) { clearTimeout(autoStopRef.current); autoStopRef.current = null; }
    if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null; }
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    if (rec) { rec.onend = null; try { rec.stop(); } catch { /* already stopped */ } }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
    setAudioLevel(0);
    setIsRecording(false);
  }, []);

  useEffect(() => () => teardown(), [teardown]);

  const runPipeline = useCallback(async (fetcher: () => Promise<{ transcription?: string; whisper_error?: string; intent: IntentResult; action_result: ActionResult }>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setError(""); setIntentResult(null); setActionResult(null);
    try {
      setStage("transcribing");
      const result = await fetcher();
      if (result.whisper_error && !result.transcription) throw new Error(result.whisper_error);
      if (result.transcription) setTranscription(result.transcription);
      setStage("detecting");
      setIntentResult(result.intent);
      await new Promise((r) => setTimeout(r, 250));
      setStage("routing");
      setActionResult(result.action_result);
      await new Promise((r) => setTimeout(r, 250));
      setStage("complete");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process. Is the backend running?");
      setStage("idle");
    } finally {
      busyRef.current = false;
    }
  }, []);

  const processText = useCallback((text: string) => {
    const g = geoRef.current;
    setTranscription(text);
    return runPipeline(async () => {
      const r = await api.textIntent(text, g?.lat, g?.lng);
      return r as unknown as { transcription: string; intent: IntentResult; action_result: ActionResult };
    });
  }, [runPipeline]);

  const stopRecording = useCallback(() => {
    if (!recognitionRef.current) return; // already stopped (button + auto-stop + onend can all fire)
    teardown();
    // give the recognizer a moment to flush its final result
    setTimeout(() => {
      const text = liveTextRef.current.trim();
      if (text) processText(text);
      else { setError("No speech detected. Speak clearly, or type the call below."); setStage("idle"); }
    }, 350);
  }, [teardown, processText]);

  const startRecording = useCallback(async () => {
    const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) { setError("Live speech recognition needs Chrome or Edge — type the call below or upload audio."); return; }
    setError(""); setTranscription(""); setIntentResult(null); setActionResult(null);
    liveTextRef.current = "";
    if (geoState === "off") requestLocation();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(analyser);
      analyserRef.current = analyser;
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(buf);
        setAudioLevel(buf.reduce((a, b) => a + b, 0) / buf.length / 128);
        animFrameRef.current = requestAnimationFrame(tick);
      };
      tick();

      const rec = new SR();
      rec.lang = lang;
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = (event) => {
        let finalT = "", interimT = "";
        for (let i = 0; i < event.results.length; i++) {
          if (event.results[i].isFinal) finalT += event.results[i][0].transcript + " ";
          else interimT += event.results[i][0].transcript;
        }
        liveTextRef.current = (finalT + interimT).trim();
        setTranscription(liveTextRef.current);
      };
      rec.onerror = (e) => {
        if (e.error === "not-allowed") setError("Microphone permission denied.");
        else if (e.error === "network") setError("Speech service unreachable (needs internet). Type the call below instead.");
      };
      // Chrome ends recognition on long silence: finish the pipeline instead of hanging
      rec.onend = () => { if (recognitionRef.current === rec) stopRecording(); };
      recognitionRef.current = rec;
      rec.start();

      setIsRecording(true);
      setStage("recording");
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);
      autoStopRef.current = setTimeout(() => stopRecording(), MAX_SECONDS * 1000);
    } catch {
      teardown();
      setError("Microphone access denied. Allow microphone permissions, or type the call below.");
      setStage("idle");
    }
  }, [lang, geoState, requestLocation, stopRecording, teardown]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-uploading the same file
    if (!file) return;
    setTranscription("");
    const g = geoRef.current;
    await runPipeline(async () => {
      const fd = new FormData();
      fd.append("file", file);
      if (g) { fd.append("latitude", String(g.lat)); fd.append("longitude", String(g.lng)); }
      const { API_BASE } = await import("@/lib/api");
      const res = await fetch(`${API_BASE}/voice-intent`, { method: "POST", body: fd });
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      return res.json();
    });
  };

  const submitTyped = (text = typed) => {
    const t = text.trim();
    if (!t || busyRef.current) return;
    setTyped("");
    processText(t);
  };

  const resetState = () => {
    teardown();
    setStage("idle"); setTranscription(""); setIntentResult(null); setActionResult(null);
    setError(""); setRecordingTime(0);
  };

  const priorityColor = (p: string) => p === "critical" ? "var(--color-error)" : p === "high" ? "var(--color-warning)" : p === "normal" ? "var(--color-info)" : "var(--color-on-surface-muted)";
  const busy = stage === "transcribing" || stage === "detecting" || stage === "routing";
  const isEmergency = actionResult && (actionResult.type === "emergency" || actionResult.type === "help") && actionResult.data;
  const emergency = isEmergency ? (actionResult!.data as EmergencyData) : null;
  const riskData = actionResult && (actionResult.type === "risk" || actionResult.type === "traffic") ? (actionResult.data as RiskData) : null;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-[var(--font-display)] text-[22px] font-bold tracking-tight text-[var(--color-on-surface)]">Voice Command Center</h1>
          <p className="text-[13px] text-[var(--color-on-surface-muted)] mt-1">Speak, type or upload an emergency call — intent, location and response are handled automatically</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={requestLocation}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-[var(--radius-md)] text-[11px] font-semibold ${geoState === "on" ? "bg-[var(--color-success)]/10 text-[var(--color-success)]" : "bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-muted)]"}`}>
            {geoState === "asking" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LocateFixed className="h-3.5 w-3.5" />}
            {geoState === "on" && geo ? `GPS ${geo.lat.toFixed(3)}, ${geo.lng.toFixed(3)}` : geoState === "denied" ? "Location blocked" : "Use my location"}
          </button>
          {stage !== "idle" && (
            <button onClick={resetState} className="px-4 py-2 rounded-[var(--radius-md)] bg-[var(--color-surface-container-high)] text-[12px] font-medium text-[var(--color-on-surface-muted)] hover:text-[var(--color-on-surface)]">Reset</button>
          )}
        </div>
      </div>

      {/* Pipeline Progress */}
      <div className="card-lifted p-4 overflow-x-auto">
        <div className="flex items-center gap-3 min-w-[560px]">
          {STAGES.map((s, i) => {
            const names = ["Voice Input", "Transcription", "Intent Detection", "Action Routing", "Complete"];
            const Icon = [Mic, Waves, Brain, ArrowRight, CheckCircle2][i];
            const isActive = stage === s;
            const isPast = STAGES.indexOf(stage) > i;
            return (
              <div key={s} className="flex items-center gap-3 flex-1">
                <div className={`flex items-center gap-2 px-3 py-2 rounded-[var(--radius-md)] transition-all duration-300 flex-1 ${isActive ? "bg-[var(--color-primary)] text-white shadow-lg" : isPast ? "bg-[rgba(0,103,127,0.1)] text-[var(--color-primary)]" : "bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-muted)]"}`}>
                  {isActive && s !== "complete" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
                  <span className="text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap">{names[i]}</span>
                </div>
                {i < 4 && <div className={`h-[2px] w-4 rounded-full shrink-0 ${isPast ? "bg-[var(--color-primary)]" : "bg-[var(--color-surface-container-high)]"}`} />}
              </div>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-[var(--radius-md)] bg-[rgba(239,68,68,0.06)] px-4 py-3 animate-fade-in">
          <AlertTriangle className="h-4 w-4 text-[var(--color-error)] shrink-0" />
          <span className="text-[12px] font-medium text-[var(--color-error)]">{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Left: inputs */}
        <div className="space-y-4">
          <div className="card-lifted p-6 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-[rgba(0,103,127,0.03)] to-transparent" />
            <div className="relative z-10">
              <h3 className="font-[var(--font-display)] text-[13px] font-semibold tracking-tight text-[var(--color-on-surface)] mb-4 flex items-center gap-2">
                <Mic className="h-4 w-4 text-[var(--color-primary)]" /> Live Microphone
                <select value={lang} onChange={(e) => setLang(e.target.value)} disabled={isRecording}
                  className="ml-auto text-[10px] font-semibold bg-[var(--color-surface-container-high)] rounded px-2 py-1 outline-none">
                  <option value="en-IN">English (India)</option>
                  <option value="hi-IN">हिन्दी (Hindi)</option>
                  <option value="en-US">English (US)</option>
                </select>
              </h3>
              <div className="flex flex-col items-center py-6">
                <div className="relative mb-6">
                  <div className="absolute inset-0 rounded-full transition-all duration-150" style={{
                    transform: `scale(${1 + audioLevel * 0.5})`,
                    background: isRecording ? `radial-gradient(circle, rgba(239,68,68,${0.1 + audioLevel * 0.2}) 0%, transparent 70%)` : "transparent",
                  }} />
                  <button onClick={isRecording ? stopRecording : startRecording} disabled={busy || !speechSupported}
                    aria-label={isRecording ? "Stop recording" : "Start recording"}
                    className={`relative h-20 w-20 rounded-full flex items-center justify-center transition-all duration-300 ${isRecording ? "bg-[var(--color-error)] text-white shadow-[0_0_20px_rgba(239,68,68,0.4)] animate-pulse" : "bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-dim)] text-white shadow-lg hover:shadow-xl hover:scale-105"} disabled:opacity-40 disabled:cursor-not-allowed`}>
                    {isRecording ? <MicOff className="h-8 w-8" /> : <Mic className="h-8 w-8" />}
                  </button>
                </div>
                <p className="text-[12px] text-[var(--color-on-surface-muted)] text-center">
                  {!speechSupported ? "Live recognition needs Chrome or Edge — type or upload below"
                    : isRecording ? `Listening… ${recordingTime}s — tap to finish (auto-stops at ${MAX_SECONDS}s)`
                      : busy ? "Processing…" : "Tap and describe the emergency"}
                </p>
                {isRecording && (
                  <div className="w-full mt-4 h-1.5 rounded-full bg-[var(--color-surface-container-high)] overflow-hidden">
                    <div className="h-full bg-[var(--color-error)] rounded-full transition-all duration-1000" style={{ width: `${(recordingTime / MAX_SECONDS) * 100}%` }} />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Type a call */}
          <div className="card-lifted p-5">
            <h3 className="font-[var(--font-display)] text-[13px] font-semibold text-[var(--color-on-surface)] mb-3 flex items-center gap-2">
              <Keyboard className="h-4 w-4 text-[var(--color-primary)]" /> Type the Call
            </h3>
            <form onSubmit={(e) => { e.preventDefault(); submitTyped(); }} className="flex gap-2">
              <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="e.g. Accident near Andheri, two injured"
                className="flex-1 text-[12px] bg-[var(--color-surface-container-low)] rounded-[var(--radius-md)] px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30" />
              <button type="submit" disabled={busy || !typed.trim()} className="btn-primary px-3 rounded-[var(--radius-md)] disabled:opacity-40" aria-label="Send">
                <Send className="h-4 w-4" />
              </button>
            </form>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {EXAMPLES.map((ex) => (
                <button key={ex} onClick={() => submitTyped(ex)} disabled={busy}
                  className="text-[10px] px-2 py-1 rounded-full bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-muted)] hover:text-[var(--color-primary)] disabled:opacity-40">
                  {ex}
                </button>
              ))}
            </div>
          </div>

          <div className="card-lifted p-5">
            <h3 className="font-[var(--font-display)] text-[13px] font-semibold text-[var(--color-on-surface)] mb-3 flex items-center gap-2">
              <FileAudio className="h-4 w-4 text-[var(--color-primary)]" /> Upload Call Recording
            </h3>
            <label className={`flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-[var(--color-surface-container-high)] rounded-[var(--radius-md)] transition-all ${busy ? "opacity-40 cursor-not-allowed" : "cursor-pointer hover:border-[var(--color-primary)] hover:bg-[rgba(0,103,127,0.02)]"}`}>
              <Upload className="h-5 w-5 text-[var(--color-on-surface-muted)] mb-1" />
              <span className="text-[11px] text-[var(--color-on-surface-muted)]">Drop audio or click to browse</span>
              <span className="text-[10px] text-[var(--color-on-surface-muted)] opacity-60 mt-0.5">.wav .mp3 .webm .ogg .m4a · transcribed with Whisper (needs OpenAI key)</span>
              <input type="file" accept="audio/*" className="hidden" onChange={handleFileUpload} disabled={busy || isRecording} />
            </label>
          </div>

          {transcription && (
            <div className="card-lifted p-5 animate-fade-in">
              <h3 className="font-[var(--font-display)] text-[13px] font-semibold text-[var(--color-on-surface)] mb-3 flex items-center gap-2">
                <Waves className="h-4 w-4 text-[var(--color-primary)]" /> Transcription
                <span className="ml-auto px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-[rgba(16,185,129,0.1)] text-[var(--color-success)]">{isRecording ? "Listening" : "Final"}</span>
              </h3>
              <p className="text-[13px] text-[var(--color-on-surface)] leading-relaxed bg-[var(--color-surface-container-low)] rounded-[var(--radius-sm)] p-3 italic">&ldquo;{transcription}&rdquo;</p>
            </div>
          )}
        </div>

        {/* Right: results */}
        <div className="space-y-4">
          {intentResult && (
            <div className="card-lifted p-5 animate-fade-in">
              <h3 className="font-[var(--font-display)] text-[13px] font-semibold text-[var(--color-on-surface)] mb-4 flex items-center gap-2">
                <Brain className="h-4 w-4 text-[var(--color-primary)]" /> Intent Detection
              </h3>
              <div className="space-y-3">
                <Row label="Detected intent">
                  <span className="px-3 py-1 rounded-full text-[12px] font-bold uppercase" style={{ backgroundColor: `color-mix(in srgb, ${priorityColor(intentResult.priority)} 12%, transparent)`, color: priorityColor(intentResult.priority) }}>{intentResult.intent}</span>
                </Row>
                <Row label="Confidence">
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-1.5 rounded-full bg-[var(--color-surface-container-high)] overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${intentResult.confidence * 100}%`, backgroundColor: priorityColor(intentResult.priority) }} />
                    </div>
                    <span className="font-[var(--font-display)] text-[12px] font-bold" style={{ color: priorityColor(intentResult.priority) }}>{(intentResult.confidence * 100).toFixed(0)}%</span>
                  </div>
                </Row>
                <Row label="Priority"><span className="text-[12px] font-semibold capitalize" style={{ color: priorityColor(intentResult.priority) }}>{intentResult.priority}</span></Row>
                {intentResult.matched_keywords.length > 0 && (
                  <div>
                    <span className="text-[11px] text-[var(--color-on-surface-muted)] uppercase tracking-wider font-semibold">Matched keywords</span>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {intentResult.matched_keywords.map((kw) => <span key={kw} className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--color-surface-container-high)]">{kw}</span>)}
                    </div>
                  </div>
                )}
                {intentResult.extracted_location && (
                  <div className="flex items-center gap-2 mt-2 px-3 py-2 rounded-[var(--radius-sm)] bg-[var(--color-surface-container-low)]">
                    <MapPin className="h-3.5 w-3.5 text-[var(--color-primary)]" />
                    <span className="text-[12px] font-medium">{intentResult.extracted_location.name}</span>
                    <span className="text-[10px] text-[var(--color-on-surface-muted)]">({intentResult.extracted_location.latitude.toFixed(3)}, {intentResult.extracted_location.longitude.toFixed(3)})</span>
                    {actionResult?.location_source && <span className="ml-auto text-[9px] font-bold uppercase text-[var(--color-on-surface-muted)]">{actionResult.location_source === "device-gps" ? "GPS" : "from speech"}</span>}
                  </div>
                )}
              </div>
            </div>
          )}

          {actionResult && (
            <div className="card-lifted p-5 animate-fade-in">
              <h3 className="font-[var(--font-display)] text-[13px] font-semibold text-[var(--color-on-surface)] mb-4 flex items-center gap-2">
                <Activity className="h-4 w-4 text-[var(--color-primary)]" /> Action Result
              </h3>
              <div className="bg-[var(--color-surface-container-low)] rounded-[var(--radius-md)] p-4 space-y-3">
                <p className="text-[12px] font-medium text-[var(--color-on-surface)]">{actionResult.message}</p>

                {actionResult.type === "need_location" && (
                  <button onClick={requestLocation} className="btn-primary text-[11px] px-3 py-1.5 rounded-md flex items-center gap-1.5">
                    <LocateFixed className="h-3.5 w-3.5" /> Share my location
                  </button>
                )}

                {emergency?.dispatched && (
                  <div className="flex items-start gap-3 p-3 rounded-[var(--radius-sm)] bg-[var(--color-error)]/8 border-l-[3px] border-[var(--color-error)]">
                    <Siren className="h-5 w-5 text-[var(--color-error)] mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[12px] font-bold text-[var(--color-on-surface)]">{emergency.dispatched.name} dispatched · ETA {emergency.dispatched.eta_min} min</p>
                      <p className="text-[11px] text-[var(--color-on-surface-muted)]">Then transport to {emergency.dispatched.then_to}. Track it on <Link href="/tracking" className="underline text-[var(--color-primary)]">Fleet Tracking</Link>.</p>
                    </div>
                  </div>
                )}
                {emergency && !emergency.dispatched && emergency.nearest_ambulance && (
                  <div className="flex items-start gap-3 p-3 rounded-[var(--radius-sm)] bg-[var(--color-surface)]">
                    <Siren className="h-5 w-5 text-[var(--color-error)] mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[12px] font-semibold">Nearest ambulance: {emergency.nearest_ambulance.vehicle_id}</p>
                      <p className="text-[11px] text-[var(--color-on-surface-muted)]">{emergency.nearest_ambulance.distance_km} km · ETA {emergency.nearest_ambulance.estimated_arrival_min} min · {emergency.nearest_ambulance.status}</p>
                      <Link href="/dispatch" className="text-[11px] underline text-[var(--color-primary)]">Open Dispatch to assign manually</Link>
                    </div>
                  </div>
                )}
                {emergency?.recommended_hospitals && emergency.recommended_hospitals.length > 0 && (
                  <div className="p-3 rounded-[var(--radius-sm)] bg-[var(--color-surface)]">
                    <p className="text-[11px] font-bold mb-2 flex items-center gap-1.5"><Hospital className="h-4 w-4 text-[var(--color-primary)]" /> Best hospitals by live {emergency.bed_need?.toUpperCase()} availability</p>
                    <ol className="space-y-1.5">
                      {emergency.recommended_hospitals.map((h, i) => (
                        <li key={h.id} className="flex items-center gap-2 text-[11px]">
                          <span className="font-bold text-[var(--color-primary)] w-4">{i + 1}</span>
                          <span className="flex-1 min-w-0"><b>{h.name}</b> <span className="text-[var(--color-on-surface-muted)]">· {h.distance_km} km · ~{h.eta_min} min · {h.ward_available} free · ER {h.er_wait_min} min</span></span>
                          {!h.accepting_critical && <span className="text-[9px] font-bold text-[var(--color-error)]">DIVERSION</span>}
                        </li>
                      ))}
                    </ol>
                    <Link href="/hospitals" className="text-[10px] underline text-[var(--color-primary)]">Open live hospital monitor</Link>
                  </div>
                )}
                {emergency?.area_risk && (
                  <p className="text-[11px] text-[var(--color-on-surface-muted)]">Area risk now: <b style={{ color: LEVEL_COLOR[emergency.area_risk.level] }}>{emergency.area_risk.level}</b> ({emergency.area_risk.percentile.toFixed(0)}th percentile, {emergency.area_risk.city})</p>
                )}

                {riskData && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <span className="font-[var(--font-display)] text-2xl font-bold" style={{ color: LEVEL_COLOR[riskData.risk.risk_level] }}>{riskData.risk.risk_level}</span>
                      <span className="text-[11px] text-[var(--color-on-surface-muted)]">{riskData.risk.percentile.toFixed(0)}th pct · P(fatal/serious) {(riskData.risk.p_fatal_or_serious * 100).toFixed(1)}%</span>
                    </div>
                    {riskData.risk.factors.map((f) => (
                      <div key={f.factor} className="text-[11px] flex gap-2">
                        <span className="font-semibold w-36 shrink-0">{f.factor}</span>
                        <span className="text-[var(--color-on-surface-muted)]">{f.value} — {f.detail}</span>
                      </div>
                    ))}
                    <Link href="/risk" className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--color-primary)]"><BrainCircuit className="h-3.5 w-3.5" /> Explore in Risk AI</Link>
                  </div>
                )}
              </div>
            </div>
          )}

          {stage === "complete" && emergency && (
            <div className="card-lifted overflow-hidden animate-fade-in">
              <div className="px-4 pt-3 pb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-[13px] font-semibold flex items-center gap-2"><MapPin className="h-4 w-4 text-[var(--color-primary)]" /> Emergency Response Map</h3>
                <div className="flex items-center gap-3 text-[10px]">
                  <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-[#f59e0b]" />Incident</span>
                  <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-[#dc2626]" />Ambulance</span>
                  <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-[#1d4ed8]" />Hospital</span>
                </div>
              </div>
              <div style={{ height: 320 }}><VoiceResultMap data={emergency} /></div>
            </div>
          )}

          {stage === "complete" && emergency && (
            <div className="card-lifted p-4 animate-fade-in">
              <h4 className="text-[12px] font-semibold mb-3 flex items-center gap-2"><Ambulance className="h-4 w-4 text-[var(--color-error)]" /> Nearby Ambulances ({emergency.all_nearby_ambulances?.length || 0})</h4>
              <div className="space-y-2">
                {(emergency.all_nearby_ambulances || []).map((a) => (
                  <div key={a.vehicle_id} className="flex items-center gap-3 p-2.5 rounded-[var(--radius-sm)] bg-[var(--color-surface-container-low)]">
                    <div className="h-7 w-7 rounded-full bg-[rgba(239,68,68,0.15)] flex items-center justify-center shrink-0"><Siren className="h-3.5 w-3.5 text-[var(--color-error)]" /></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold">{a.vehicle_id}{a.vehicle_id === emergency.dispatched?.vehicle_id && <span className="ml-2 text-[9px] font-bold text-[var(--color-error)]">DISPATCHED</span>}</p>
                      <p className="text-[10px] text-[var(--color-on-surface-muted)]">{a.distance_km} km · ETA {a.estimated_arrival_min} min · {a.status}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {stage === "idle" && !intentResult && (
            <div className="card-lifted p-6">
              <h3 className="font-[var(--font-display)] text-[13px] font-semibold text-[var(--color-on-surface)] mb-4">How It Works</h3>
              <div className="space-y-4">
                {[
                  { icon: Mic, label: "1. Voice / text input", desc: "Browser speech recognition (Indian English or Hindi), typed text, or an uploaded recording (Whisper)" },
                  { icon: Brain, label: "2. Intent detection", desc: "Word-boundary keyword NLP: accident, fire, help, traffic or risk, with urgency-weighted scoring" },
                  { icon: MapPin, label: "3. Location", desc: "Place names geocoded with OpenStreetMap (offline city fallback), else your device GPS" },
                  { icon: ArrowRight, label: "4. Action", desc: "Auto-dispatch nearest free ambulance, rank hospitals by live beds, or run the real-data risk engine" },
                ].map((step) => (
                  <div key={step.label} className="flex items-start gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-surface-container-high)] shrink-0"><step.icon className="h-4 w-4 text-[var(--color-primary)]" /></div>
                    <div>
                      <p className="text-[12px] font-semibold">{step.label}</p>
                      <p className="text-[11px] text-[var(--color-on-surface-muted)]">{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-[var(--color-on-surface-muted)] uppercase tracking-wider font-semibold">{label}</span>
      {children}
    </div>
  );
}
