"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Server,
  Database,
  Wifi,
  Brain,
  Mic,
  Shield,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
  ToggleLeft,
  ToggleRight,
  Save,
} from "lucide-react";
import { api, type HealthStatus } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";

interface ServiceStatus {
  name: string;
  icon: React.ElementType;
  status: "online" | "offline" | "degraded";
  latency: string;
  description: string;
}

interface SettingToggle {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
}

const defaultToggles: SettingToggle[] = [
  { id: "auto_dispatch", label: "Auto-Dispatch", description: "Automatically assign nearest available ambulance to critical incidents", enabled: true },
  { id: "ai_prediction", label: "AI Risk Prediction", description: "Enable XGBoost-based zone risk scoring", enabled: true },
  { id: "audio_analysis", label: "Call Audio Analysis", description: "Automatically analyze incoming emergency calls with Whisper", enabled: false },
  { id: "realtime_tracking", label: "Real-Time Tracking", description: "Stream live GPS data via WebSocket", enabled: true },
  { id: "alert_notifications", label: "Alert Notifications", description: "Push browser notifications for critical alerts", enabled: true },
  { id: "dark_mode", label: "Dark Mode", description: "Switch to dark tactical interface (coming soon)", enabled: false },
];

function loadToggles(): SettingToggle[] {
  if (typeof window === "undefined") return defaultToggles;
  try {
    const saved = localStorage.getItem("aegis_settings");
    if (saved) {
      const parsed = JSON.parse(saved) as Record<string, boolean>;
      return defaultToggles.map((t) => ({
        ...t,
        enabled: parsed[t.id] !== undefined ? parsed[t.id] : t.enabled,
      }));
    }
  } catch { /* ignore */ }
  return defaultToggles;
}

function saveToggles(toggles: SettingToggle[]) {
  if (typeof window === "undefined") return;
  const map: Record<string, boolean> = {};
  toggles.forEach((t) => (map[t.id] = t.enabled));
  localStorage.setItem("aegis_settings", JSON.stringify(map));
}

export default function SettingsPage() {
  const { showToast } = useToast();

  const [services, setServices] = useState<ServiceStatus[]>([
    { name: "FastAPI Backend", icon: Server, status: "offline", latency: "—", description: "Core REST API server" },
    { name: "Supabase", icon: Database, status: "offline", latency: "—", description: "Database & Auth" },
    { name: "WebSocket", icon: Wifi, status: "offline", latency: "—", description: "Real-time vehicle feed" },
    { name: "XGBoost Model", icon: Brain, status: "offline", latency: "—", description: "Risk prediction engine" },
    { name: "Whisper API", icon: Mic, status: "offline", latency: "—", description: "Audio transcription" },
  ]);

  const [toggles, setToggles] = useState<SettingToggle[]>(defaultToggles);
  const [checking, setChecking] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Load saved settings on mount
  useEffect(() => {
    setToggles(loadToggles());
  }, []);

  const checkServices = useCallback(async () => {
    setChecking(true);

    // Run ALL checks in parallel for speed (don't wait for ping before health)
    const [pingResult, healthResult, wsResult] = await Promise.allSettled([
      // 1. Ping backend root
      api.ping(),
      // 2. Health endpoint (subsystem status)
      api.health().catch(() => null),
      // 3. WebSocket connectivity
      new Promise<boolean>((resolve) => {
        try {
          const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "wss://final-project-qly6.onrender.com/ws";
          const ws = new WebSocket(wsUrl);
          const timer = setTimeout(() => { try { ws.close(); } catch {} resolve(false); }, 8000);
          ws.onopen = () => { clearTimeout(timer); ws.close(); resolve(true); };
          ws.onerror = () => { clearTimeout(timer); resolve(false); };
        } catch { resolve(false); }
      }),
    ]);

    const ping = pingResult.status === "fulfilled" ? pingResult.value : { ok: false, latency: 0 };
    const health = healthResult.status === "fulfilled" ? healthResult.value : null;
    const wsOk = wsResult.status === "fulfilled" ? wsResult.value : false;

    setServices([
      // FastAPI Backend
      {
        name: "FastAPI Backend", icon: Server, description: "Core REST API server",
        status: ping.ok ? "online" : "offline",
        latency: ping.ok ? `${ping.latency}ms` : "—",
      },
      // Supabase
      {
        name: "Supabase", icon: Database,
        description: health?.supabase?.status === "degraded" ? "Configure SUPABASE_URL & SUPABASE_KEY" : "Database & Auth",
        status: health?.supabase?.status || "offline",
        latency: health?.supabase?.latency || "—",
      },
      // WebSocket
      {
        name: "WebSocket", icon: Wifi, description: "Real-time vehicle feed",
        status: wsOk ? "online" : "offline",
        latency: wsOk ? "Connected" : "—",
      },
      // XGBoost Model
      {
        name: "XGBoost Model", icon: Brain, description: "Risk prediction engine",
        status: health?.ml_model?.status || "offline",
        latency: health?.ml_model?.latency || "—",
      },
      // Whisper API
      {
        name: "Whisper API", icon: Mic,
        description: health?.whisper?.status === "degraded" ? "Running in mock mode" : "Audio transcription",
        status: health?.whisper?.status || "offline",
        latency: health?.whisper?.latency || "—",
      },
    ]);

    setChecking(false);

    const onlineCount = [ping.ok, health?.supabase?.status === "online", wsOk, health?.ml_model?.status === "online", health?.whisper?.status === "online"]
      .filter(Boolean).length;
    showToast(
      `Health check complete — ${onlineCount}/5 services online`,
      onlineCount === 5 ? "success" : onlineCount > 0 ? "warning" : "error"
    );
  }, [showToast]);

  useEffect(() => {
    checkServices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleSetting(id: string) {
    setToggles((prev) => {
      const updated = prev.map((t) => (t.id === id ? { ...t, enabled: !t.enabled } : t));
      setHasChanges(true);
      return updated;
    });
  }

  function handleSaveSettings() {
    saveToggles(toggles);
    setHasChanges(false);
    showToast("Settings saved successfully", "success");
  }

  const statusIcon = (status: "online" | "offline" | "degraded") => {
    if (status === "online") return CheckCircle;
    if (status === "degraded") return AlertCircle;
    return XCircle;
  };

  const statusColors = {
    online: { color: "var(--color-success)", label: "Online" },
    offline: { color: "var(--color-error)", label: "Offline" },
    degraded: { color: "var(--color-warning)", label: "Degraded" },
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      {/* ── System Status ── */}
      <div className="card-lifted p-5">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-[var(--color-primary)]" />
            <h3 className="font-[var(--font-display)] text-[15px] font-semibold tracking-tight text-[var(--color-on-surface)]">
              System Status
            </h3>
          </div>
          <button
            onClick={checkServices}
            disabled={checking}
            className="flex items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-surface-container-low)] px-3 py-1.5 text-[11px] font-medium text-[var(--color-on-surface-muted)] transition-colors hover:bg-[var(--color-surface-container-high)] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${checking ? "animate-spin" : ""}`} />
            {checking ? "Checking..." : "Refresh"}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((svc, idx) => {
            const sc = statusColors[svc.status];
            const StatusIcon = statusIcon(svc.status);
            return (
              <div
                key={svc.name}
                className="flex items-start gap-3 rounded-[var(--radius-md)] bg-[var(--color-surface-container-low)] p-4 transition-all hover:bg-[var(--color-surface-container-high)] animate-fade-in"
                style={{ animationDelay: `${idx * 0.05}s` }}
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-surface)]">
                  <svc.icon className="h-4 w-4 text-[var(--color-primary)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-[var(--color-on-surface)]">
                      {svc.name}
                    </span>
                    <StatusIcon className="h-3.5 w-3.5" style={{ color: sc.color }} />
                  </div>
                  <p className="text-[11px] text-[var(--color-on-surface-muted)] mt-0.5">
                    {svc.description}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span
                      className="status-glow"
                      style={{ backgroundColor: sc.color, color: sc.color }}
                    />
                    <span className="text-[10px] font-medium" style={{ color: sc.color }}>
                      {sc.label}
                    </span>
                    <span className="text-[10px] text-[var(--color-on-surface-muted)]">
                      {svc.latency}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Feature Toggles ── */}
      <div className="card-lifted p-5">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-[var(--font-display)] text-[15px] font-semibold tracking-tight text-[var(--color-on-surface)]">
            Feature Toggles
          </h3>
          <button
            onClick={handleSaveSettings}
            disabled={!hasChanges}
            className={`flex items-center gap-1.5 rounded-[var(--radius-md)] px-3 py-1.5 text-[11px] font-medium transition-all ${
              hasChanges
                ? "bg-[var(--color-primary)] text-white shadow-[var(--shadow-glow-cyan)] hover:opacity-90"
                : "bg-[var(--color-surface-container-low)] text-[var(--color-on-surface-muted)] opacity-50 cursor-not-allowed"
            }`}
          >
            <Save className="h-3.5 w-3.5" />
            {hasChanges ? "Save Changes" : "Saved"}
          </button>
        </div>

        <div className="space-y-1">
          {toggles.map((toggle, idx) => (
            <div
              key={toggle.id}
              className="flex items-center justify-between rounded-[var(--radius-md)] px-4 py-3.5 transition-colors hover:bg-[var(--color-surface-container-low)] animate-fade-in"
              style={{ animationDelay: `${idx * 0.04}s` }}
            >
              <div className="flex-1 min-w-0 mr-4">
                <p className="text-[13px] font-medium text-[var(--color-on-surface)]">
                  {toggle.label}
                </p>
                <p className="text-[11px] text-[var(--color-on-surface-muted)] mt-0.5">
                  {toggle.description}
                </p>
              </div>
              <button
                onClick={() => toggleSetting(toggle.id)}
                className="shrink-0 transition-colors"
              >
                {toggle.enabled ? (
                  <ToggleRight className="h-7 w-7 text-[var(--color-primary)]" />
                ) : (
                  <ToggleLeft className="h-7 w-7 text-[var(--color-outline-variant)]" />
                )}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ── Environment Info ── */}
      <div className="card-lifted p-5">
        <h3 className="font-[var(--font-display)] text-[15px] font-semibold tracking-tight text-[var(--color-on-surface)] mb-4">
          Environment
        </h3>
        <div className="rounded-[var(--radius-md)] bg-[var(--color-surface-container-high)] p-4 font-mono text-[11px] text-[var(--color-on-surface-muted)] space-y-1.5">
          <p>
            <span className="text-[var(--color-primary)]">NEXT_PUBLIC_API_URL</span>
            <span className="mx-2">=</span>
            {process.env.NEXT_PUBLIC_API_URL || "https://final-project-qly6.onrender.com/api"}
          </p>
          <p>
            <span className="text-[var(--color-primary)]">NEXT_PUBLIC_WS_URL</span>
            <span className="mx-2">=</span>
            {process.env.NEXT_PUBLIC_WS_URL || "wss://final-project-qly6.onrender.com/ws"}
          </p>
        </div>
      </div>
    </div>
  );
}
