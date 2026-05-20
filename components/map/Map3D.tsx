"use client";

import { useEffect, useRef, useMemo, useState, useCallback } from "react";
import L from "leaflet";
import {
  MapContainer, TileLayer, Marker, Popup, Circle, useMap,
  Polyline, Tooltip, CircleMarker,
} from "react-leaflet";
import { type Vehicle, type PredictionResponse, type RiskZone } from "@/lib/api";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
});

/* ────── Vehicle Type Config — clean palette, no red aura ────── */
const VEHICLE_CONFIG: Record<string, { color: string; accent: string; label: string }> = {
  ambulance:  { color: "#ef4444", accent: "#dc2626", label: "Ambulance" },
  police:     { color: "#3b82f6", accent: "#2563eb", label: "Police" },
  fire_truck: { color: "#f59e0b", accent: "#d97706", label: "Fire Truck" },
  default:    { color: "#10b981", accent: "#059669", label: "Unit" },
};

function getVehicleType(v: Vehicle): string {
  const id = (v.id + v.name).toLowerCase();
  if (id.includes("amb")) return "ambulance";
  if (id.includes("pol")) return "police";
  if (id.includes("fir")) return "fire_truck";
  return "default";
}

/* ────── Compact CSS 3D Car Icon — no red glow, small footprint ────── */
function create3DCarIcon(vehicle: Vehicle, heading: number, isDispatched: boolean, isSelected: boolean): L.DivIcon {
  const type = getVehicleType(vehicle);
  const cfg = VEHICLE_CONFIG[type] || VEHICLE_CONFIG.default;
  const isOffline = vehicle.status === "offline";
  const color = isOffline ? "#9ca3af" : cfg.color;
  const dark = isOffline ? "#6b7280" : cfg.accent;

  let cls = "";
  if (isDispatched) cls = "c3-disp";
  else if (isSelected) cls = "c3-sel";
  else if (isOffline) cls = "c3-off";

  return L.divIcon({
    className: "c3-wrap",
    html: `<div class="c3 ${cls}" style="transform:rotate(${heading}deg)">
      <div class="c3-car" style="background:linear-gradient(180deg,${color},${dark});border-color:${dark}">
        <div class="c3-ws-f"></div>
        <div class="c3-roof"></div>
        <div class="c3-ws-r"></div>
        <div class="c3-wh c3-w1"></div><div class="c3-wh c3-w2"></div>
        <div class="c3-wh c3-w3"></div><div class="c3-wh c3-w4"></div>
        <div class="c3-hl c3-h1"></div><div class="c3-hl c3-h2"></div>
        <div class="c3-tl c3-t1"></div><div class="c3-tl c3-t2"></div>
      </div>
      <div class="c3-shd"></div>
    </div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

/* ────── Smooth Animated Movement with requestAnimationFrame ────── */
function useAnimatedPositions(vehicles: Vehicle[]) {
  const targets = useRef<Record<string, { lat: number; lng: number; h: number }>>({});
  const current = useRef<Record<string, { lat: number; lng: number; h: number }>>({});
  const [positions, setPositions] = useState<Record<string, { lat: number; lng: number; h: number }>>({});
  const frameRef = useRef<number>(0);
  const lastTime = useRef<number>(0);

  // Update targets when vehicles change
  useEffect(() => {
    for (const v of vehicles) {
      const prev = current.current[v.id];
      let heading = v.heading || 0;

      if (prev) {
        const dlat = v.lat - prev.lat;
        const dlng = v.lng - prev.lng;
        if (Math.abs(dlat) > 0.0001 || Math.abs(dlng) > 0.0001) {
          heading = (Math.atan2(dlng, dlat) * 180) / Math.PI;
        }
      }

      // Add slight random drift to simulate real-time GPS movement
      const drift = 0.0008;
      const driftLat = (Math.random() - 0.5) * drift;
      const driftLng = (Math.random() - 0.5) * drift;

      targets.current[v.id] = {
        lat: v.lat + driftLat,
        lng: v.lng + driftLng,
        h: heading,
      };

      // Initialize current position if new
      if (!current.current[v.id]) {
        current.current[v.id] = { lat: v.lat, lng: v.lng, h: heading };
      }
    }
  }, [vehicles]);

  // Animate positions smoothly
  useEffect(() => {
    const animate = (time: number) => {
      const delta = lastTime.current ? (time - lastTime.current) / 1000 : 0.016;
      lastTime.current = time;

      const lerpFactor = Math.min(1, delta * 2.5); // Smooth interpolation speed
      const out: typeof positions = {};
      let changed = false;

      for (const id of Object.keys(targets.current)) {
        const target = targets.current[id];
        const cur = current.current[id] || target;

        const newLat = cur.lat + (target.lat - cur.lat) * lerpFactor;
        const newLng = cur.lng + (target.lng - cur.lng) * lerpFactor;

        // Smooth heading interpolation (handle 360° wrap)
        let dh = target.h - cur.h;
        if (dh > 180) dh -= 360;
        if (dh < -180) dh += 360;
        const newH = cur.h + dh * lerpFactor;

        if (Math.abs(newLat - cur.lat) > 0.000001 || Math.abs(newLng - cur.lng) > 0.000001) {
          changed = true;
        }

        current.current[id] = { lat: newLat, lng: newLng, h: newH };
        out[id] = { lat: newLat, lng: newLng, h: newH };
      }

      if (changed) setPositions({ ...out });
      frameRef.current = requestAnimationFrame(animate);
    };

    frameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameRef.current);
  }, []);

  // Trigger new drift every 3 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      for (const v of vehicles) {
        if (v.status === "offline") continue;
        const drift = v.speed > 0 ? 0.002 : 0.0005;
        const angle = Math.random() * Math.PI * 2;
        const cur = current.current[v.id];
        if (cur) {
          targets.current[v.id] = {
            lat: cur.lat + Math.cos(angle) * drift,
            lng: cur.lng + Math.sin(angle) * drift,
            h: (angle * 180) / Math.PI,
          };
        }
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [vehicles]);

  return positions;
}

/* ────── Focus on Selected Vehicle ────── */
function FocusOnVehicle({ selected }: { selected: Vehicle | null }) {
  const map = useMap();
  const prevId = useRef<string | null>(null);

  useEffect(() => {
    if (selected && selected.id !== prevId.current) {
      map.flyTo([selected.lat, selected.lng], 14, { duration: 1.2 });
      prevId.current = selected.id;
    } else if (!selected) {
      prevId.current = null;
    }
  }, [selected, map]);

  return null;
}

/* ────── Initial Fit (once on mount — limits max zoom) ────── */
function InitialFit({ vehicles }: { vehicles: Vehicle[] }) {
  const map = useMap();
  const fitted = useRef(false);

  useEffect(() => {
    if (!fitted.current && vehicles.length > 0) {
      const bounds = L.latLngBounds(vehicles.map(v => [v.lat, v.lng]));
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 10, animate: true, duration: 1 });
      fitted.current = true;
    }
  }, [vehicles, map]);

  return null;
}

/* ────── Vehicle Info Panel ────── */
function InfoPanel({ vehicle, onClose }: { vehicle: Vehicle | null; onClose: () => void }) {
  if (!vehicle) return null;
  const type = getVehicleType(vehicle);
  const cfg = VEHICLE_CONFIG[type] || VEHICLE_CONFIG.default;
  return (
    <div className="absolute bottom-4 left-4 z-[1000] card-lifted p-4 w-[260px] animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="text-[13px] font-semibold text-[var(--color-on-surface)]">{vehicle.name || vehicle.id}</h4>
          <span className="text-[10px] uppercase font-bold" style={{ color: cfg.color }}>{cfg.label}</span>
        </div>
        <button onClick={onClose} className="text-[var(--color-on-surface-muted)] hover:text-[var(--color-on-surface)] text-lg leading-none">×</button>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div><span className="text-[var(--color-on-surface-muted)]">Status</span><p className="font-semibold text-[var(--color-on-surface)] capitalize">{vehicle.status.replace("_"," ")}</p></div>
        <div><span className="text-[var(--color-on-surface-muted)]">Speed</span><p className="font-semibold text-[var(--color-on-surface)]">{Math.round(vehicle.speed)} km/h</p></div>
        <div><span className="text-[var(--color-on-surface-muted)]">Driver</span><p className="font-semibold text-[var(--color-on-surface)]">{vehicle.driver || "—"}</p></div>
        <div><span className="text-[var(--color-on-surface-muted)]">Heading</span><p className="font-semibold text-[var(--color-on-surface)]">{Math.round(vehicle.heading)}°</p></div>
        {vehicle.destination && <div className="col-span-2"><span className="text-[var(--color-on-surface-muted)]">Mission</span><p className="font-semibold text-[var(--color-on-surface)]">{vehicle.destination}</p></div>}
      </div>
    </div>
  );
}

/* ────── Main Component ────── */
interface Map3DProps {
  height?: string; className?: string; vehicles?: Vehicle[];
  prediction?: PredictionResponse | null;
  dispatch?: { vehicle: Vehicle; hotspot: { lat: number; lng: number }; eta: number } | null;
  selected?: Vehicle | null; riskZones?: RiskZone[];
  onVehicleClick?: (vehicle: Vehicle) => void;
}

export default function Map3D({ height = "400px", className = "", vehicles = [], prediction = null, dispatch = null, selected = null, riskZones = [], onVehicleClick }: Map3DProps) {
  const animPos = useAnimatedPositions(vehicles);
  const [clicked, setClicked] = useState<Vehicle | null>(null);

  const center: [number, number] = useMemo(() => {
    if (!vehicles.length) return [20.5937, 78.9629];
    return [
      vehicles.reduce((s, v) => s + v.lat, 0) / vehicles.length,
      vehicles.reduce((s, v) => s + v.lng, 0) / vehicles.length,
    ];
  }, [vehicles]);

  // Subtler risk zones — no giant red circles
  const radius = prediction?.risk_level === "critical" ? 1200 : prediction?.risk_level === "high" ? 900 : prediction?.risk_level === "medium" ? 700 : 400;
  let riskColor = "transparent";
  if (prediction) riskColor = prediction.risk_level === "critical" ? "#ef4444" : prediction.risk_level === "high" ? "#f59e0b" : prediction.risk_level === "medium" ? "#eab308" : "#10b981";

  const onVClick = useCallback((v: Vehicle) => { setClicked(v); onVehicleClick?.(v); }, [onVehicleClick]);

  return (
    <div className={`card-lifted relative z-0 overflow-hidden ${className}`} style={{ height, width: "100%" }}>
      <MapContainer center={center} zoom={5} scrollWheelZoom={true} zoomControl={true} style={{ height: "100%", width: "100%", zIndex: 0 }}>

        {/* High-detail OpenStreetMap tiles */}
        <TileLayer
          url="https://tile.openstreetmap.de/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          maxZoom={19}
        />

        <InitialFit vehicles={vehicles} />
        <FocusOnVehicle selected={selected} />

        {/* Risk prediction circle — very subtle, small */}
        {prediction && (
          <Circle center={center} pathOptions={{ fillColor: riskColor, color: riskColor, weight: 1.5, fillOpacity: 0.08, className: "smooth-risk-circle" }} radius={radius} />
        )}

        {/* Risk zones — subtle borders only */}
        {riskZones.map((zone, i) => (
          <Circle key={`rz-${i}`} center={[zone.lat, zone.lng]} pathOptions={{ fillColor: zone.color, color: zone.color, weight: 1, fillOpacity: 0.06 }} radius={zone.radius} />
        ))}

        {/* Dispatch route line */}
        {dispatch && (
          <>
            <Polyline positions={[[dispatch.vehicle.lat, dispatch.vehicle.lng], [dispatch.hotspot.lat, dispatch.hotspot.lng]]} pathOptions={{ color: "#0891b2", weight: 3, dashArray: "6, 8" }} className="route-line" />
            <CircleMarker center={[dispatch.hotspot.lat, dispatch.hotspot.lng]} radius={5} pathOptions={{ color: "#0891b2", fillColor: "#0891b2", fillOpacity: 0.8 }} />
          </>
        )}

        {/* Individual vehicle markers — animated positions */}
        {vehicles.map((v) => {
          if (v.status === "offline") return null;
          const p = animPos[v.id] || { lat: v.lat, lng: v.lng, h: v.heading };
          const icon = create3DCarIcon(v, p.h, dispatch?.vehicle?.id === v.id, selected?.id === v.id);
          return (
            <Marker key={v.id} position={[p.lat, p.lng]} icon={icon} eventHandlers={{ click: () => onVClick(v) }}>
              <Popup offset={[0, -14]}>
                <div style={{ fontFamily: "var(--font-display)", minWidth: 150 }}>
                  <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600 }}>VEHICLE ID</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a", marginBottom: 4 }}>{v.id}</div>
                  <strong>{v.name}</strong><br />
                  <span style={{ textTransform: "capitalize" }}>{v.status.replace("_", " ")}</span>
                  {v.driver && <><br /><span style={{ fontSize: 11, color: "#6b7280" }}>Driver: {v.driver}</span></>}
                  {v.speed > 0 && <><br /><span style={{ fontSize: 11 }}>{Math.round(v.speed)} km/h</span></>}
                  {v.destination && <><br /><span style={{ fontSize: 11, color: "#0891b2" }}>→ {v.destination}</span></>}
                </div>
              </Popup>
              {dispatch?.vehicle?.id === v.id && (
                <Tooltip direction="top" offset={[0, -14]} permanent className="font-[var(--font-display)] font-bold !text-cyan-600 border-0 shadow-lg !bg-white">DISPATCHED</Tooltip>
              )}
            </Marker>
          );
        })}
      </MapContainer>

      <InfoPanel vehicle={clicked} onClose={() => setClicked(null)} />

      <style jsx global>{`
        /* ── Reset wrapper ── */
        .c3-wrap { background: transparent !important; border: none !important; }

        /* ── Car container — compact ── */
        .c3 {
          position: relative; width: 32px; height: 32px;
          display: flex; align-items: center; justify-content: center;
          transition: transform 0.4s cubic-bezier(0.25,0.46,0.45,0.94);
        }

        /* ── Car Body — smaller, cleaner ── */
        .c3-car {
          position: relative; width: 14px; height: 24px;
          border-radius: 5px 5px 4px 4px;
          border: 1.2px solid; z-index: 2;
          box-shadow: 0 1px 4px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.2);
        }

        /* Windshield front */
        .c3-ws-f {
          position: absolute; top: 2px; left: 2px; right: 2px; height: 5px;
          background: linear-gradient(180deg, rgba(180,220,255,0.85), rgba(100,170,230,0.6));
          border-radius: 2px 2px 0 0;
        }

        /* Roof */
        .c3-roof {
          position: absolute; top: 8px; left: 2px; right: 2px; height: 5px;
          background: linear-gradient(180deg, rgba(255,255,255,0.15), rgba(255,255,255,0.02));
          border-radius: 1px;
        }

        /* Windshield rear */
        .c3-ws-r {
          position: absolute; bottom: 2px; left: 2px; right: 2px; height: 4px;
          background: linear-gradient(0deg, rgba(140,170,200,0.6), rgba(100,150,200,0.3));
          border-radius: 0 0 2px 2px;
        }

        /* Wheels */
        .c3-wh {
          position: absolute; width: 3.5px; height: 5px;
          background: #1a1a1a; border-radius: 1px;
        }
        .c3-w1 { top: 3px;  left: -2px; }
        .c3-w2 { top: 3px;  right: -2px; }
        .c3-w3 { bottom: 3px; left: -2px; }
        .c3-w4 { bottom: 3px; right: -2px; }

        /* Headlights */
        .c3-hl {
          position: absolute; top: 0.5px; width: 2.5px; height: 2px;
          background: #fef08a; border-radius: 1px;
          box-shadow: 0 0 3px rgba(254,240,138,0.8);
        }
        .c3-h1 { left: 1.5px; }
        .c3-h2 { right: 1.5px; }

        /* Taillights */
        .c3-tl {
          position: absolute; bottom: 0.5px; width: 2.5px; height: 1.5px;
          background: #ef4444; border-radius: 1px;
          box-shadow: 0 0 2px rgba(239,68,68,0.6);
        }
        .c3-t1 { left: 1.5px; }
        .c3-t2 { right: 1.5px; }

        /* Ground shadow — subtle */
        .c3-shd {
          position: absolute; bottom: 0; left: 50%; transform: translateX(-50%);
          width: 18px; height: 5px;
          background: radial-gradient(ellipse, rgba(0,0,0,0.2) 0%, transparent 70%);
          border-radius: 50%; z-index: 1;
        }

        /* ── Dispatched — clean cyan highlight ── */
        .c3-disp .c3-car {
          border-color: #06b6d4 !important;
          box-shadow: 0 1px 4px rgba(0,0,0,0.35), 0 0 6px rgba(6,182,212,0.6);
        }

        /* ── Selected — blue ring ── */
        .c3-sel .c3-car {
          border-color: #60a5fa !important;
          box-shadow: 0 1px 4px rgba(0,0,0,0.35), 0 0 8px rgba(96,165,250,0.6);
          transform: scale(1.15);
        }

        /* ── Offline — greyed out ── */
        .c3-off .c3-car { filter: grayscale(1) opacity(0.4); }
        .c3-off .c3-hl { background: #9ca3af; box-shadow: none; }
        .c3-off .c3-tl { background: #6b7280; box-shadow: none; }

        /* ── Map overlay animations ── */
        .smooth-risk-circle { transition: all 0.8s ease-in-out; }
        .leaflet-overlay-pane .route-line { stroke-dashoffset:0; animation: dash 1.5s linear infinite; }
        @keyframes dash { to{stroke-dashoffset:-50} }

        @media (prefers-reduced-motion: reduce) {
          .leaflet-overlay-pane .route-line { animation:none !important; }
        }
      `}</style>
    </div>
  );
}
