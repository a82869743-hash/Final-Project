"use client";

import { useEffect, useState } from "react";
import { MapContainer, CircleMarker, Popup, Tooltip, useMap, Polyline } from "react-leaflet";
import BaseTiles from "@/components/map/BaseTiles";
import type { Hospital, HospitalRecommendation } from "@/lib/api";
import { BASE_LAYERS, INDIA_BOUNDS, INDIA_CENTER } from "@/lib/mapTiles";

const COLORS = { normal: "#16a34a", moderate: "#0284c7", high: "#d97706", critical: "#dc2626" } as const;

function FocusOn({ target }: { target: [number, number] | null }) {
  const map = useMap();
  useEffect(() => { if (target) map.flyTo(target, 12, { duration: 1 }); }, [target, map]);
  return null;
}

interface Props {
  hospitals: Hospital[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  recommendations?: HospitalRecommendation[];
  height?: string;
}

export default function HospitalMap({ hospitals, selectedId, onSelect, recommendations = [], height = "380px" }: Props) {
  const [layerId, setLayerId] = useState("streets");
  const sel = hospitals.find((h) => h.id === selectedId) ?? null;

  return (
    <div className="card-lifted relative overflow-hidden z-0" style={{ height }}>
      <div className="absolute top-3 right-3 z-[1000] flex gap-1 rounded-md p-1 bg-white/90 shadow">
        {BASE_LAYERS.slice(0, 3).map((l) => (
          <button key={l.id} onClick={() => setLayerId(l.id)}
            className={`text-[9px] font-bold px-2 py-1 rounded ${layerId === l.id ? "bg-[var(--color-primary)] text-white" : "text-[var(--color-on-surface-muted)] hover:bg-slate-100"}`}>
            {l.name}
          </button>
        ))}
      </div>
      <div className="absolute bottom-3 left-3 z-[1000] rounded-md px-3 py-2 bg-white/90 shadow text-[9px] space-y-0.5">
        {Object.entries(COLORS).map(([k, c]) => (
          <div key={k} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: c }} /><span className="capitalize">{k}</span></div>
        ))}
        <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full border-2 border-black" /><span>On diversion</span></div>
      </div>
      <MapContainer center={INDIA_CENTER} zoom={5} minZoom={4} maxBounds={INDIA_BOUNDS} maxBoundsViscosity={0.8}
        scrollWheelZoom style={{ height: "100%", width: "100%" }}>
        <BaseTiles layerId={layerId} />
        <FocusOn target={sel ? [sel.lat, sel.lng] : null} />
        {sel && recommendations.map((r) => (
          <Polyline key={`l-${r.id}`} positions={[[sel.lat, sel.lng], [r.lat, r.lng]]} pathOptions={{ color: "#00677f", weight: 2, dashArray: "4 6" }} />
        ))}
        {hospitals.map((h) => {
          const c = COLORS[h.status];
          const isSel = h.id === selectedId;
          return (
            <CircleMarker key={h.id} center={[h.lat, h.lng]} radius={isSel ? 11 : 5 + Math.sqrt(h.total_beds) / 12}
              eventHandlers={{ click: () => onSelect(h.id) }}
              pathOptions={{ color: h.accepting_critical ? "#ffffff" : "#000000", weight: h.accepting_critical ? 1.5 : 3, fillColor: c, fillOpacity: 0.9 }}>
              <Tooltip direction="top" offset={[0, -6]}>{h.name}</Tooltip>
              <Popup>
                <div style={{ minWidth: 190, fontSize: 11 }}>
                  <b style={{ fontSize: 12 }}>{h.name}</b><br />
                  <span style={{ color: "#64748b" }}>{h.city} · {h.type}</span>
                  <div style={{ marginTop: 6 }}>Occupancy <b style={{ color: c }}>{h.occupancy_pct}%</b></div>
                  <div>ICU free <b>{h.wards.icu.available}</b> · Vent free <b>{h.wards.ventilator.available}</b></div>
                  <div>ER wait <b>{h.er_wait_min} min</b> · O₂ <b>{h.oxygen_pct}%</b></div>
                  {!h.accepting_critical && <div style={{ color: "#dc2626", fontWeight: 700, marginTop: 4 }}>ON DIVERSION</div>}
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
