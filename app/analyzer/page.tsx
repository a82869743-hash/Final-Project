"use client";

import { useState, useRef, useCallback } from "react";
import {
  Upload,
  Mic,
  FileAudio,
  Loader2,
  AlertTriangle,
  Info,
  X,
  Tag,
  Brain,
  Shield,
  Square,
  Siren,
  MapPin,
  Users,
  Zap,
} from "lucide-react";
import { api, type AnalysisResponse } from "@/lib/api";

const severityConfig = {
  critical: { color: "var(--color-error)", icon: AlertTriangle, label: "Critical" },
  warning: { color: "var(--color-warning)", icon: AlertTriangle, label: "Warning" },
  info: { color: "var(--color-info)", icon: Info, label: "Informational" },
};

const severityColors: Record<string, string> = {
  critical: "var(--color-error)",
  high: "#f97316",
  medium: "var(--color-warning)",
  low: "var(--color-success)",
};

export default function AnalyzerPage() {
  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Live recording states
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [streamText, setStreamText] = useState("");
  const [recordingStatus, setRecordingStatus] = useState<string>("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const streamIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Intelligence results
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [parsedData, setParsedData] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [sirenResult, setSirenResult] = useState<any>(null);

  function handleFile(f: File) {
    setFile(f);
    setResult(null);
    setTranscript(null);
    setParsedData(null);
    setSirenResult(null);
    setError(null);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }

  // ── Full AI Analysis (file upload) ──
  async function handleAnalyzeFull() {
    if (!file) return;
    setAnalyzing(true);
    setError(null);
    setResult(null);
    setParsedData(null);
    setSirenResult(null);
    try {
      const res = await api.analyzeFull(file);
      if (res.error) {
        setError(res.error);
      } else {
        setTranscript(res.transcription || "");
        setParsedData(res.parsed || null);
        setSirenResult(res.siren || null);
      }
    } catch (err: any) {
      const msg = err?.message || "";
      if (msg.includes("429") || msg.includes("quota")) {
        setError("OpenAI API quota exceeded. Use the Voice Command page for free browser-based speech recognition.");
      } else {
        setError("Analysis failed. Check backend is running or use Voice Command page.");
      }
    } finally {
      setAnalyzing(false);
    }
  }

  // ── Basic Analysis (backward-compatible) ──
  async function handleAnalyze() {
    if (!file && !transcript) return;
    setAnalyzing(true);
    setError(null);
    setResult(null);
    setParsedData(null);
    try {
      let res;
      if (file) {
        res = await api.analyze(file);
      } else if (transcript) {
        res = await api.analyzeTextBasic(transcript);
      }
      if (res?.error) {
        setError(res.error);
      } else {
        setResult(res || null);
      }
    } catch (err: any) {
      const msg = err?.message || "";
      if (msg.includes("429") || msg.includes("quota")) {
        setError("OpenAI API quota exceeded. Use the Voice Command page instead.");
      } else {
        setError("Analysis failed. Make sure the backend is running.");
      }
    } finally {
      setAnalyzing(false);
    }
  }

  // ── Live Recording with Browser Speech API ──
  const startRecording = useCallback(async () => {
    try {
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SR) {
        setError("Speech Recognition not supported. Use Chrome or Edge.");
        return;
      }

      setIsRecording(true);
      setError(null);
      setTranscript(null);
      setStreamText("");
      setRecordingStatus("Listening...");
      setParsedData(null);
      setSirenResult(null);
      setResult(null);

      const recognition = new SR();
      recognition.lang = "en-US";
      recognition.continuous = true;
      recognition.interimResults = true;
      (window as any).__recognition = recognition;

      let finalText = "";

      recognition.onresult = (event: any) => {
        let interim = "";
        for (let i = 0; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            finalText += event.results[i][0].transcript + " ";
          } else {
            interim += event.results[i][0].transcript;
          }
        }
        const full = (finalText + interim).trim();
        setStreamText(full);
        setRecordingStatus("Detecting...");
      };

      recognition.onerror = (event: any) => {
        if (event.error !== "aborted" && event.error !== "no-speech") {
          console.warn("Speech error:", event.error);
        }
      };

      recognition.onend = () => {
        // Process final text when recognition ends
        const text = finalText.trim();
        if (text && !analyzing) {
          setRecordingStatus("Analyzing...");
          setAnalyzing(true);
          setTranscript(text);
          setStreamText("");

          // Send text to backend for intent classification
          api.textIntent(text).then((res) => {
            if (res.intent) {
              setParsedData({
                location: res.intent.extracted_location?.name || "unknown",
                severity: res.intent.priority === "critical" ? "critical" : res.intent.priority === "high" ? "high" : "medium",
                incident_type: res.intent.intent,
                victim_count: 0,
                key_details: text.slice(0, 150),
              });
            }
          }).catch(() => {
            // Fallback: use local keyword classification
          }).finally(() => {
            setAnalyzing(false);
            setRecordingStatus("");
          });
        }
      };

      recognition.start();

      // Auto-stop after 10 seconds
      setTimeout(() => {
        if ((window as any).__recognition) {
          (window as any).__recognition.stop();
          (window as any).__recognition = null;
          setIsRecording(false);
        }
      }, 10000);
    } catch (err) {
      console.error(err);
      setError("Microphone access denied or unavailable");
    }
  }, [analyzing]);

  function stopRecording() {
    if ((window as any).__recognition) {
      (window as any).__recognition.stop();
      (window as any).__recognition = null;
    }
    setIsRecording(false);
  }

  function clearAll() {
    setFile(null);
    setResult(null);
    setTranscript(null);
    setStreamText("");
    setParsedData(null);
    setSirenResult(null);
    setError(null);
    setRecordingStatus("");
    if (inputRef.current) inputRef.current.value = "";
  }

  const sevCfg = result ? severityConfig[result.severity] : null;

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      {/* ── Upload Section ── */}
      <div className="card-lifted p-6">
        <div className="flex items-center gap-2 mb-4">
          <Mic className="h-5 w-5 text-[var(--color-primary)]" />
          <h3 className="font-[var(--font-display)] text-[15px] font-semibold tracking-tight text-[var(--color-on-surface)]">
            Intelligent Voice Analyzer
          </h3>
          <span className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold bg-[rgba(0,103,127,0.1)] text-[var(--color-primary)] uppercase tracking-wider">
            AI Powered
          </span>
        </div>
        <p className="text-[12px] text-[var(--color-on-surface-muted)] mb-5">
          Upload an audio recording or use your microphone. The AI will transcribe, parse emergency details with GPT, and detect sirens automatically.
        </p>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`relative flex flex-col items-center justify-center rounded-[var(--radius-lg)] border-2 border-dashed px-8 py-12 cursor-pointer transition-all duration-200 ${
            dragActive
              ? "border-[var(--color-primary)] bg-[rgba(0,103,127,0.04)]"
              : file
              ? "border-[var(--color-success)] bg-[rgba(16,185,129,0.04)]"
              : "border-[var(--color-outline-variant)] hover:border-[var(--color-primary)] hover:bg-[rgba(0,103,127,0.02)]"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept="audio/*,.wav,.mp3,.m4a,.ogg,.webm"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />

          {file ? (
            <div className="flex items-center gap-3">
              <FileAudio className="h-8 w-8 text-[var(--color-success)]" />
              <div>
                <p className="text-[13px] font-semibold text-[var(--color-on-surface)]">{file.name}</p>
                <p className="text-[11px] text-[var(--color-on-surface-muted)]">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); clearAll(); }}
                className="ml-4 p-1 rounded-full hover:bg-[var(--color-surface-container-high)] transition-colors"
              >
                <X className="h-4 w-4 text-[var(--color-on-surface-muted)]" />
              </button>
            </div>
          ) : (
            <>
              <Upload className="h-8 w-8 text-[var(--color-on-surface-muted)] mb-3" />
              <p className="text-[13px] font-medium text-[var(--color-on-surface)]">
                Drop audio file here or click to browse
              </p>
              <p className="text-[11px] text-[var(--color-on-surface-muted)] mt-1">
                Supports WAV, MP3, M4A, OGG, WebM
              </p>
            </>
          )}
        </div>

        {/* Live Mic Block */}
        {!file && (
          <div className="mt-4 p-4 border border-[var(--color-surface-container-high)] rounded-lg bg-[rgba(255,255,255,0.01)] flex flex-col items-center justify-center">
            <p className="text-[12px] text-[var(--color-on-surface-muted)] mb-3">Or use your microphone for live analysis:</p>
            {isRecording ? (
              <div className="flex flex-col items-center gap-2">
                <button
                  onClick={stopRecording}
                  className="flex items-center gap-2 px-5 py-2 bg-[var(--color-error)] text-white hover:opacity-90 rounded-full transition-all text-[13px] font-semibold animate-pulse"
                >
                  <Square className="h-4 w-4 fill-current" />
                  {recordingStatus || "Listening..."} Click to stop
                </button>
                {streamText && (
                  <p className="text-[12px] text-[var(--color-on-surface-muted)] italic mt-1 max-w-md text-center">
                    &ldquo;{streamText}&rdquo;
                  </p>
                )}
              </div>
            ) : (
              <button
                onClick={startRecording}
                disabled={analyzing}
                className="flex items-center gap-2 px-5 py-2 bg-[var(--color-surface-container-high)] hover:bg-[var(--color-outline-variant)] text-[var(--color-on-surface)] rounded-full transition-all text-[13px] font-semibold disabled:opacity-50"
              >
                {analyzing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Mic className="h-4 w-4" />
                    Start Live Recording
                  </>
                )}
              </button>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="mt-4 flex items-center gap-3 flex-wrap">
          <button
            onClick={handleAnalyzeFull}
            disabled={!file || analyzing}
            className="btn-primary h-10 px-6 flex items-center gap-2 text-[13px] disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none"
          >
            {analyzing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4" />
                Full AI Analysis
              </>
            )}
          </button>
          <button
            onClick={handleAnalyze}
            disabled={(!file && !transcript) || analyzing}
            className="h-10 px-5 flex items-center gap-2 text-[13px] rounded-[var(--radius-md)] bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] hover:bg-[var(--color-outline-variant)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Brain className="h-4 w-4" />
            Basic Analyze
          </button>
          {error && (
            <span className="text-[11px] text-[var(--color-warning)]">{error}</span>
          )}
        </div>
      </div>

      {/* ── Siren Alert Banner ── */}
      {sirenResult?.siren_detected && (
        <div className="card-lifted p-4 flex items-center gap-3 animate-fade-in border-l-4" style={{ borderColor: "var(--color-error)" }}>
          <Siren className="h-6 w-6 text-[var(--color-error)] animate-pulse" />
          <div className="flex-1">
            <p className="text-[14px] font-bold text-[var(--color-error)]">Siren Detected</p>
            <p className="text-[11px] text-[var(--color-on-surface-muted)]">
              Confidence: {((sirenResult.confidence || 0) * 100).toFixed(0)}% · Spectral Centroid: {sirenResult.spectral_centroid || "N/A"} Hz
            </p>
          </div>
          <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-[var(--color-error)] text-white uppercase">
            Priority Alert
          </span>
        </div>
      )}

      {/* ── GPT Parsed Intelligence ── */}
      {parsedData && (
        <div className="card-lifted p-6 animate-fade-in">
          <div className="flex items-center gap-2 mb-4">
            <Brain className="h-5 w-5 text-[var(--color-primary)]" />
            <h4 className="font-[var(--font-display)] text-[15px] font-semibold text-[var(--color-on-surface)]">
              AI Intelligence Report
            </h4>
            <span className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold bg-[rgba(16,185,129,0.1)] text-[var(--color-success)] uppercase tracking-wider">
              GPT Parsed
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Location */}
            <div className="flex items-start gap-3 p-3 rounded-[var(--radius-md)] bg-[var(--color-surface-container-low)]">
              <MapPin className="h-5 w-5 text-[var(--color-primary)] mt-0.5 shrink-0" />
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-on-surface-muted)] mb-1">Location</p>
                <p className="text-[14px] font-medium text-[var(--color-on-surface)]">{parsedData.location || "Unknown"}</p>
              </div>
            </div>

            {/* Severity */}
            <div className="flex items-start gap-3 p-3 rounded-[var(--radius-md)] bg-[var(--color-surface-container-low)]">
              <Shield className="h-5 w-5 mt-0.5 shrink-0" style={{ color: severityColors[parsedData.severity] || "var(--color-on-surface)" }} />
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-on-surface-muted)] mb-1">Severity</p>
                <span
                  className="inline-flex px-2.5 py-0.5 rounded-full text-[12px] font-bold uppercase"
                  style={{ backgroundColor: `${severityColors[parsedData.severity] || "#666"}20`, color: severityColors[parsedData.severity] || "#666" }}
                >
                  {parsedData.severity || "unknown"}
                </span>
              </div>
            </div>

            {/* Incident Type */}
            <div className="flex items-start gap-3 p-3 rounded-[var(--radius-md)] bg-[var(--color-surface-container-low)]">
              <AlertTriangle className="h-5 w-5 text-[var(--color-warning)] mt-0.5 shrink-0" />
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-on-surface-muted)] mb-1">Incident Type</p>
                <p className="text-[14px] font-medium text-[var(--color-on-surface)] capitalize">{parsedData.incident_type || "other"}</p>
              </div>
            </div>

            {/* Victims */}
            <div className="flex items-start gap-3 p-3 rounded-[var(--radius-md)] bg-[var(--color-surface-container-low)]">
              <Users className="h-5 w-5 text-[var(--color-info)] mt-0.5 shrink-0" />
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-on-surface-muted)] mb-1">Victim Count</p>
                <p className="text-[14px] font-medium text-[var(--color-on-surface)]">{parsedData.victim_count ?? 0}</p>
              </div>
            </div>
          </div>

          {/* Key Details */}
          {parsedData.key_details && (
            <div className="mt-4 p-3 rounded-[var(--radius-md)] bg-[var(--color-surface-container-high)]">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-on-surface-muted)] mb-1">Key Details</p>
              <p className="text-[13px] text-[var(--color-on-surface)]">{parsedData.key_details}</p>
            </div>
          )}
        </div>
      )}

      {/* ── Live Transcription Result ── */}
      {transcript && !result && !parsedData && (
        <div className="card-lifted p-6 animate-fade-in border-l-4" style={{ borderColor: "var(--color-primary)" }}>
          <h4 className="font-[var(--font-display)] text-[14px] font-bold text-[var(--color-on-surface)] mb-2 flex items-center gap-2">
            <Mic className="h-4 w-4 text-[var(--color-primary)]" />
            Live Transcription Result
          </h4>
          <div className="bg-[var(--color-surface-container-low)] p-4 rounded-md">
            <p className="text-[14px] leading-relaxed italic text-[var(--color-on-surface)]">
              Caller said: &ldquo;{transcript}&rdquo;
            </p>
          </div>
        </div>
      )}

      {/* ── Transcription panel (shown alongside parsed data) ── */}
      {transcript && parsedData && (
        <div className="card-lifted p-5 animate-fade-in">
          <h4 className="font-[var(--font-display)] text-[13px] font-semibold tracking-tight text-[var(--color-on-surface)] mb-3 flex items-center gap-2">
            <Mic className="h-4 w-4 text-[var(--color-primary)]" />
            Full Transcription
          </h4>
          <div className="rounded-[var(--radius-md)] bg-[var(--color-surface-container-high)] p-4">
            <p className="text-[13px] leading-relaxed text-[var(--color-on-surface)]">
              &ldquo;{transcript}&rdquo;
            </p>
          </div>
        </div>
      )}

      {/* ── Basic Analyzer Results Section (backward compatible) ── */}
      {result && (
        <div className="space-y-4 animate-fade-in">
          {/* Severity Banner */}
          <div
            className="card-lifted p-4 flex items-center gap-3"
            style={{ borderLeft: `3px solid ${sevCfg?.color}` }}
          >
            {sevCfg && <sevCfg.icon className="h-5 w-5 shrink-0" style={{ color: sevCfg.color }} />}
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span
                  className="font-[var(--font-display)] text-[13px] font-bold uppercase tracking-[0.06em]"
                  style={{ color: sevCfg?.color }}
                >
                  {sevCfg?.label} — {result.category}
                </span>
                <span
                  className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold"
                  style={{
                    backgroundColor: `${sevCfg?.color}15`,
                    color: sevCfg?.color,
                  }}
                >
                  {(result.confidence * 100).toFixed(0)}% confidence
                </span>
              </div>
            </div>
            <Shield className="h-5 w-5 text-[var(--color-primary)]" />
          </div>

          {/* Transcription */}
          <div className="card-lifted p-5">
            <h4 className="font-[var(--font-display)] text-[13px] font-semibold tracking-tight text-[var(--color-on-surface)] mb-3 flex items-center gap-2">
              <Mic className="h-4 w-4 text-[var(--color-primary)]" />
              Transcription
            </h4>
            <div className="rounded-[var(--radius-md)] bg-[var(--color-surface-container-high)] p-4">
              <p className="text-[13px] leading-relaxed text-[var(--color-on-surface)]">
                &ldquo;{result.transcription}&rdquo;
              </p>
            </div>
          </div>

          {/* Keywords + Details */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="card-lifted p-5">
              <h4 className="font-[var(--font-display)] text-[13px] font-semibold tracking-tight text-[var(--color-on-surface)] mb-3 flex items-center gap-2">
                <Tag className="h-4 w-4 text-[var(--color-primary)]" />
                Detected Keywords
              </h4>
              <div className="flex flex-wrap gap-2">
                {result.keywords.map((kw) => (
                  <span
                    key={kw}
                    className="inline-flex px-2.5 py-1 rounded-full text-[11px] font-medium bg-[rgba(0,103,127,0.08)] text-[var(--color-primary)]"
                  >
                    {kw}
                  </span>
                ))}
              </div>
            </div>

            <div className="card-lifted p-5">
              <h4 className="font-[var(--font-display)] text-[13px] font-semibold tracking-tight text-[var(--color-on-surface)] mb-3 flex items-center gap-2">
                <Brain className="h-4 w-4 text-[var(--color-primary)]" />
                Analysis Details
              </h4>
              <div className="space-y-2.5">
                <div className="flex justify-between text-[12px]">
                  <span className="text-[var(--color-on-surface-muted)]">Category</span>
                  <span className="font-semibold text-[var(--color-on-surface)] capitalize">{result.category}</span>
                </div>
                <div className="flex justify-between text-[12px]">
                  <span className="text-[var(--color-on-surface-muted)]">Severity</span>
                  <span className="font-semibold capitalize" style={{ color: sevCfg?.color }}>{result.severity}</span>
                </div>
                <div className="flex justify-between text-[12px]">
                  <span className="text-[var(--color-on-surface-muted)]">Confidence</span>
                  <span className="font-semibold text-[var(--color-on-surface)]">{(result.confidence * 100).toFixed(1)}%</span>
                </div>
                <div className="flex justify-between text-[12px]">
                  <span className="text-[var(--color-on-surface-muted)]">Keywords Found</span>
                  <span className="font-semibold text-[var(--color-on-surface)]">{result.keywords.length}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
