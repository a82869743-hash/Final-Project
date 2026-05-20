"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Wifi, WifiOff, Gauge, Navigation, User, Radio, Play, Square,
  AlertTriangle, MapPin, Clock, Battery, Zap, Shield, Activity,
  Eye, EyeOff, Flame, Layers,
} from "lucide-react";
import {
  type Vehicle, connectVehicleWS, disconnectVehicleWS, api,
  type AnalyticsStats,
} from "@/lib/api";
import dynamic from "next/dynamic";
import { useDispatchContext } from "@/components/providers/DispatchProvider";

/* ── Dynamic import for tactical map ── */
const TacticalMap = dynamic(() => import("@/components/map/TacticalMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex justify-center items-center rounded-lg text-[var(--color-on-surface-muted)]"
      style={{ background: "#0B0F19" }}>
      <div className="flex flex-col items-center gap-2">
        <div className="h-8 w-8 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-medium tracking-wider uppercase">Initializing Tactical Map...</span>
      </div>
    </div>
  ),
});

/* ── Status theme ── */
const STATUS: Record<string, { color: string; label: string; icon: string }> = {
  available:  { color: "#16a34a", label: "Available", icon: "🟢" },
  en_route:   { color: "#0284c7", label: "En Route",  icon: "🟠" },
  on_scene:   { color: "#d97706", label: "On Scene",  icon: "🟡" },
  critical:   { color: "#dc2626", label: "Emergency", icon: "🔴" },
  offline:    { color: "#9ca3af", label: "Offline",    icon: "⚫" },
};

/* ── Vehicle emoji helper ── */
function vIcon(name: string) {
  const n = name.toLowerCase();
  if (n.includes("amb") || n.includes("medic")) return "🚑";
  if (n.includes("pol") || n.includes("patrol")) return "🚓";
  if (n.includes("fire") || n.includes("engine")) return "🚒";
  return "🚑";
}

/* ── Simulation incident data ── */
const SIM_INCIDENTS = [
  { type: "vehicle_collision", location: "NH-48 Vadodara", severity: "critical", lat: 22.32, lng: 73.19 },
  { type: "road_accident", location: "SG Highway Junction", severity: "high", lat: 22.29, lng: 73.17 },
  { type: "fire_reported", location: "Industrial Zone B", severity: "critical", lat: 22.34, lng: 73.21 },
  { type: "medical_emergency", location: "Alkapuri Sector 7", severity: "high", lat: 22.31, lng: 73.18 },
  { type: "crowd_incident", location: "Sayaji Garden Area", severity: "medium", lat: 22.30, lng: 73.20 },
];

/* ── Sim alert interface ── */
interface SimAlert {
  id: string; type: string; location: string; severity: string;
  assignedVehicle: string; eta: number; status: string;
  lat: number; lng: number; timestamp: Date;
}

/* ════════════════════════════════════════════════════════════════ */

export default function TrackingPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [wsConnected, setWsConnected] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { dispatch } = useDispatchContext();
  const [analytics, setAnalytics] = useState<AnalyticsStats | null>(null);

  /* Simulation state */
  const [simRunning, setSimRunning] = useState(false);
  const [simAlerts, setSimAlerts] = useState<SimAlert[]>([]);
  const simRef = useRef<NodeJS.Timeout | null>(null);
  const simStepRef = useRef(0);

  /* Map layer toggles */
  const [layers, setLayers] = useState({
    vehicles: true, heatmap: false, routes: true, emergencyZones: true,
  });
  const [showLayerPanel, setShowLayerPanel] = useState(false);

  /* Initial fetch */
  useEffect(() => {
    api.getVehicles().then(setVehicles).catch(console.error);
    api.getAnalytics().then(setAnalytics).catch(() => {});
  }, []);

  /* WebSocket */
  useEffect(() => {
    connectVehicleWS(
      (updatedVehicles) => { setVehicles(updatedVehicles); setWsConnected(true); },
      () => setWsConnected(false),
    );
    return () => { disconnectVehicleWS(); };
  }, []);

  const selectedVehicle = vehicles.find((v) => v.id === selectedId) || null;

  /* ── Simulation engine ── */
  const startSim = useCallback(() => {
    if (simRunning) return;
    setSimRunning(true);
    simStepRef.current = 0;
    setSimAlerts([]);

    simRef.current = setInterval(() => {
      const step = simStepRef.current;

      /* Inject a new alert every 4 seconds */
      if (step < SIM_INCIDENTS.length) {
        const inc = SIM_INCIDENTS[step];
        const assignee = vehicles[step % vehicles.length];
        setSimAlerts((prev) => [{
          id: `sim-${Date.now()}`,
          type: inc.type, location: inc.location, severity: inc.severity,
          assignedVehicle: assignee?.name || "AMB-" + (step + 100),
          eta: Math.floor(Math.random() * 8) + 2,
          status: "En Route",
          lat: inc.lat, lng: inc.lng,
          timestamp: new Date(),
        }, ...prev].slice(0, 10));
      }

      /* Move vehicles slightly to simulate motion */
      setVehicles((prev) => prev.map((v, i) => ({
        ...v,
        lat: v.lat + (Math.random() - 0.5) * 0.002,
        lng: v.lng + (Math.random() - 0.5) * 0.002,
        speed: Math.max(0, v.speed + (Math.random() - 0.4) * 10),
        heading: (v.heading + (Math.random() - 0.5) * 30 + 360) % 360,
        status: step > 2 && i === step % prev.length ? "critical"
          : step > 1 && i === (step + 1) % prev.length ? "en_route" : v.status,
      })));

      /* Update ETAs on existing alerts */
      setSimAlerts((prev) => prev.map((a) => ({
        ...a,
        eta: Math.max(0, a.eta - 0.5),
        status: a.eta <= 1 ? "On Scene" : "En Route",
      })));

      simStepRef.current++;
      if (simStepRef.current > 20) {
        clearInterval(simRef.current!);
        simRef.current = null;
      }
    }, 2000);
  }, [simRunning, vehicles]);

  const stopSim = useCallback(() => {
    setSimRunning(false);
    if (simRef.current) { clearInterval(simRef.current); simRef.current = null; }
    setSimAlerts([]);
    simStepRef.current = 0;
    api.getVehicles().then(setVehicles).catch(() => {});
  }, []);

  useEffect(() => () => { if (simRef.current) clearInterval(simRef.current); }, []);

  /* ── Derived stats ── */
  const activeCount = vehicles.filter((v) => v.status !== "offline").length;
  const emergencyCount = vehicles.filter((v) => v.status === "critical" || v.status === "on_scene").length;
  const enRouteCount = vehicles.filter((v) => v.status === "en_route").length;

  return (
    <div className="flex gap-3 h-[calc(100vh-7rem)]" style={{ fontFamily: "var(--font-display)" }}>

      {/* ══════ Left: Fleet Panel ══════ */}
      <div className="w-[300px] shrink-0 flex flex-col overflow-hidden rounded-lg border border-[var(--color-outline-variant)] card-lifted">

        {/* Header */}
        <div className="px-4 pt-4 pb-3 flex items-center justify-between border-b border-[var(--color-outline-variant)]">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-[var(--color-primary)]" />
            <h3 className="text-[13px] font-bold tracking-tight text-[var(--color-on-surface)]">Fleet Command</h3>
          </div>
          <div className="flex items-center gap-1.5">
            {wsConnected ? (
              <><Wifi className="h-3.5 w-3.5 text-[var(--color-success)]" />
              <span className="text-[9px] font-bold text-[var(--color-success)] tracking-wider">LIVE</span></>
            ) : (
              <><WifiOff className="h-3.5 w-3.5 text-[var(--color-error)]" />
              <span className="text-[9px] font-bold text-[var(--color-error)] tracking-wider">OFFLINE</span></>
            )}
          </div>
        </div>

        {/* Vehicle list */}
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1.5">
          {vehicles.map((v) => {
            const cfg = STATUS[v.status] || STATUS.available;
            const isSelected = selectedId === v.id;
            const emoji = vIcon(v.name);
            const battery = 60 + Math.floor(Math.random() * 35); // simulated

            return (
              <button key={v.id} onClick={() => setSelectedId(isSelected ? null : v.id)}
                className={`w-full text-left rounded-lg px-3 py-3 transition-all duration-200 border ${
                  isSelected ? "border-[var(--color-primary)]/40 bg-[var(--color-primary)]/5" : "border-transparent hover:bg-[var(--color-surface-container-low)]"
                }`}>
                <div className="flex items-center gap-2.5">
                  {/* Vehicle icon with status ring */}
                  <div className="relative shrink-0">
                    <div className="h-9 w-9 rounded-full flex items-center justify-center text-lg"
                      style={{ background: `${cfg.color}15`, border: `2px solid ${cfg.color}` }}>
                      {emoji}
                    </div>
                    {(v.status === "critical" || v.status === "on_scene") && (
                      <div className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-[var(--color-error)] border-2 border-[var(--color-surface)] animate-pulse" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-bold text-[var(--color-on-surface)] truncate">{v.name}</span>
                      <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded"
                        style={{ color: cfg.color, background: `${cfg.color}15` }}>
                        {cfg.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[10px] text-[var(--color-on-surface-muted)] flex items-center gap-1">
                        <User className="h-2.5 w-2.5" />{v.driver || "—"}
                      </span>
                      {v.speed > 0 && (
                        <span className="text-[10px] text-[var(--color-on-surface-muted)] flex items-center gap-1">
                          <Gauge className="h-2.5 w-2.5" />{Math.round(v.speed)} km/h
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded details */}
                {isSelected && (
                  <div className="mt-3 pt-3 border-t border-[var(--color-outline-variant)] animate-fade-in">
                    <div className="grid grid-cols-3 gap-2 text-[10px]">
                      <div><span className="text-[var(--color-on-surface-muted)]">ETA</span>
                        <p className="font-bold text-[var(--color-on-surface)]">{v.status === "en_route" ? `${Math.ceil(Math.random() * 8 + 2)} min` : "—"}</p></div>
                      <div><span className="text-[var(--color-on-surface-muted)]">Battery</span>
                        <p className="font-bold" style={{ color: battery > 50 ? "#34C759" : "#FF9500" }}>{battery}%</p></div>
                      <div><span className="text-[var(--color-on-surface-muted)]">Heading</span>
                        <p className="font-bold text-[var(--color-on-surface)]">{Math.round(v.heading)}°</p></div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-2 text-[10px]">
                      <div><span className="text-[var(--color-on-surface-muted)]">Lat</span><p className="font-medium text-[var(--color-on-surface-muted)]">{v.lat.toFixed(4)}</p></div>
                      <div><span className="text-[var(--color-on-surface-muted)]">Lng</span><p className="font-medium text-[var(--color-on-surface-muted)]">{v.lng.toFixed(4)}</p></div>
                    </div>
                    {v.destination && (
                      <div className="mt-2 flex items-center gap-1.5 text-[10px]">
                        <Navigation className="h-3 w-3 text-[var(--color-primary)]" />
                        <span className="text-[var(--color-on-surface-muted)]">{v.destination}</span>
                      </div>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Summary footer */}
        <div className="px-4 py-3 border-t border-[var(--color-outline-variant)] bg-[var(--color-surface-container-low)]">
          <div className="flex items-center justify-between text-[10px] mb-1.5">
            <span className="text-[var(--color-on-surface-muted)]">Total Fleet</span>
            <span className="font-bold text-[var(--color-on-surface)]">{vehicles.length}</span>
          </div>
          <div className="flex gap-3">
            {Object.entries(STATUS).map(([key, cfg]) => {
              const count = vehicles.filter((v) => v.status === key).length;
              if (!count) return null;
              return (
                <span key={key} className="flex items-center gap-1 text-[9px] text-[var(--color-on-surface-muted)]">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: cfg.color }} />
                  {count}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/* ══════ Center: Map + Stats ══════ */}
      <div className="flex-1 flex flex-col gap-3 min-w-0">

        {/* Top Stats Bar */}
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: "Active Units", value: activeCount, icon: Activity, color: "#34C759" },
            { label: "Emergency", value: emergencyCount, icon: AlertTriangle, color: "#FF3B30" },
            { label: "En Route", value: enRouteCount, icon: Navigation, color: "#00D4FF" },
            { label: "Avg ETA", value: analytics?.avg_eta ?? "—", icon: Clock, color: "#FF9500" },
            { label: "Dispatches", value: analytics?.total_dispatches ?? "—", icon: Zap, color: "#a78bfa" },
          ].map((stat) => (
            <div key={stat.label} className="card-lifted px-3 py-2.5 flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: `${stat.color}15` }}>
                <stat.icon className="h-4 w-4" style={{ color: stat.color }} />
              </div>
              <div>
                <span className="text-[8px] uppercase font-bold tracking-[0.1em] text-[var(--color-on-surface-muted)] block">{stat.label}</span>
                <span className="text-base font-bold text-[var(--color-on-surface)]">{stat.value}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Map Area */}
        <div className="flex-1 relative rounded-lg overflow-hidden border border-[var(--color-outline-variant)]">
          <TacticalMap
            height="100%"
            vehicles={vehicles}
            dispatch={dispatch}
            selected={selectedVehicle}
            layers={layers}
            onVehicleClick={(v) => setSelectedId(v.id)}
            simAlerts={simAlerts.map((a) => ({ lat: a.lat, lng: a.lng, type: a.type, severity: a.severity }))}
          />

          {/* Map layer controls — top right */}
          <div className="absolute top-3 right-3 z-[1000]">
            <button onClick={() => setShowLayerPanel(!showLayerPanel)}
              className="h-9 w-9 rounded-lg flex items-center justify-center border border-[#1e293b] transition-all hover:border-[#00D4FF]/40"
              style={{ background: "rgba(11,15,25,0.92)", backdropFilter: "blur(8px)" }}>
              <Layers className="h-4 w-4 text-[#94a3b8]" />
            </button>
            {showLayerPanel && (
              <div className="mt-2 rounded-lg border border-[#1e293b] p-3 space-y-2 min-w-[180px] animate-fade-in"
                style={{ background: "rgba(11,15,25,0.95)", backdropFilter: "blur(12px)" }}>
                <span className="text-[8px] uppercase font-bold tracking-[0.1em] text-[#475569]">Map Layers</span>
                {([
                  { key: "vehicles", label: "Vehicle Tracking", color: "#00D4FF" },
                  { key: "heatmap", label: "Risk Heatmap", color: "#FF9500" },
                  { key: "routes", label: "Dispatch Routes", color: "#34C759" },
                  { key: "emergencyZones", label: "Emergency Zones", color: "#FF3B30" },
                ] as const).map((item) => (
                  <button key={item.key}
                    onClick={() => setLayers((p) => ({ ...p, [item.key]: !p[item.key] }))}
                    className="flex items-center gap-2 w-full text-left py-1 group">
                    <div className={`h-4 w-4 rounded border flex items-center justify-center transition-all ${
                      layers[item.key] ? "border-transparent" : "border-[#334155]"
                    }`} style={layers[item.key] ? { background: item.color } : {}}>
                      {layers[item.key] && <Eye className="h-2.5 w-2.5 text-white" />}
                      {!layers[item.key] && <EyeOff className="h-2.5 w-2.5 text-[#475569]" />}
                    </div>
                    <span className={`text-[11px] font-medium ${layers[item.key] ? "text-[#e2e8f0]" : "text-[#64748b]"}`}>
                      {item.label}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Simulation controls — top left */}
          <div className="absolute top-3 left-3 z-[1000]">
            <button onClick={simRunning ? stopSim : startSim}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-[11px] font-bold tracking-wider uppercase transition-all ${
                simRunning
                  ? "border-[#FF3B30]/40 bg-[#FF3B30]/10 text-[#FF3B30] hover:bg-[#FF3B30]/20"
                  : "border-[#34C759]/40 bg-[#34C759]/10 text-[#34C759] hover:bg-[#34C759]/20"
              }`} style={{ backdropFilter: "blur(8px)" }}>
              {simRunning ? <><Square className="h-3 w-3" /> Stop Sim</> : <><Play className="h-3 w-3" /> Start Simulation</>}
            </button>
            {simRunning && (
              <div className="mt-2 rounded-lg border border-[#FF3B30]/20 px-3 py-1.5 flex items-center gap-2 animate-fade-in"
                style={{ background: "rgba(11,15,25,0.92)", backdropFilter: "blur(8px)" }}>
                <span className="h-2 w-2 rounded-full bg-[#FF3B30] animate-pulse" />
                <span className="text-[9px] font-bold text-[#FF3B30] tracking-wider uppercase">Simulation Active</span>
              </div>
            )}
          </div>

          {/* Status overlay — bottom left */}
          <div className="absolute bottom-3 left-3 z-[1000] rounded-lg border border-[#1e293b] px-3 py-2"
            style={{ background: "rgba(11,15,25,0.92)", backdropFilter: "blur(12px)" }}>
            <div className="flex items-center gap-3 text-[10px]">
              <div className="flex items-center gap-1">
                <span className={`h-2 w-2 rounded-full ${wsConnected ? "bg-[#34C759]" : "bg-[#FF3B30]"} animate-pulse`} />
                <span className="text-[#94a3b8] font-medium">{wsConnected ? "Connected" : "Disconnected"}</span>
              </div>
              <div className="h-3 w-px bg-[#1e293b]" />
              <span className="text-[#64748b]">{vehicles.length} units tracked</span>
            </div>
          </div>
        </div>
      </div>

      {/* ══════ Right: Live Alerts Panel ══════ */}
      {simAlerts.length > 0 && (
        <div className="w-[280px] shrink-0 flex flex-col overflow-hidden rounded-lg border border-[var(--color-outline-variant)] card-lifted animate-fade-in">
          <div className="px-4 pt-4 pb-3 flex items-center justify-between border-b border-[var(--color-outline-variant)]">
            <div className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-[var(--color-error)]" />
              <h3 className="text-[12px] font-bold text-[var(--color-on-surface)] tracking-tight">Emergency Alerts</h3>
            </div>
            <div className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-[var(--color-error)] animate-pulse" />
              <span className="text-[9px] font-bold text-[var(--color-error)] tracking-wider">LIVE</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
            {simAlerts.map((alert) => {
              const sColor = alert.severity === "critical" ? "#FF3B30" : alert.severity === "high" ? "#FF9500" : "#eab308";
              return (
                <div key={alert.id} className="rounded-lg p-3 border-l-[3px] animate-fade-in"
                  style={{ background: `${sColor}08`, borderLeftColor: sColor }}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: sColor }}>
                      {alert.type.replace(/_/g, " ")}
                    </span>
                    <span className="text-[8px] text-[var(--color-on-surface-muted)]">
                      {alert.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="space-y-1 text-[10px]">
                    <div className="flex items-center gap-1.5 text-[var(--color-on-surface-muted)]">
                      <MapPin className="h-3 w-3 shrink-0" />{alert.location}
                    </div>
                    <div className="flex items-center gap-1.5 text-[var(--color-on-surface-muted)]">
                      <Shield className="h-3 w-3 shrink-0" />Assigned: <strong className="text-[var(--color-on-surface)]">{alert.assignedVehicle}</strong>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                        style={{ color: sColor, background: `${sColor}15` }}>
                        {alert.severity.toUpperCase()}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] text-[var(--color-on-surface-muted)]">ETA: <strong className="text-[var(--color-on-surface)]">{Math.ceil(alert.eta)} min</strong></span>
                        <span className="text-[9px] font-medium" style={{ color: alert.status === "On Scene" ? "#34C759" : "#00D4FF" }}>
                          {alert.status}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
