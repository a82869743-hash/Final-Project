"use client";

import { useEffect } from "react";
import L from "leaflet";
import { MapContainer, Marker, Popup, Circle, Polyline, useMap } from "react-leaflet";
import BaseTiles from "@/components/map/BaseTiles";
import { INDIA_BOUNDS } from "@/lib/mapTiles";

export interface EmergencyMapData {
  incident_location?: { latitude: number; longitude: number };
  all_nearby_ambulances?: { vehicle_id: string; latitude: number; longitude: number; distance_km: number; estimated_arrival_min: number; status: string }[];
  all_nearby_hospitals?: { hospital_name: string; latitude: number; longitude: number; distance_km: number; city: string; available_beds: number; total_beds: number; icu_beds: number; has_emergency: string }[];
  recommended_hospitals?: { id: string; name: string; lat: number; lng: number; eta_min: number; ward_available: number }[];
  dispatched?: { vehicle_id: string } | null;
}

const makeIcon = (color: string, label: string) => L.divIcon({
  className: "",
  html: `<div style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.35);color:#fff;font-size:12px;font-weight:700">${label}</div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

function AutoFit({ points }: { points: [number, number][] }) {
  const map = useMap();
  const key = points.map((p) => p.join(",")).join("|");
  useEffect(() => {
    if (points.length) map.fitBounds(L.latLngBounds(points), { padding: [50, 50], maxZoom: 13 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  return null;
}

export default function VoiceResultMap({ data }: { data: EmergencyMapData }) {
  const inc = data.incident_location;
  const center: [number, number] = inc ? [inc.latitude, inc.longitude] : [22.5, 79];
  const ambs = data.all_nearby_ambulances ?? [];
  const recs = data.recommended_hospitals ?? [];
  const hosps = data.all_nearby_hospitals ?? [];
  const points: [number, number][] = [
    center, ...ambs.map((a) => [a.latitude, a.longitude] as [number, number]),
    ...recs.map((h) => [h.lat, h.lng] as [number, number]),
  ];
  const dispatched = ambs.find((a) => a.vehicle_id === data.dispatched?.vehicle_id);
  const best = recs[0];

  return (
    <MapContainer center={center} zoom={11} maxBounds={INDIA_BOUNDS} scrollWheelZoom style={{ height: "100%", width: "100%", zIndex: 0 }}>
      <BaseTiles layerId="streets" />
      <AutoFit points={points} />
      <Circle center={center} radius={800} pathOptions={{ color: "#f59e0b", fillColor: "#f59e0b", fillOpacity: 0.15, weight: 2 }} />
      <Marker position={center} icon={makeIcon("#f59e0b", "!")}><Popup><b>Incident</b><br />{center[0].toFixed(4)}, {center[1].toFixed(4)}</Popup></Marker>
      {dispatched && <Polyline positions={[[dispatched.latitude, dispatched.longitude], center]} pathOptions={{ color: "#ef4444", weight: 3, dashArray: "6 6" }} />}
      {best && <Polyline positions={[center, [best.lat, best.lng]]} pathOptions={{ color: "#2563eb", weight: 3, dashArray: "6 6" }} />}
      {ambs.map((a) => (
        <Marker key={a.vehicle_id} position={[a.latitude, a.longitude]} icon={makeIcon(a.vehicle_id === data.dispatched?.vehicle_id ? "#dc2626" : "#f87171", "A")}>
          <Popup><b>{a.vehicle_id}</b><br />{a.distance_km} km · ETA {a.estimated_arrival_min} min<br />{a.status}</Popup>
        </Marker>
      ))}
      {recs.map((h, i) => (
        <Marker key={h.id} position={[h.lat, h.lng]} icon={makeIcon(i === 0 ? "#1d4ed8" : "#60a5fa", "H")}>
          <Popup><b>{h.name}</b><br />~{h.eta_min} min · {h.ward_available} beds free in needed ward</Popup>
        </Marker>
      ))}
      {!recs.length && hosps.map((h, i) => (
        <Marker key={`h${i}`} position={[h.latitude, h.longitude]} icon={makeIcon("#3b82f6", "H")}>
          <Popup><b>{h.hospital_name}</b><br />{h.distance_km} km · {h.city}<br />Beds {h.available_beds}/{h.total_beds}</Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
