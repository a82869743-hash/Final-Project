"use client";

import { useEffect, useRef, useMemo } from "react";
import L from "leaflet";
import {
  MapContainer, TileLayer, Marker, Popup, Circle, useMap,
  Polyline, Tooltip, CircleMarker,
} from "react-leaflet";
import { type Vehicle, type PredictionResponse, type RiskZone } from "@/lib/api";
import "leaflet.heat";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
});

/* ── Status colors ── */
const STATUS_COLORS: Record<string, string> = {
  critical: "#FF3B30", on_scene: "#FF3B30",
  en_route: "#00D4FF",
  available: "#34C759",
  offline: "#6b7280",
};

/* ── Vehicle type emojis ── */
function vehicleIcon(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("amb") || n.includes("medic")) return "🚑";
  if (n.includes("pol") || n.includes("patrol")) return "🚓";
  if (n.includes("fire") || n.includes("engine")) return "🚒";
  return "🚑";
}

/* ── Dispatch data interface ── */
interface DispatchData {
  vehicle: Vehicle;
  hotspot: { lat: number; lng: number };
  eta: number;
}

/* ── Map layer toggles ── */
interface MapLayers {
  vehicles: boolean;
  heatmap: boolean;
  routes: boolean;
  emergencyZones: boolean;
}

interface TacticalMapProps {
  height?: string;
  className?: string;
  vehicles?: Vehicle[];
  prediction?: PredictionResponse | null;
  dispatch?: DispatchData | null;
  selected?: Vehicle | null;
  riskZones?: RiskZone[];
  layers?: MapLayers;
  onVehicleClick?: (v: Vehicle) => void;
  simAlerts?: Array<{ lat: number; lng: number; type: string; severity: string }>;
}

/* ── FitBounds ── */
function FitBounds({ vehicles, selected }: { vehicles: Vehicle[]; selected?: Vehicle | null }) {
  const map = useMap();
  const fitted = useRef(false);

  useEffect(() => {
    if (selected) {
      map.setView([selected.lat, selected.lng], 15, { animate: true, duration: 1 });
      return;
    }
    if (!fitted.current && vehicles.length > 0) {
      const bounds = L.latLngBounds(vehicles.map((v) => [v.lat, v.lng]));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 13, animate: true, duration: 1 });
      fitted.current = true;
    } else if (vehicles.length === 0) {
      map.setView([22.3, 73.2], 6, { animate: true });
    }
  }, [vehicles, selected, map]);
  return null;
}

/* ── Focus on selected vehicle ── */
function FocusSelected({ selected }: { selected: Vehicle | null }) {
  const map = useMap();
  useEffect(() => {
    if (selected) map.flyTo([selected.lat, selected.lng], 15, { duration: 1.2 });
  }, [selected, map]);
  return null;
}

/* ── Heatmap layer ── */
function HeatmapLayer({ vehicles, enabled }: { vehicles: Vehicle[]; enabled: boolean }) {
  const map = useMap();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const heatRef = useRef<any>(null);

  useEffect(() => {
    if (!enabled) {
      if (heatRef.current) { map.removeLayer(heatRef.current); heatRef.current = null; }
      return;
    }
    function init() {
      if (heatRef.current) return;
      try {
        map.invalidateSize();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        heatRef.current = (L as any).heatLayer([], {
          radius: 30, blur: 25, maxZoom: 17,
          gradient: { 0.2: "#34C759", 0.4: "#eab308", 0.6: "#FF9500", 0.8: "#FF3B30" },
        }).addTo(map);
      } catch { /* deferred */ }
    }
    if (map.getContainer()?.clientHeight > 0) requestAnimationFrame(init);
    else map.whenReady(() => requestAnimationFrame(init));
  }, [map, enabled]);

  const heatData = useMemo(() => {
    if (!enabled) return [];
    const pts: Array<[number, number, number]> = [];
    vehicles.forEach((v) => {
      if (v.status === "offline") return;
      const intensity = v.status === "critical" || v.status === "on_scene" ? 0.9 : v.status === "en_route" ? 0.6 : 0.3;
      pts.push([v.lat, v.lng, intensity]);
      const o = 0.001;
      pts.push([v.lat + o, v.lng, intensity * 0.5], [v.lat - o, v.lng, intensity * 0.5]);
      pts.push([v.lat, v.lng + o, intensity * 0.5], [v.lat, v.lng - o, intensity * 0.5]);
    });
    return pts.slice(0, 500);
  }, [vehicles, enabled]);

  useEffect(() => { if (heatRef.current) heatRef.current.setLatLngs(heatData); }, [heatData]);

  useEffect(() => {
    return () => { if (heatRef.current) map.removeLayer(heatRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

/* ══════════════════════════════════════════════════════════════ */

export default function TacticalMap({
  height = "100%", className = "", vehicles = [], prediction = null,
  dispatch = null, selected = null, riskZones = [],
  layers = { vehicles: true, heatmap: false, routes: true, emergencyZones: true },
  onVehicleClick, simAlerts = [],
}: TacticalMapProps) {
  const center: [number, number] = useMemo(() => {
    if (!vehicles.length) return [22.3072, 73.1812];
    return [
      vehicles.reduce((s, v) => s + v.lat, 0) / vehicles.length,
      vehicles.reduce((s, v) => s + v.lng, 0) / vehicles.length,
    ];
  }, [vehicles]);

  const riskColor = prediction
    ? prediction.risk_level === "critical" ? "#FF3B30"
      : prediction.risk_level === "high" ? "#FF9500"
      : prediction.risk_level === "medium" ? "#eab308" : "#34C759"
    : "transparent";

  const riskRadius = prediction
    ? prediction.risk_level === "critical" ? 1500
      : prediction.risk_level === "high" ? 1200
      : prediction.risk_level === "medium" ? 900 : 600
    : 0;

  return (
    <div className={`relative z-0 overflow-hidden rounded-lg ${className}`} style={{ height, width: "100%" }}>
      <MapContainer center={center} zoom={13} scrollWheelZoom zoomControl={false}
        style={{ height: "100%", width: "100%", zIndex: 0, background: "#0B0F19" }}>
        {/* Dark tactical tile layer */}
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          maxZoom={19}
        />

        <FitBounds vehicles={vehicles} selected={selected} />
        <FocusSelected selected={selected} />
        <HeatmapLayer vehicles={vehicles} enabled={layers.heatmap} />

        {/* Risk prediction overlay */}
        {prediction && layers.emergencyZones && (
          <>
            <Circle center={center} radius={riskRadius}
              pathOptions={{ fillColor: riskColor, color: riskColor, weight: 1.5, fillOpacity: 0.15, className: "risk-pulse" }} />
            <Circle center={center} radius={riskRadius * 1.6}
              pathOptions={{ fillColor: riskColor, color: "transparent", weight: 0, fillOpacity: 0.05 }} />
          </>
        )}

        {/* Risk zones from API */}
        {layers.emergencyZones && riskZones.map((zone, i) => (
          <Circle key={`rz-${i}`} center={[zone.lat, zone.lng]}
            pathOptions={{ fillColor: zone.color, color: zone.color, weight: 1, fillOpacity: 0.12, className: zone.risk_level === "High" ? "risk-pulse" : "" }}
            radius={zone.radius}>
            <Popup><div style={{ background: "#0B0F19", color: "#fff", padding: 8, borderRadius: 6, margin: -12, fontSize: 12 }}>
              <strong>Risk: <span style={{ color: zone.color }}>{zone.risk_level}</span></strong><br />
              <span style={{ color: "#94a3b8" }}>Accidents: {zone.accident_count}</span>
            </div></Popup>
          </Circle>
        ))}

        {/* Dispatch route line */}
        {dispatch && layers.routes && (
          <>
            <Polyline
              positions={[[dispatch.vehicle.lat, dispatch.vehicle.lng], [dispatch.hotspot.lat, dispatch.hotspot.lng]]}
              pathOptions={{ color: "#00D4FF", weight: 3, dashArray: "8, 10", className: "route-dash" }}
            />
            <Circle center={[dispatch.hotspot.lat, dispatch.hotspot.lng]} radius={80}
              pathOptions={{ fillColor: "#FF3B30", color: "#FF3B30", fillOpacity: 0.25, weight: 1.5, className: "risk-pulse" }} />
            <CircleMarker center={[dispatch.hotspot.lat, dispatch.hotspot.lng]} radius={5}
              pathOptions={{ color: "#FF3B30", fillColor: "#FF3B30", fillOpacity: 1 }} />
          </>
        )}

        {/* Simulation alert markers */}
        {simAlerts.map((a, i) => (
          <CircleMarker key={`sim-${i}`} center={[a.lat, a.lng]} radius={8}
            pathOptions={{
              color: a.severity === "critical" ? "#FF3B30" : a.severity === "high" ? "#FF9500" : "#eab308",
              fillColor: a.severity === "critical" ? "#FF3B30" : a.severity === "high" ? "#FF9500" : "#eab308",
              fillOpacity: 0.8, weight: 2, className: "risk-pulse",
            }}>
            <Popup><div style={{ background: "#0B0F19", color: "#fff", padding: 8, borderRadius: 6, margin: -12, fontSize: 12 }}>
              <strong style={{ color: "#FF3B30" }}>{a.type.replace(/_/g, " ").toUpperCase()}</strong><br />
              <span style={{ color: "#94a3b8" }}>Severity: {a.severity}</span>
            </div></Popup>
          </CircleMarker>
        ))}

        {/* Vehicle markers with tactical styling */}
        {layers.vehicles && vehicles.map((v) => {
          if (v.status === "offline") return null;
          const color = STATUS_COLORS[v.status] || "#34C759";
          const isDispatched = dispatch?.vehicle?.id === v.id;
          const isSelected = selected?.id === v.id;
          const emoji = vehicleIcon(v.name);
          const heading = v.heading || 0;

          const icon = L.divIcon({
            className: "tactical-marker-wrapper",
            html: `<div class="tac-marker ${isDispatched ? "dispatched" : ""} ${isSelected ? "selected" : ""} ${v.status === "critical" || v.status === "on_scene" ? "emergency" : ""}" style="--status-color: ${color}">
              <div class="tac-glow" style="background: ${color}"></div>
              <div class="tac-body" style="transform: rotate(${heading}deg)">
                <span class="tac-emoji">${emoji}</span>
              </div>
              <div class="tac-label">${v.name}</div>
            </div>`,
            iconSize: [48, 56],
            iconAnchor: [24, 28],
          });

          return (
            <Marker key={v.id} position={[v.lat, v.lng]} icon={icon}
              eventHandlers={{ click: () => onVehicleClick?.(v) }}>
              <Popup offset={[0, -20]}>
                <div style={{ background: "#0B0F19", color: "#fff", padding: 12, borderRadius: 8, margin: -12, minWidth: 180, fontFamily: "var(--font-display)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 20 }}>{emoji}</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{v.name}</div>
                      <div style={{ fontSize: 10, color: "#94a3b8" }}>{v.driver || "Unassigned"}</div>
                    </div>
                    <span style={{ marginLeft: "auto", fontSize: 9, fontWeight: 700, textTransform: "uppercase", padding: "2px 6px", borderRadius: 4, background: `${color}20`, color }}>{v.status.replace("_", " ")}</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 11 }}>
                    <div><span style={{ color: "#64748b" }}>Speed</span><br /><strong>{Math.round(v.speed)} km/h</strong></div>
                    <div><span style={{ color: "#64748b" }}>Heading</span><br /><strong>{Math.round(v.heading)}°</strong></div>
                    <div><span style={{ color: "#64748b" }}>Lat</span><br /><strong>{v.lat.toFixed(4)}</strong></div>
                    <div><span style={{ color: "#64748b" }}>Lng</span><br /><strong>{v.lng.toFixed(4)}</strong></div>
                  </div>
                  {v.destination && (
                    <div style={{ marginTop: 8, paddingTop: 6, borderTop: "1px solid #1e293b", fontSize: 11 }}>
                      <span style={{ color: "#64748b" }}>Destination:</span> <strong style={{ color: "#00D4FF" }}>{v.destination}</strong>
                    </div>
                  )}
                </div>
              </Popup>
              {isDispatched && (
                <Tooltip direction="top" offset={[0, -18]} permanent
                  className="font-bold !text-[10px] !border-0 !shadow-lg !bg-[#0B0F19] !text-[#00D4FF] !px-2 !py-1">
                  ETA: {dispatch.eta} min
                </Tooltip>
              )}
            </Marker>
          );
        })}
      </MapContainer>

      {/* ── Tactical CSS ── */}
      <style jsx global>{`
        .tactical-marker-wrapper { background: transparent !important; border: none !important; }
        .tac-marker { position: relative; display: flex; flex-direction: column; align-items: center; }
        .tac-glow {
          position: absolute; top: 50%; left: 50%; transform: translate(-50%, -60%);
          width: 32px; height: 32px; border-radius: 50%; opacity: 0.25; filter: blur(8px);
        }
        .tac-body {
          width: 32px; height: 32px; border-radius: 50%;
          background: rgba(11, 15, 25, 0.9); border: 2px solid var(--status-color);
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 0 8px color-mix(in srgb, var(--status-color) 40%, transparent);
          transition: transform 0.5s ease, box-shadow 0.3s;
        }
        .tac-emoji { font-size: 16px; filter: drop-shadow(0 0 3px rgba(0,0,0,0.5)); }
        .tac-label {
          margin-top: 2px; font-size: 9px; font-weight: 700; color: #cbd5e1;
          text-shadow: 0 1px 3px rgba(0,0,0,0.8); white-space: nowrap;
          letter-spacing: 0.04em;
        }
        .tac-marker.emergency .tac-glow { animation: emergencyPulse 1.5s infinite; opacity: 0.5; }
        .tac-marker.emergency .tac-body { border-color: #FF3B30; box-shadow: 0 0 16px rgba(255,59,48,0.6); }
        .tac-marker.selected .tac-body { border-color: #00D4FF; box-shadow: 0 0 16px rgba(0,212,255,0.6); transform: scale(1.15); }
        .tac-marker.dispatched .tac-body { border-color: #00D4FF; box-shadow: 0 0 20px rgba(0,212,255,0.5); }
        .tac-marker.dispatched .tac-label { color: #00D4FF; }

        @keyframes emergencyPulse {
          0%,100% { transform: translate(-50%,-60%) scale(1); opacity: 0.3; }
          50% { transform: translate(-50%,-60%) scale(2); opacity: 0.08; }
        }

        .risk-pulse { animation: riskPulse 3s ease-in-out infinite; }
        @keyframes riskPulse {
          0%,100% { fill-opacity: 0.12; stroke-opacity: 0.4; }
          50% { fill-opacity: 0.25; stroke-opacity: 0.8; }
        }

        .route-dash { animation: dashFlow 1.5s linear infinite; }
        @keyframes dashFlow { to { stroke-dashoffset: -50; } }

        @media (prefers-reduced-motion: reduce) {
          .tac-marker.emergency .tac-glow, .risk-pulse, .route-dash { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
