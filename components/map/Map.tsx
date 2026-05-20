"use client";

import { useEffect, useRef, useMemo } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap, Polyline, Tooltip, CircleMarker } from "react-leaflet";
import { type Vehicle, type PredictionResponse, type RiskZone } from "@/lib/api";
import "leaflet.heat";
import MarkerClusterGroup from "react-leaflet-cluster";

// Fix for leaflet default icons in Next.js
// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
});

interface DispatchData {
  vehicle: Vehicle;
  hotspot: { lat: number; lng: number };
  eta: number;
}

interface MapProps {
  height?: string;
  className?: string;
  vehicles?: Vehicle[];
  prediction?: PredictionResponse | null;
  dispatch?: DispatchData | null;
  selected?: Vehicle | null;
  riskZones?: RiskZone[];
}

function RecenterMap({ center }: { center: [number, number] }) {
  const map = useMap();

  const lastCenterRef = useRef(center);
  const isUserInteracting = useRef(false);
  const isAnimating = useRef(false);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Track animation state using public events
  useEffect(() => {
    const onMoveStart = () => { isAnimating.current = true; };
    const onMoveEnd = () => { isAnimating.current = false; };

    map.on("movestart", onMoveStart);
    map.on("moveend", onMoveEnd);

    return () => {
      map.off("movestart", onMoveStart);
      map.off("moveend", onMoveEnd);
    };
  }, [map]);

  // Track user interaction and auto-resume after idle
  useEffect(() => {
    const onDragStart = () => {
      isUserInteracting.current = true;
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };

    const onMoveEnd = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        isUserInteracting.current = false;
      }, 5000);
    };

    map.on("dragstart", onDragStart);
    map.on("moveend", onMoveEnd);

    return () => {
      map.off("dragstart", onDragStart);
      map.off("moveend", onMoveEnd);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [map]);

  // Main logic: smooth + throttled + safe movement
  useEffect(() => {
    const [lat, lng] = center;
    const [prevLat, prevLng] = lastCenterRef.current;

    const distance = Math.sqrt(
      Math.pow(lat - prevLat, 2) + Math.pow(lng - prevLng, 2)
    );

    if (
      !isAnimating.current &&
      !isUserInteracting.current &&
      distance > 0.0008
    ) {
      map.flyTo(center, map.getZoom(), {
        duration: 1.2,
      });

      lastCenterRef.current = center;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center]);

  return null;
}

function FitBounds({ vehicles, selected }: { vehicles: Vehicle[], selected?: Vehicle | null }) {
  const map = useMap();
  const fitted = useRef(false);
  
  useEffect(() => {
    // Only auto-fit on first load, not on every update
    if (selected) {
        map.setView([selected.lat, selected.lng], 15, { animate: true, duration: 1 });
        return;
    }
    
    if (!fitted.current && vehicles && vehicles.length > 0) {
      const bounds = L.latLngBounds(vehicles.map((v) => [v.lat, v.lng]));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12, animate: true, duration: 1 });
      fitted.current = true;
    } else if (!vehicles || vehicles.length === 0) {
        map.setView([20.5937, 78.9629], 5, { animate: true });
    }
  }, [vehicles, selected, map]);
  
  return null;
}

function FocusSelected({ selected }: { selected: Vehicle | null }) {
  const map = useMap();
  useEffect(() => {
    if (selected) {
      map.flyTo([selected.lat, selected.lng], 15, { duration: 1.5 });
    }
  }, [selected, map]);
  return null;
}

function HeatmapLayer({ vehicles, prediction }: { vehicles: Vehicle[]; prediction: PredictionResponse | null }) {
  const map = useMap();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const heatRef = useRef<any>(null);

  useEffect(() => {
    // Defer heat layer creation until the map container is fully sized.
    // leaflet.heat calls getSize() internally — if the container hasn't
    // rendered yet (e.g. height: 100% with dynamic import), it crashes.
    function initHeat() {
      if (heatRef.current) return;
      try {
        map.invalidateSize();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        heatRef.current = (L as any).heatLayer([], {
          radius: 25,
          blur: 20,
          maxZoom: 17,
          gradient: {
            0.2: "green",
            0.4: "yellow",
            0.6: "orange",
            0.8: "red"
          }
        }).addTo(map);
      } catch (e) {
        console.warn("Heat layer deferred — container not ready yet");
      }
    }

    // Wait for map to be fully ready, then use rAF to ensure DOM is painted
    if (map.getContainer()?.clientHeight > 0) {
      requestAnimationFrame(initHeat);
    } else {
      map.whenReady(() => requestAnimationFrame(initHeat));
    }
  }, [map]);

  const heatData = useMemo(() => {
    const points: Array<[number, number, number]> = [];

    vehicles.forEach(v => {
      if (v.status === "offline") return;

      const baseIntensity = Math.max(0, Math.min(1, prediction?.risk_score ?? 0.5));
      const offset = 0.0008;

      points.push([v.lat, v.lng, baseIntensity]);

      // add surrounding density points
      points.push([v.lat + offset, v.lng, baseIntensity * 0.6]);
      points.push([v.lat - offset, v.lng, baseIntensity * 0.6]);
      points.push([v.lat, v.lng + offset, baseIntensity * 0.6]);
      points.push([v.lat, v.lng - offset, baseIntensity * 0.6]);
    });

    // LIMIT max points
    return points.slice(0, 500);
  }, [vehicles, prediction]);

  useEffect(() => {
    if (heatRef.current) {
      heatRef.current.setLatLngs(heatData);
    }
  }, [heatData]);

  useEffect(() => {
    return () => {
      if (heatRef.current) {
        map.removeLayer(heatRef.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

export default function Map({ height = "400px", className = "", vehicles = [], prediction = null, dispatch = null, selected = null, riskZones = [] }: MapProps) {
  const center: [number, number] = useMemo(() => {
    if (!vehicles.length) return [20.5937, 78.9629]; // Default to Center of India

    return [
      vehicles.reduce((sum, v) => sum + v.lat, 0) / vehicles.length,
      vehicles.reduce((sum, v) => sum + v.lng, 0) / vehicles.length,
    ];
  }, [vehicles]);

  const radius =
    prediction?.risk_level === "critical"
      ? 1500
      : prediction?.risk_level === "high"
      ? 1200
      : prediction?.risk_level === "medium"
      ? 900
      : 600;

  let riskColor = "transparent";
  if (prediction) {
    riskColor =
      prediction.risk_level === "critical"
        ? "#ef4444"
        : prediction.risk_level === "high"
        ? "#f59e0b"
        : prediction.risk_level === "medium"
        ? "#eab308"
        : "#10b981";
  }
  return (
    <div 
      className={`card-lifted relative z-0 overflow-hidden ${className}`} 
      style={{ height, width: "100%" }}
    >
      <MapContainer
        center={center}
        zoom={13}
        style={{ height: "100%", width: "100%", zIndex: 0 }}
      >
        <TileLayer
          url="https://tile.openstreetmap.de/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          maxZoom={19}
        />

        <RecenterMap center={center} />
        <FitBounds vehicles={vehicles} selected={selected} />
        <FocusSelected selected={selected} />

        <HeatmapLayer vehicles={vehicles} prediction={prediction} />

        {prediction && (
          <Circle
            center={center}
            pathOptions={{ 
              fillColor: riskColor, 
              color: riskColor, 
              weight: 2, 
              fillOpacity: 0.2,
              className: "smooth-risk-circle"
            }}
            radius={radius}
          >
            <Popup>
              <div className="font-[var(--font-display)] text-center">
                <strong>Area Risk: <span className="uppercase text-[13px]">{prediction.risk_level}</span></strong>
                <br />
                <span className="text-[11px] text-[var(--color-on-surface-muted)]">
                  Risk Score: {(prediction.risk_score * 100).toFixed(1)}%
                </span>
              </div>
            </Popup>
          </Circle>
        )}

        {/* Risk Zone Overlays */}
        {riskZones.map((zone, i) => (
          <Circle
            key={`rz-${i}`}
            center={[zone.lat, zone.lng]}
            pathOptions={{
              fillColor: zone.color,
              color: zone.color,
              weight: 1.5,
              fillOpacity: 0.18,
              className: zone.risk_level === "High" ? "risk-zone-pulse" : "smooth-risk-circle"
            }}
            radius={zone.radius}
          >
            <Popup>
              <div className="font-[var(--font-display)] text-center">
                <strong>Risk: <span className="uppercase text-[13px]" style={{ color: zone.color }}>{zone.risk_level}</span></strong>
                <br />
                <span className="text-[11px] text-[#6b7280]">
                  Accidents: {zone.accident_count}
                </span>
              </div>
            </Popup>
          </Circle>
        ))}

        {/* Dispatch Hotspot Route UI */}
        {dispatch && (
          <>
            <Polyline
              positions={[
                [dispatch.vehicle.lat, dispatch.vehicle.lng],
                [dispatch.hotspot.lat, dispatch.hotspot.lng]
              ]}
              pathOptions={{
                color: "cyan", // cyan-400
                weight: 3,
                dashArray: "6, 8"
              }}
              className="route-line"
            />
            {/* Mark target destination hotspot specifically */}
            <Circle
              center={[dispatch.hotspot.lat, dispatch.hotspot.lng]}
              radius={70}
              pathOptions={{ fillColor: "#0891b2", color: "#0891b2", className: "hotspot-pulse" }}
            />
            <CircleMarker
              center={[dispatch.hotspot.lat, dispatch.hotspot.lng]}
              radius={4}
              pathOptions={{
                color: "red",
                fillColor: "red",
                fillOpacity: 1
              }}
            />
          </>
        )}

        <MarkerClusterGroup 
          chunkedLoading 
          maxClusterRadius={60}
          iconCreateFunction={(cluster: any) => {
            const count = cluster.getChildCount();
            // Scale radar pulse size slightly based on density
            const size = Math.min(40 + (count * 1.5), 70);
            return L.divIcon({
              html: `<div class="relative flex items-center justify-center" style="width: ${size}px; height: ${size}px;">
                       <div class="absolute inset-0 bg-cyan-500 rounded-full opacity-20 animate-ping" style="animation-duration: 2s;"></div>
                       <div class="absolute inset-2 bg-cyan-500/30 rounded-full animate-pulse"></div>
                       <div class="w-3 h-3 bg-cyan-400 rounded-full shadow-[0_0_12px_rgba(34,211,238,1)] z-10 border-[1.5px] border-white"></div>
                     </div>`,
              className: 'custom-cluster-icon',
              iconSize: [size, size],
              iconAnchor: [size/2, size/2]
            });
          }}
        >
          {vehicles.map(
            (v) => {
              if (v.status === "offline") return null;

              const isDispatched = dispatch?.vehicle?.id === v.id;
              const isSelected = selected?.id === v.id;
              
              const markerClass = isDispatched ? "dispatched" : isSelected ? "selected" : "";
              
              const markerIcon = L.divIcon({
                className: "custom-marker-wrapper",
                html: `<div class="marker ${markerClass}"></div>`,
                iconSize: [20, 20],
                iconAnchor: [10, 10]
              });

              return (
                <Marker key={v.id} position={[v.lat, v.lng]} icon={markerIcon}>
                  <Popup offset={[0, -10]}>
                    <div className="font-[var(--font-display)]">
                      <strong>{v.name || v.id}</strong>
                      <br />
                      <span className="capitalize">{v.status.replace("_", " ")}</span>
                    </div>
                  </Popup>
                  {isDispatched && (
                    <Tooltip direction="top" offset={[0, -10]} permanent className="font-[var(--font-display)] font-bold !text-cyan-600 border-0 shadow-lg !bg-[var(--color-surface)]">
                      DISPATCHED
                    </Tooltip>
                  )}
                </Marker>
              );
            }
          )}
        </MarkerClusterGroup>
      </MapContainer>
      
      {/* Visual Transitions injected locally so styling naturally encapsulates component! */}
      <style jsx global>{`
        .smooth-risk-circle {
          transition: all 0.8s ease-in-out;
        }

        /* Marker CSS Animation System */
        .custom-marker-wrapper {
          background: transparent;
          border: none;
        }
        .marker {
          width: 14px;
          height: 14px;
          background: var(--color-success);
          border: 2px solid white;
          border-radius: 50%;
          box-shadow: 0 2px 5px rgba(0,0,0,0.3);
          transition: all 0.3s ease;
        }
        .marker.selected {
          background: #3b82f6; /* blue-500 */
          border-color: #60a5fa;
          box-shadow: 0 0 6px #3b82f6;
          animation: pulse-marker 2s infinite;
        }
        .marker.dispatched {
          background: cyan;
          border-color: cyan;
          box-shadow: 0 0 6px cyan, 0 0 12px rgba(0,255,255,0.6);
          animation: pulse-marker 1.5s infinite;
        }
        @keyframes pulse-marker {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.4); opacity: 0.7; }
          100% { transform: scale(1); opacity: 1; }
        }

        /* Hotspot Pulse */
        .hotspot-pulse {
          animation: hotspotPulse 2s infinite;
        }
        @keyframes hotspotPulse {
          0% { opacity: 0.2; }
          50% { opacity: 0.4; }
          100% { opacity: 0.2; }
        }

        /* Risk Zone Pulse (High risk areas) */
        .risk-zone-pulse {
          animation: riskZonePulse 3s ease-in-out infinite;
        }
        @keyframes riskZonePulse {
          0% { fill-opacity: 0.12; stroke-opacity: 0.4; }
          50% { fill-opacity: 0.25; stroke-opacity: 0.8; }
          100% { fill-opacity: 0.12; stroke-opacity: 0.4; }
        }

        /* Dash Flow */
        .leaflet-overlay-pane .route-line {
          stroke-dashoffset: 0;
          animation: dashFlow 1.5s linear infinite;
        }
        @keyframes dashFlow {
          to {
            stroke-dashoffset: -50;
          }
        }

        /* Accessibility: Reduced Motion */
        @media (prefers-reduced-motion: reduce) {
          .marker.selected,
          .route-line,
          .hotspot-pulse,
          .dispatch-route {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}
