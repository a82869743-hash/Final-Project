"use client";

import { useState } from "react";
import { MapContainer, CircleMarker, Tooltip, Polyline } from "react-leaflet";
import BaseTiles from "@/components/map/BaseTiles";
import type { FleetPlan } from "@/lib/api";
import { BASE_LAYERS, INDIA_BOUNDS } from "@/lib/mapTiles";

/** The 53 MoRTH cities span roughly this box — fit it so south India is never cut off */
const CITY_BOUNDS: [[number, number], [number, number]] = [[8.2, 69.5], [34.4, 89.5]];

const C = { need: "#dc2626", unmet: "#d97706", surplus: "#0284c7", ok: "#16a34a", move: "#00677f" };

interface Props {
  plan: FleetPlan | null;
  selected: string | null;
  onSelect: (city: string) => void;
  height?: string;
}

export default function FleetPlanMap({ plan, selected, onSelect, height = "440px" }: Props) {
  const [layerId, setLayerId] = useState("streets");
  const cities = plan?.cities ?? [];
  const byName = Object.fromEntries(cities.map((c) => [c.city, c]));
  const maxAcc = Math.max(0.01, ...cities.map((c) => c.expected_accidents));

  return (
    <div className="card-lifted relative overflow-hidden z-0" style={{ height }}>
      <div className="absolute top-3 right-3 z-[1000] flex gap-1 rounded-md p-1 bg-white/90 shadow backdrop-blur">
        {BASE_LAYERS.slice(0, 3).map((l) => (
          <button key={l.id} onClick={() => setLayerId(l.id)}
            className={`text-[9px] font-bold px-2 py-1 rounded transition-colors ${layerId === l.id ? "bg-[var(--color-primary)] text-white" : "text-[var(--color-on-surface-muted)] hover:bg-slate-100"}`}>
            {l.name}
          </button>
        ))}
      </div>
      <div className="absolute bottom-3 left-3 z-[1000] rounded-md px-3 py-2 bg-white/90 shadow backdrop-blur text-[9px] space-y-0.5">
        <div className="font-bold text-[var(--color-on-surface)] mb-1">Circle size = expected accidents</div>
        {[
          [C.need, "Needs units (reachable)"], [C.unmet, "Unmet — no unit in range"],
          [C.surplus, "Surplus units"], [C.ok, "Balanced"],
        ].map(([c, l]) => (
          <div key={l} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: c }} />{l}</div>
        ))}
        <div className="flex items-center gap-1.5"><span className="h-0.5 w-3" style={{ background: C.move }} />Relocation</div>
      </div>
      <MapContainer bounds={CITY_BOUNDS} boundsOptions={{ padding: [8, 8] }} zoomSnap={0.25} zoomDelta={0.5} minZoom={4} maxBounds={INDIA_BOUNDS} maxBoundsViscosity={0.8}
        scrollWheelZoom style={{ height: "100%", width: "100%" }}>
        <BaseTiles layerId={layerId} />
        {plan?.moves.map((m, i) => {
          const a = byName[m.from], b = byName[m.to];
          if (!a || !b) return null;
          return (
            <Polyline key={`mv-${i}`} positions={[[a.lat, a.lng], [b.lat, b.lng]]}
              pathOptions={{ color: C.move, weight: 3, dashArray: "6 6", opacity: 0.9 }}>
              <Tooltip sticky>{m.units} unit{m.units > 1 ? "s" : ""}: {m.from} → {m.to} · {m.distance_km} km · ~{m.drive_min} min</Tooltip>
            </Polyline>
          );
        })}
        {cities.map((c) => {
          const color = c.unmet > 0 ? C.unmet : c.delta > 0 ? C.need : c.delta < 0 ? C.surplus : C.ok;
          const isSel = c.city === selected;
          return (
            <CircleMarker key={c.city} center={[c.lat, c.lng]}
              radius={(isSel ? 4 : 0) + 5 + 16 * Math.sqrt(c.expected_accidents / maxAcc)}
              eventHandlers={{ click: () => onSelect(c.city) }}
              pathOptions={{ color: isSel ? "#1e293b" : "#ffffff", weight: isSel ? 3 : 1.5, fillColor: color, fillOpacity: 0.75 }}>
              <Tooltip direction="top" offset={[0, -6]}>
                <div style={{ fontSize: 11 }}>
                  <b>{c.city}</b> · {c.expected_accidents.toFixed(1)} expected accidents<br />
                  Units now {c.current_units} → target {c.target_units}
                  {c.unmet > 0 && <><br /><span style={{ color: C.unmet, fontWeight: 700 }}>{c.unmet} unit(s) unreachable in time</span></>}
                </div>
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
