"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import {
  MapContainer, TileLayer, Circle, useMap, CircleMarker, Popup, Tooltip,
} from "react-leaflet";
import { type PredictionResponse, type RiskZone } from "@/lib/api";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
});

const SEV: Record<string, string> = {
  critical: "#ef4444", high: "#f97316", medium: "#eab308", low: "#10b981",
};

/* ── Region coordinate bounds for Indian cities ── */
const REGION_BOUNDS: Record<string, { center: [number, number]; zoom: number }> = {
  "All India":  { center: [22.5, 79.0], zoom: 5 },
  "Delhi":      { center: [28.6139, 77.2090], zoom: 11 },
  "Mumbai":     { center: [19.0760, 72.8777], zoom: 11 },
  "Bangalore":  { center: [12.9716, 77.5946], zoom: 11 },
  "Chennai":    { center: [13.0827, 80.2707], zoom: 11 },
  "Kolkata":    { center: [22.5726, 88.3639], zoom: 11 },
  "Hyderabad":  { center: [17.3850, 78.4867], zoom: 11 },
  "Ahmedabad":  { center: [23.0225, 72.5714], zoom: 11 },
  "Pune":       { center: [18.5204, 73.8567], zoom: 11 },
  "Jaipur":     { center: [26.9124, 75.7873], zoom: 11 },
  "Surat":      { center: [21.1702, 72.8311], zoom: 11 },
  "Lucknow":    { center: [26.8467, 80.9462], zoom: 11 },
  "Kanpur":     { center: [26.4499, 80.3319], zoom: 11 },
  "Nagpur":     { center: [21.1458, 79.0882], zoom: 11 },
  "Indore":     { center: [22.7196, 75.8577], zoom: 11 },
  "Bhopal":     { center: [23.2599, 77.4126], zoom: 11 },
};

/* ── Accident hotspot data ── */
interface Hotspot {
  lat: number; lng: number; label: string; incidents: number;
  severity: string; region: string; type: string;
}

const HOTSPOTS: Hotspot[] = [
  { lat: 28.6139, lng: 77.2090, label: "Delhi Central", incidents: 142, severity: "critical", region: "Delhi", type: "urban" },
  { lat: 28.5355, lng: 77.3910, label: "Noida Expressway", incidents: 78, severity: "high", region: "Delhi", type: "highway" },
  { lat: 28.7041, lng: 77.1025, label: "Rohini Sector", incidents: 53, severity: "medium", region: "Delhi", type: "urban" },
  { lat: 28.4595, lng: 77.0266, label: "Gurugram NH-48", incidents: 91, severity: "high", region: "Delhi", type: "highway" },
  { lat: 28.6692, lng: 77.4538, label: "Ghaziabad", incidents: 44, severity: "medium", region: "Delhi", type: "urban" },
  { lat: 19.0760, lng: 72.8777, label: "Mumbai Central", incidents: 128, severity: "critical", region: "Mumbai", type: "urban" },
  { lat: 19.2183, lng: 72.9781, label: "Thane-Mulund", incidents: 67, severity: "high", region: "Mumbai", type: "highway" },
  { lat: 19.0330, lng: 73.0297, label: "Navi Mumbai", incidents: 45, severity: "medium", region: "Mumbai", type: "urban" },
  { lat: 18.9388, lng: 72.8354, label: "Worli Sea Link", incidents: 32, severity: "medium", region: "Mumbai", type: "bridge" },
  { lat: 19.1136, lng: 72.8697, label: "Andheri Junction", incidents: 56, severity: "medium", region: "Mumbai", type: "junction" },
  { lat: 12.9716, lng: 77.5946, label: "Bangalore MG Road", incidents: 95, severity: "high", region: "Bangalore", type: "urban" },
  { lat: 12.9352, lng: 77.6245, label: "Silk Board", incidents: 73, severity: "high", region: "Bangalore", type: "junction" },
  { lat: 13.0358, lng: 77.5970, label: "Hebbal Flyover", incidents: 48, severity: "medium", region: "Bangalore", type: "flyover" },
  { lat: 12.8438, lng: 77.6593, label: "Electronic City", incidents: 35, severity: "medium", region: "Bangalore", type: "tech_zone" },
  { lat: 13.0827, lng: 80.2707, label: "Chennai Central", incidents: 87, severity: "high", region: "Chennai", type: "urban" },
  { lat: 13.0067, lng: 80.2206, label: "Guindy", incidents: 42, severity: "medium", region: "Chennai", type: "industrial" },
  { lat: 12.9165, lng: 80.1270, label: "GST Road", incidents: 63, severity: "high", region: "Chennai", type: "highway" },
  { lat: 22.5726, lng: 88.3639, label: "Kolkata Central", incidents: 76, severity: "high", region: "Kolkata", type: "urban" },
  { lat: 22.6520, lng: 88.4463, label: "Salt Lake", incidents: 29, severity: "low", region: "Kolkata", type: "urban" },
  { lat: 17.3850, lng: 78.4867, label: "Hyderabad HITEC", incidents: 82, severity: "high", region: "Hyderabad", type: "tech_zone" },
  { lat: 17.4400, lng: 78.3489, label: "Miyapur", incidents: 38, severity: "medium", region: "Hyderabad", type: "urban" },
  { lat: 17.3616, lng: 78.4747, label: "Mehdipatnam", incidents: 51, severity: "medium", region: "Hyderabad", type: "junction" },
  { lat: 23.0225, lng: 72.5714, label: "Ahmedabad SG Hwy", incidents: 64, severity: "high", region: "Ahmedabad", type: "highway" },
  { lat: 23.0733, lng: 72.6267, label: "Naroda", incidents: 31, severity: "medium", region: "Ahmedabad", type: "industrial" },
  { lat: 18.5204, lng: 73.8567, label: "Pune FC Road", incidents: 58, severity: "medium", region: "Pune", type: "urban" },
  { lat: 18.5913, lng: 73.7389, label: "Hinjewadi IT", incidents: 41, severity: "medium", region: "Pune", type: "tech_zone" },
  { lat: 18.4603, lng: 73.8493, label: "Katraj Tunnel", incidents: 37, severity: "medium", region: "Pune", type: "tunnel" },
  { lat: 26.9124, lng: 75.7873, label: "Jaipur MI Road", incidents: 55, severity: "medium", region: "Jaipur", type: "urban" },
  { lat: 26.8553, lng: 75.7634, label: "Tonk Road", incidents: 43, severity: "medium", region: "Jaipur", type: "highway" },
  { lat: 21.1702, lng: 72.8311, label: "Surat Ring Road", incidents: 49, severity: "medium", region: "Surat", type: "highway" },
  { lat: 26.8467, lng: 80.9462, label: "Lucknow Gomti", incidents: 62, severity: "high", region: "Lucknow", type: "urban" },
  { lat: 26.4499, lng: 80.3319, label: "Kanpur GT Road", incidents: 47, severity: "medium", region: "Kanpur", type: "highway" },
  { lat: 21.1458, lng: 79.0882, label: "Nagpur Zero Mile", incidents: 41, severity: "medium", region: "Nagpur", type: "urban" },
  { lat: 22.7196, lng: 75.8577, label: "Indore AB Road", incidents: 38, severity: "medium", region: "Indore", type: "highway" },
  { lat: 23.2599, lng: 77.4126, label: "Bhopal Lake", incidents: 44, severity: "medium", region: "Bhopal", type: "urban" },
  { lat: 27.18, lng: 78.02, label: "NH-2 Agra Corridor", incidents: 68, severity: "critical", region: "All India", type: "highway" },
  { lat: 19.88, lng: 75.32, label: "NH-60 Maharashtra", incidents: 52, severity: "high", region: "All India", type: "highway" },
  { lat: 24.58, lng: 73.71, label: "NH-8 Rajasthan", incidents: 45, severity: "medium", region: "All India", type: "highway" },
  { lat: 16.50, lng: 80.64, label: "NH-65 AP Corridor", incidents: 39, severity: "medium", region: "All India", type: "highway" },
  { lat: 28.98, lng: 77.71, label: "NH-58 UP Corridor", incidents: 57, severity: "high", region: "All India", type: "highway" },
  { lat: 14.68, lng: 77.60, label: "NH-44 South", incidents: 43, severity: "medium", region: "All India", type: "highway" },
  { lat: 22.31, lng: 70.80, label: "NH-27 Gujarat", incidents: 32, severity: "low", region: "All India", type: "highway" },
  { lat: 20.94, lng: 77.75, label: "NH-6 Vidarbha", incidents: 37, severity: "medium", region: "All India", type: "highway" },
  { lat: 25.6093, lng: 85.1376, label: "Patna", incidents: 52, severity: "high", region: "All India", type: "urban" },
  { lat: 15.2993, lng: 74.1240, label: "Goa", incidents: 29, severity: "low", region: "All India", type: "urban" },
  { lat: 9.9312, lng: 76.2673, label: "Kochi", incidents: 31, severity: "low", region: "All India", type: "urban" },
  { lat: 11.0168, lng: 76.9558, label: "Coimbatore", incidents: 34, severity: "low", region: "All India", type: "urban" },
  { lat: 20.2961, lng: 85.8245, label: "Bhubaneswar", incidents: 35, severity: "medium", region: "All India", type: "urban" },
  { lat: 26.1445, lng: 91.7362, label: "Guwahati", incidents: 27, severity: "low", region: "All India", type: "urban" },
  { lat: 30.7333, lng: 76.7794, label: "Chandigarh", incidents: 33, severity: "low", region: "All India", type: "urban" },
  { lat: 22.3072, lng: 73.1812, label: "Vadodara", incidents: 36, severity: "medium", region: "All India", type: "urban" },
  { lat: 25.3176, lng: 82.9739, label: "Varanasi", incidents: 42, severity: "medium", region: "All India", type: "urban" },
  { lat: 23.3441, lng: 85.3096, label: "Ranchi", incidents: 28, severity: "low", region: "All India", type: "urban" },
];

/* ── Fly to region on filter change ── */
function FlyToRegion({ region }: { region: string }) {
  const map = useMap();
  const prevRegion = useRef(region);
  useEffect(() => {
    const r = REGION_BOUNDS[region] || REGION_BOUNDS["All India"];
    if (region !== prevRegion.current) {
      map.flyTo(r.center, r.zoom, { duration: 1.2 });
      prevRegion.current = region;
    }
  }, [region, map]);
  return null;
}

/* ── Initial fit ── */
function InitialFit({ region }: { region: string }) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (!fitted.current) {
      const r = REGION_BOUNDS[region] || REGION_BOUNDS["All India"];
      map.setView(r.center, r.zoom);
      fitted.current = true;
    }
  }, [map, region]);
  return null;
}

/* ── Props ── */
interface RiskZoneMapProps {
  height?: string; className?: string;
  prediction?: PredictionResponse | null;
  riskZones?: RiskZone[];
  selectedCity?: string;
}

export default function RiskZoneMap({ height = "420px", className = "", prediction = null, riskZones = [], selectedCity = "All India" }: RiskZoneMapProps) {
  const region = REGION_BOUNDS[selectedCity] || REGION_BOUNDS["All India"];

  const visibleHotspots = selectedCity === "All India"
    ? HOTSPOTS
    : HOTSPOTS.filter(h => h.region === selectedCity);

  const totalIncidents = visibleHotspots.reduce((s, h) => s + h.incidents, 0);
  const criticalCount = visibleHotspots.filter(h => h.severity === "critical").length;
  const highCount = visibleHotspots.filter(h => h.severity === "high").length;
  const mediumCount = visibleHotspots.filter(h => h.severity === "medium").length;

  const typeIcons: Record<string, string> = {
    highway: "🛣️", urban: "🏙️", junction: "🔀", flyover: "🌉",
    bridge: "🌉", tunnel: "🚇", tech_zone: "💻", industrial: "🏭",
  };

  return (
    <div className={`card-lifted relative z-0 overflow-hidden ${className}`} style={{ height, width: "100%" }}>
      {/* ── Title Overlay ── */}
      <div className="absolute top-3 left-3 z-[1000] rounded-[var(--radius-md)] shadow-lg border border-[rgba(255,255,255,0.08)]" style={{ background: "rgba(10,12,20,0.92)", backdropFilter: "blur(12px)" }}>
        <div className="px-3.5 py-2.5">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="h-2 w-2 rounded-full bg-[#ef4444] animate-pulse" />
            <span className="text-[11px] font-bold tracking-[0.08em] text-white/90 uppercase">
              {selectedCity === "All India" ? "National Risk Intelligence" : `${selectedCity} Risk Zone`}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-3 text-[10px]">
            <div>
              <span className="text-white/40 block">Incidents</span>
              <span className="font-bold text-white text-[13px]">{totalIncidents}</span>
            </div>
            <div>
              <span className="text-white/40 block">Critical</span>
              <span className="font-bold text-[#ef4444] text-[13px]">{criticalCount}</span>
            </div>
            <div>
              <span className="text-white/40 block">High</span>
              <span className="font-bold text-[#f97316] text-[13px]">{highCount}</span>
            </div>
            <div>
              <span className="text-white/40 block">Zones</span>
              <span className="font-bold text-cyan-400 text-[13px]">{visibleHotspots.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Legend ── */}
      <div className="absolute top-3 right-3 z-[1000] rounded-[var(--radius-md)] shadow-lg border border-[rgba(255,255,255,0.08)]" style={{ background: "rgba(10,12,20,0.92)", backdropFilter: "blur(12px)" }}>
        <div className="px-3 py-2.5">
          <span className="text-[8px] font-bold tracking-[0.1em] text-white/40 uppercase block mb-1.5">Severity</span>
          <div className="space-y-1">
            {[
              { color: "#ef4444", label: "Critical", desc: ">100" },
              { color: "#f97316", label: "High", desc: "60–100" },
              { color: "#eab308", label: "Medium", desc: "30–60" },
              { color: "#10b981", label: "Low", desc: "<30" },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: item.color, boxShadow: `0 0 6px ${item.color}60` }} />
                <span className="text-[9px] font-semibold text-white/80">{item.label}</span>
                <span className="text-[8px] text-white/30">{item.desc}</span>
              </div>
            ))}
          </div>
          {/* Gradient bar */}
          <div className="mt-2 h-1 rounded-full w-full" style={{ background: "linear-gradient(90deg, #10b981, #eab308, #f97316, #ef4444)" }} />
        </div>
      </div>

      {/* ── ML Prediction Badge ── */}
      {prediction && (
        <div className="absolute bottom-3 left-3 z-[1000] rounded-[var(--radius-md)] shadow-lg border border-[rgba(255,255,255,0.08)]" style={{ background: "rgba(10,12,20,0.92)", backdropFilter: "blur(12px)" }}>
          <div className="px-3.5 py-2.5">
            <div className="text-[8px] uppercase font-bold tracking-[0.1em] text-white/40 mb-1">ML Prediction</div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: SEV[prediction.risk_level], boxShadow: `0 0 8px ${SEV[prediction.risk_level]}80` }} />
              <span className="text-[14px] font-bold uppercase" style={{ color: SEV[prediction.risk_level] }}>
                {prediction.risk_level}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-[10px] text-white/50">
                Risk <strong className="text-white/80">{(prediction.risk_score * 100).toFixed(0)}%</strong>
              </span>
              <span className="text-[10px] text-white/50">
                Conf <strong className="text-white/80">{(prediction.confidence * 100).toFixed(0)}%</strong>
              </span>
            </div>
            {/* Mini progress */}
            <div className="mt-1.5 h-1 rounded-full bg-white/10 overflow-hidden w-24">
              <div className="h-full rounded-full transition-all duration-1000" style={{
                width: `${prediction.risk_score * 100}%`,
                backgroundColor: SEV[prediction.risk_level],
                boxShadow: `0 0 4px ${SEV[prediction.risk_level]}`,
              }} />
            </div>
          </div>
        </div>
      )}

      {/* ── Stats Badge (bottom-right) ── */}
      <div className="absolute bottom-3 right-3 z-[1000] rounded-[var(--radius-md)] shadow-lg border border-[rgba(255,255,255,0.08)]" style={{ background: "rgba(10,12,20,0.92)", backdropFilter: "blur(12px)" }}>
        <div className="px-3 py-2">
          <div className="text-[8px] uppercase font-bold tracking-[0.1em] text-white/40 mb-1">Zone Analysis</div>
          <div className="flex gap-4 text-[10px]">
            <div>
              <span className="text-white/40 block">Med</span>
              <span className="font-bold text-[#eab308]">{mediumCount}</span>
            </div>
            <div>
              <span className="text-white/40 block">Low</span>
              <span className="font-bold text-[#10b981]">{visibleHotspots.filter(h => h.severity === "low").length}</span>
            </div>
            <div>
              <span className="text-white/40 block">Types</span>
              <span className="font-bold text-cyan-400">{new Set(visibleHotspots.map(h => h.type)).size}</span>
            </div>
          </div>
        </div>
      </div>

      <MapContainer center={region.center} zoom={region.zoom} scrollWheelZoom={true} zoomControl={true} style={{ height: "100%", width: "100%", zIndex: 0 }}>
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          maxZoom={19}
        />
        <InitialFit region={selectedCity} />
        <FlyToRegion region={selectedCity} />

        {/* ML prediction zone overlay */}
        {prediction && (
          <>
            <Circle center={region.center} pathOptions={{
              fillColor: SEV[prediction.risk_level] || "#10b981",
              color: SEV[prediction.risk_level] || "#10b981",
              weight: 1, fillOpacity: 0.05,
            }} radius={selectedCity === "All India" ? 200000 : 8000} />
            <Circle center={region.center} pathOptions={{
              fillColor: SEV[prediction.risk_level] || "#10b981",
              color: "transparent",
              weight: 0, fillOpacity: 0.03,
            }} radius={selectedCity === "All India" ? 350000 : 14000} />
          </>
        )}

        {/* API risk zones */}
        {riskZones.map((zone, i) => (
          <Circle key={`rz-${i}`} center={[zone.lat, zone.lng]} pathOptions={{ fillColor: zone.color, color: zone.color, weight: 1, fillOpacity: 0.08 }} radius={zone.radius} />
        ))}

        {/* Accident hotspots */}
        {visibleHotspots.map((spot, i) => {
          const color = SEV[spot.severity] || "#10b981";
          const sz = spot.severity === "critical" ? 10 : spot.severity === "high" ? 8 : spot.severity === "medium" ? 6 : 4;
          return (
            <CircleMarker key={`ah-${i}`} center={[spot.lat, spot.lng]} radius={sz} pathOptions={{
              color, fillColor: color,
              fillOpacity: spot.severity === "critical" ? 0.9 : spot.severity === "high" ? 0.75 : 0.6,
              weight: spot.severity === "critical" ? 2.5 : 1.5,
            }}>
              <Popup>
                <div style={{ fontFamily: "var(--font-display)", minWidth: 180, background: "#0a0c14", color: "#fff", padding: 12, borderRadius: 8, margin: -12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <span style={{ fontSize: 16 }}>{typeIcons[spot.type] || "📍"}</span>
                    <strong style={{ fontSize: 13 }}>{spot.label}</strong>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 10, color, fontWeight: 700, textTransform: "uppercase", padding: "2px 6px", borderRadius: 4, background: `${color}20` }}>{spot.severity}</span>
                    <span style={{ fontSize: 10, color: "#94a3b8", padding: "2px 6px", borderRadius: 4, background: "rgba(255,255,255,0.05)" }}>{spot.type}</span>
                  </div>
                  <div style={{ fontSize: 12 }}>Incidents: <strong style={{ color: "#fff" }}>{spot.incidents}</strong></div>
                  <div style={{ fontSize: 10, color: "#64748b", marginTop: 4 }}>{spot.lat.toFixed(4)}, {spot.lng.toFixed(4)}</div>
                </div>
              </Popup>
              {(spot.severity === "critical" || (selectedCity !== "All India" && spot.severity === "high")) && (
                <Tooltip direction="top" offset={[0, -8]} permanent className="font-bold !text-[10px] !border-0 !shadow-sm !bg-white/90 !px-1.5 !py-0.5">{spot.incidents}</Tooltip>
              )}
            </CircleMarker>
          );
        })}

        {/* Pulsing rings around critical zones */}
        {visibleHotspots.filter(s => s.severity === "critical").map((spot, i) => (
          <Circle key={`pulse-${i}`} center={[spot.lat, spot.lng]} radius={selectedCity === "All India" ? 30000 : 2500} pathOptions={{ color: "#ef4444", fillColor: "#ef4444", fillOpacity: 0.04, weight: 1, dashArray: "4, 6" }} />
        ))}

        {/* Secondary glow rings for high severity */}
        {selectedCity !== "All India" && visibleHotspots.filter(s => s.severity === "high").map((spot, i) => (
          <Circle key={`glow-${i}`} center={[spot.lat, spot.lng]} radius={1800} pathOptions={{ color: "#f97316", fillColor: "#f97316", fillOpacity: 0.03, weight: 0.5, dashArray: "3, 8" }} />
        ))}
      </MapContainer>
    </div>
  );
}
