"use client";

import { useEffect, useRef, useState } from "react";
import {
  MapContainer, TileLayer, Circle, useMap, CircleMarker, Popup, Tooltip,
} from "react-leaflet";
import { type PredictionResponse, type RiskZone } from "@/lib/api";
import { BASE_LAYERS, LABELS_OVERLAY, getLayer, INDIA_BOUNDS, INDIA_CENTER } from "@/lib/mapTiles";

const SEV: Record<string, string> = {
  critical: "#ef4444", high: "#f97316", medium: "#eab308", low: "#10b981",
  High: "#ef4444", Medium: "#f59e0b", Low: "#10b981",
};

/* Dashboard city filter names -> MoRTH dataset names */
const CITY_ALIAS: Record<string, string> = { Bangalore: "Bengaluru" };

interface RiskZoneMapProps {
  height?: string; className?: string;
  prediction?: PredictionResponse | null;
  riskZones?: RiskZone[];
  selectedCity?: string;
}

function FlyTo({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { map.setView(center, zoom); first.current = false; return; }
    map.flyTo(center, zoom, { duration: 1.1 });
  }, [center, zoom, map]);
  return null;
}

const glass = { background: "rgba(10,12,20,0.88)", backdropFilter: "blur(12px)" } as const;

export default function RiskZoneMap({ height = "420px", className = "", prediction = null, riskZones = [], selectedCity = "All India" }: RiskZoneMapProps) {
  const [layerId, setLayerId] = useState("dark");
  const layer = getLayer(layerId);

  const cityName = CITY_ALIAS[selectedCity] ?? selectedCity;
  const focus = riskZones.find((z) => z.area === cityName);
  const center: [number, number] = focus ? [focus.lat, focus.lng] : INDIA_CENTER;
  const zoom = focus ? 10 : 5;

  const visible = selectedCity === "All India" || !focus ? riskZones : riskZones.filter((z) => z.area === cityName);
  const totalAcc = visible.reduce((s, z) => s + (z.accident_count || 0), 0);
  const totalDeaths = visible.reduce((s, z) => s + (z.deaths || 0), 0);
  const high = visible.filter((z) => z.risk_level === "High").length;
  const predColor = prediction ? SEV[prediction.risk_level] : "#10b981";

  return (
    <div className={`card-lifted relative z-0 overflow-hidden ${className}`} style={{ height, width: "100%" }}>
      {/* Title / stats */}
      <div className="absolute top-3 left-3 z-[1000] rounded-[var(--radius-md)] shadow-lg border border-white/10" style={glass}>
        <div className="px-3.5 py-2.5">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="h-2 w-2 rounded-full bg-[#ef4444] animate-pulse" />
            <span className="text-[11px] font-bold tracking-[0.08em] text-white/90 uppercase">
              {focus ? `${cityName} Risk Profile` : "National Risk Intelligence"}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3 text-[10px]">
            <div><span className="text-white/40 block">Accidents ’22</span><span className="font-bold text-white text-[13px]">{totalAcc.toLocaleString()}</span></div>
            <div><span className="text-white/40 block">Deaths ’22</span><span className="font-bold text-[#ef4444] text-[13px]">{totalDeaths.toLocaleString()}</span></div>
            <div><span className="text-white/40 block">High-risk</span><span className="font-bold text-[#f97316] text-[13px]">{high}/{visible.length}</span></div>
          </div>
          <div className="text-[8px] text-white/30 mt-1">Source: MoRTH Road Accidents in India 2022</div>
        </div>
      </div>

      {/* Layer switcher + legend */}
      <div className="absolute top-3 right-3 z-[1000] rounded-[var(--radius-md)] shadow-lg border border-white/10" style={glass}>
        <div className="px-3 py-2.5 space-y-2">
          <div className="flex flex-wrap gap-1 max-w-[180px]">
            {BASE_LAYERS.map((l) => (
              <button key={l.id} onClick={() => setLayerId(l.id)}
                className={`text-[9px] font-bold px-2 py-1 rounded transition-colors ${layerId === l.id ? "bg-cyan-500 text-white" : "bg-white/5 text-white/60 hover:bg-white/10"}`}>
                {l.name}
              </button>
            ))}
          </div>
          <div className="space-y-1">
            {[["High", "Top 20% risk index"], ["Medium", "Top 50%"], ["Low", "Below median"]].map(([k, d]) => (
              <div key={k} className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: SEV[k] }} />
                <span className="text-[9px] font-semibold text-white/80">{k}</span>
                <span className="text-[8px] text-white/30">{d}</span>
              </div>
            ))}
          </div>
          <div className="text-[8px] text-white/30">Risk index = accidents × fatality rate</div>
        </div>
      </div>

      {/* Prediction badge */}
      {prediction && (
        <div className="absolute bottom-3 left-3 z-[1000] rounded-[var(--radius-md)] shadow-lg border border-white/10 max-w-[260px]" style={glass}>
          <div className="px-3.5 py-2.5">
            <div className="text-[8px] uppercase font-bold tracking-[0.1em] text-white/40 mb-1">
              Forecast · {prediction.nearest_city ?? "—"}
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: predColor, boxShadow: `0 0 8px ${predColor}80` }} />
              <span className="text-[14px] font-bold uppercase" style={{ color: predColor }}>{prediction.risk_level}</span>
              <span className="text-[10px] text-white/50">
                {prediction.percentile != null ? `${prediction.percentile.toFixed(0)}th pct` : `${(prediction.risk_score * 100).toFixed(0)}%`}
              </span>
            </div>
            {prediction.p_fatal_or_serious != null && (
              <div className="text-[10px] text-white/50 mt-1">
                P(fatal/serious) <strong className="text-white/80">{(prediction.p_fatal_or_serious * 100).toFixed(1)}%</strong>
              </div>
            )}
            <div className="mt-1.5 h-1 rounded-full bg-white/10 overflow-hidden w-28">
              <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${prediction.risk_score * 100}%`, backgroundColor: predColor }} />
            </div>
          </div>
        </div>
      )}

      <MapContainer center={center} zoom={zoom} minZoom={4} maxBounds={INDIA_BOUNDS} maxBoundsViscosity={0.8}
        scrollWheelZoom zoomControl style={{ height: "100%", width: "100%", zIndex: 0 }}>
        <TileLayer key={layer.id} url={layer.url} attribution={layer.attribution} maxZoom={layer.maxZoom}
          subdomains={layer.subdomains ?? "abc"} detectRetina={layer.id === "osm"} />
        {layer.id === "satellite" && (
          <TileLayer url={LABELS_OVERLAY.url} attribution={LABELS_OVERLAY.attribution} subdomains={LABELS_OVERLAY.subdomains} />
        )}
        <FlyTo center={center} zoom={zoom} />

        {visible.map((z) => {
          const color = SEV[z.risk_level];
          return (
            <Circle key={`halo-${z.area}`} center={[z.lat, z.lng]} radius={z.radius}
              pathOptions={{ color, fillColor: color, weight: 1, fillOpacity: 0.1, dashArray: z.risk_level === "High" ? "4 6" : undefined }} />
          );
        })}

        {visible.map((z) => {
          const color = SEV[z.risk_level];
          const r = 4 + Math.sqrt(z.accident_count || 0) / 8;
          return (
            <CircleMarker key={`city-${z.area}`} center={[z.lat, z.lng]} radius={r}
              pathOptions={{ color: "#fff", weight: 1.5, fillColor: color, fillOpacity: 0.9 }}>
              <Popup>
                <div style={{ fontFamily: "var(--font-display)", minWidth: 200 }}>
                  <strong style={{ fontSize: 13 }}>{z.area}</strong>
                  <span style={{ fontSize: 10, color: "#64748b" }}> · {z.state}</span>
                  <div style={{ marginTop: 6, display: "inline-block", fontSize: 10, fontWeight: 700, color, background: `${color}20`, padding: "2px 6px", borderRadius: 4 }}>
                    {z.risk_level.toUpperCase()} RISK · index {z.risk_index?.toFixed(1)}
                  </div>
                  <table style={{ fontSize: 11, marginTop: 6, width: "100%" }}>
                    <tbody>
                      <tr><td>Accidents</td><td style={{ textAlign: "right" }}><b>{z.accident_count.toLocaleString()}</b></td></tr>
                      <tr><td>Deaths</td><td style={{ textAlign: "right" }}><b>{z.deaths?.toLocaleString() ?? "—"}</b></td></tr>
                      <tr><td>Fatality rate</td><td style={{ textAlign: "right" }}><b>{z.fatality_rate != null ? `${(z.fatality_rate * 100).toFixed(1)}%` : "—"}</b></td></tr>
                    </tbody>
                  </table>
                  <div style={{ fontSize: 9, color: "#94a3b8", marginTop: 4 }}>{z.source}</div>
                </div>
              </Popup>
              {(z.risk_level === "High" || focus) && (
                <Tooltip direction="top" offset={[0, -6]} className="!text-[10px] !font-bold">{z.area}</Tooltip>
              )}
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
