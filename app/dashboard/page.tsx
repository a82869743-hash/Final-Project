"use client";

import { useEffect, useState, useRef } from "react";
import {
  Ambulance,
  Clock,
  Activity,
  ShieldAlert,
  BrainCircuit,
  RefreshCw,
  WifiOff,
} from "lucide-react";
import dynamic from "next/dynamic";
import StatCard from "@/components/ui/StatCard";
import { useToast } from "@/components/ui/Toast";

// Dashboard Risk Zone Map — AI predictor + accident hotspots (no fleet cars)
const RiskZoneMap = dynamic(() => import("@/components/map/RiskZoneMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex justify-center items-center bg-[var(--color-surface-container-low)] rounded-[var(--radius-md)] text-[var(--color-on-surface-muted)]">
      Loading risk intelligence map...
    </div>
  ),
});
import AlertsList from "@/components/ui/AlertsList";
import ActivityFeed from "@/components/ui/ActivityFeed";
import PremiumAnalytics from "@/components/dashboard/PremiumAnalytics";
import RadioScanner from "@/components/dashboard/RadioScanner";
import { api, type DashboardStats, type Alert, type Vehicle, type PredictionResponse, type AnalyticsStats, type RiskZone } from "@/lib/api";

import { useDispatchContext } from "@/components/providers/DispatchProvider";

export default function DashboardPage() {
  const { showToast } = useToast();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [prediction, setPrediction] = useState<PredictionResponse | null>(null);
  const { dispatch, setDispatch } = useDispatchContext();
  const [isFetchingEta, setIsFetchingEta] = useState(false);
  const lastDispatchRef = useRef<{ vId: string; hLat: number; hLng: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [analytics, setAnalytics] = useState<AnalyticsStats | null>(null);
  const [riskZones, setRiskZones] = useState<RiskZone[]>([]);
  const [selectedCity, setSelectedCity] = useState<string>("All India");
  const [forecastOffset, setForecastOffset] = useState<number>(0);

  const CITIES = [
    "All India", "Delhi", "Mumbai", "Bangalore", "Chennai", "Kolkata", 
    "Hyderabad", "Ahmedabad", "Pune", "Jaipur", "Surat", "Lucknow", "Kanpur", "Nagpur", "Indore", "Bhopal"
  ];

  // Derive filtered arrays
  const filteredVehicles = vehicles.filter(v => selectedCity === "All India" || v.destination.includes(selectedCity) || v.name.includes(selectedCity));
  // Let's filter alerts too. Alerts have location: "Sector X, City"
  const filteredAlerts = alerts.filter(a => selectedCity === "All India" || a.location.includes(selectedCity) || a.title.includes(selectedCity));

  useEffect(() => {
    async function fetchData() {
      try {
        const [s, a, v, an] = await Promise.all([
          api.getDashboard(),
          api.getAlerts(),
          api.getVehicles(),
          api.getAnalytics(),
        ]);
        setStats(s);
        setAlerts(a);
        setVehicles(v);
        if (an && (an as any).error) {
           console.error("Analytics returned error:", an);
           setAnalytics(null);
           setError(true);
        } else {
           setAnalytics(an);
           setError(false);
        }
      } catch (err) {
        console.warn("Dashboard: backend unreachable —", err);
        setError(true);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    }
    fetchData();
    // Refresh every 10 seconds
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  // ML Prediction Forecast Fetcher
  useEffect(() => {
    let active = true;
    async function fetchPrediction() {
      try {
        const p = await api.predict({
          hour: (new Date().getHours() + forecastOffset) % 24,
          day_of_week: new Date().getDay(),
          zone_id: 1,
          temperature: 28,
          humidity: 60,
          traffic_index: Math.min(1.0, 0.7 + (forecastOffset * 0.05)), // Simulate traffic increasing over time
          population_density: 1.2,
          historical_incidents: 45 + (forecastOffset * 2), // Simulate escalating incidents
        });
        if (active) setPrediction(p);
      } catch (err) {
        console.warn("Prediction unavailable", err);
      }
    }
    fetchPrediction();
    
    // Also poll prediction every 15s to keep it fresh with current slider value
    const interval = setInterval(fetchPrediction, 15000);
    return () => { 
      active = false;
      clearInterval(interval);
    };
  }, [forecastOffset]);

  // Fetch risk zones once on mount
  useEffect(() => {
    api.getRiskZones()
      .then((data) => {
        if (data?.zones) setRiskZones(data.zones);
      })
      .catch((err) => console.warn("Risk zones unavailable:", err));
  }, []);

  // Raw WebSocket connection for live vehicle testing
  useEffect(() => {
    const ws = new WebSocket("ws://127.0.0.1:8000/ws");

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        setVehicles((prev) => {
          if (Array.isArray(data)) {
            return data;
          }
          if (data && typeof data === 'object' && data.id) {
            const idx = prev.findIndex(v => v.id === data.id);
            if (idx !== -1) {
              const updated = [...prev];
              updated[idx] = { ...updated[idx], ...data };
              return updated;
            }
            return [...prev, data as Vehicle];
          }
          return prev;
        });
      } catch (err) {
        console.error("WebSocket message error:", err);
      }
    };

    ws.onerror = (err) => {
      console.error("WebSocket error:", err);
    };

    return () => ws.close();
  }, []);

  // Compute Dispatch Logic
  useEffect(() => {
    if (!vehicles || vehicles.length === 0) return;

    // 1. Identify hotspot
    const hotspotObj = vehicles.reduce((max, v) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((v as any).risk_score || 0) > ((max as any).risk_score || 0) ? v : max;
    }, vehicles[0]);

    const hotspot = { lat: hotspotObj.lat, lng: hotspotObj.lng };

    // 2. Distance calc
    const getDistance = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
      return Math.sqrt(Math.pow(a.lat - b.lat, 2) + Math.pow(a.lng - b.lng, 2));
    };

    let bestVehicle: Vehicle | null = null;
    let bestScore = Infinity;

    vehicles.forEach(v => {
      if (v.status === "offline") return;

      const distance = getDistance(v, hotspot);
      let priorityPenalty = 0;

      if (v.status === "en_route") priorityPenalty = 0.002;
      // @ts-expect-error fallback status
      if (v.status === "busy") priorityPenalty = 0.005;

      const score = distance + priorityPenalty;

      if (score < bestScore) {
        bestScore = score;
        bestVehicle = v;
      }
    });

    if (bestVehicle) {
      const isSameAsLast = lastDispatchRef.current &&
        lastDispatchRef.current.vId === (bestVehicle as Vehicle).id &&
        lastDispatchRef.current.hLat === hotspot.lat &&
        lastDispatchRef.current.hLng === hotspot.lng;

      if (!isSameAsLast) {
        lastDispatchRef.current = { vId: (bestVehicle as Vehicle).id, hLat: hotspot.lat, hLng: hotspot.lng };

        const fetchETA = async () => {
          setIsFetchingEta(true);
          let eta = null;

          try {
            const vehicle = bestVehicle as Vehicle;
            const url = `https://router.project-osrm.org/route/v1/driving/${vehicle.lng},${vehicle.lat};${hotspot.lng},${hotspot.lat}?overview=false`;
            const res = await fetch(url);
            const data = await res.json();

            if (data.routes && data.routes.length > 0) {
              eta = data.routes[0].duration / 60; // minutes
            }
          } catch (err) {
            console.error("ETA fetch error", err);
          }

          // Fallback to Euclidean
          if (eta === null) {
            eta = bestScore * 1000;
          }

          setDispatch({
            vehicle: bestVehicle!,
            hotspot,
            eta
          });
          setIsFetchingEta(false);
        };

        fetchETA();
      }
    }
  }, [vehicles]);


  // Compute fleet breakdown from vehicles
  const fleetBreakdown = [
    { label: "Available", count: vehicles.filter((v) => v.status === "available").length, color: "var(--color-primary)" },
    { label: "En Route", count: vehicles.filter((v) => v.status === "en_route").length, color: "var(--color-success)" },
    { label: "On Scene", count: vehicles.filter((v) => v.status === "on_scene").length, color: "var(--color-warning)" },
    { label: "Critical", count: vehicles.filter((v) => v.status === "critical").length, color: "var(--color-error)" },
    { label: "Offline", count: vehicles.filter((v) => v.status === "offline").length, color: "var(--color-outline-variant)" },
  ].filter((item) => item.count > 0);

  const totalFleet = vehicles.length || 12;

  const riskColor =
    prediction?.risk_level === "critical"
      ? "var(--color-error)"
      : prediction?.risk_level === "high"
      ? "var(--color-warning)"
      : prediction?.risk_level === "medium"
      ? "#f59e0b"
      : "var(--color-success)";

  function handleManualRefresh() {
    setRefreshing(true);
    showToast("Refreshing dashboard data...", "info", 2000);
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Error Banner ── */}
      {error && (
        <div className="flex items-center gap-3 rounded-[var(--radius-md)] bg-[rgba(239,68,68,0.06)] px-4 py-3 animate-fade-in">
          <WifiOff className="h-4 w-4 text-[var(--color-error)] shrink-0" />
          <span className="flex-1 text-[12px] font-medium text-[var(--color-error)]">
            Unable to connect to backend — showing cached data
          </span>
          <button
            onClick={handleManualRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-surface)] px-3 py-1.5 text-[11px] font-medium text-[var(--color-on-surface-muted)] transition-colors hover:bg-[var(--color-surface-container-high)] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Retry
          </button>
        </div>
      )}

      {/* ── Global Command Center Filter ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass rounded-[var(--radius-lg)] p-4 shadow-sm border border-[var(--color-outline-variant)]">
        <div>
          <h2 className="text-[15px] font-[var(--font-display)] font-semibold text-[var(--color-on-surface)] flex items-center gap-2">
            Global Command Center
          </h2>
          <p className="text-[12px] text-[var(--color-on-surface-muted)]">Live monitoring and dispatch matrix</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-[11px] font-semibold tracking-wider text-[var(--color-on-surface-muted)] uppercase">Region</label>
          <select 
            value={selectedCity}
            onChange={(e) => setSelectedCity(e.target.value)}
            className="bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] text-[var(--color-on-surface)] text-[13px] rounded-[var(--radius-md)] px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-cyan-500 transition-shadow min-w-[140px]"
          >
            {CITIES.map(city => (
              <option key={city} value={city}>{city}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Summary Cards (Analytics API) ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Dispatches"
          value={analytics?.total_dispatches ?? "—"}
          change={loading ? "Loading..." : "All Time"}
          changeType="up"
          icon={Activity}
          accentColor="#00677f"
        />
        <StatCard
          label="Avg ETA"
          value={analytics?.avg_eta !== undefined ? `${analytics.avg_eta} min` : "—"}
          change={loading ? "Loading..." : "Live Tracker"}
          changeType="down"
          icon={Clock}
          accentColor="#10b981"
        />
        <StatCard
          label="Active Vehicles"
          value={analytics?.active_vehicles ?? "—"}
          change={loading ? "Loading..." : "Online"}
          changeType="up"
          icon={Ambulance}
          accentColor="#f59e0b"
        />
        <StatCard
          label="High Risk Zones"
          value={analytics?.high_risk_zones ?? "—"}
          change={loading ? "Loading..." : "Critical"}
          changeType="down"
          icon={ShieldAlert}
          accentColor="#ef4444"
        />
      </div>

      {/* ── Premium Analytics Board ── */}
      <PremiumAnalytics vehicles={filteredVehicles} alerts={filteredAlerts} />

      {/* ── Map + Alerts ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 min-h-[420px] flex flex-col gap-4">
          {/* Time Forecast Slider */}
          <div className="glass rounded-[var(--radius-lg)] p-4 shadow-sm border border-[var(--color-outline-variant)] flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <h3 className="text-[13px] font-[var(--font-display)] font-semibold text-[var(--color-on-surface)] flex items-center gap-2">
                <Clock className="h-4 w-4 text-cyan-500" />
                Predictive ML Forecast
              </h3>
              <span className="text-[11px] font-bold tracking-wider text-cyan-500 bg-cyan-500/10 px-2 py-1 rounded">
                {forecastOffset === 0 ? "LIVE NOW" : `+${forecastOffset} HOURS`}
              </span>
            </div>
            <input 
              type="range" 
              min="0" 
              max="12" 
              step="1"
              value={forecastOffset}
              onChange={(e) => setForecastOffset(parseInt(e.target.value))}
              className="w-full accent-cyan-500 h-1.5 bg-[var(--color-surface-container-high)] rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-[var(--color-on-surface-muted)] font-semibold uppercase">
              <span>Now</span>
              <span>+3h</span>
              <span>+6h</span>
              <span>+9h</span>
              <span>+12h</span>
            </div>
          </div>

          <RiskZoneMap
            height="420px"
            prediction={prediction}
            riskZones={riskZones}
            selectedCity={selectedCity}
          />
        </div>
        <div className="lg:col-span-1 min-h-[420px]">
          <AlertsList alerts={filteredAlerts} />
        </div>
      </div>

      {/* ── Tactical Scanner & Activity ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 flex flex-col gap-4">
          <RadioScanner alerts={filteredAlerts} />
          <ActivityFeed />
        </div>

        {/* Info Column */}
        <div className="space-y-4">
          {/* AI Prediction Panel */}
          {prediction && (
            <div className="card-lifted p-5 relative overflow-hidden">
              <div
                className="absolute inset-0 z-0 opacity-10"
                style={{ backgroundColor: riskColor }}
              />
              <div className="relative z-10">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-[var(--font-display)] text-[13px] font-semibold tracking-tight text-[var(--color-on-surface)] flex items-center gap-2">
                    <BrainCircuit className="h-4 w-4" style={{ color: riskColor }} />
                    AI Risk Forecast (Next 1h)
                  </h3>
                </div>
                <div className="flex items-end justify-between">
                  <div>
                    <span
                      className="font-[var(--font-display)] text-2xl font-bold uppercase tracking-tight"
                      style={{ color: riskColor }}
                    >
                      {prediction.risk_level}
                    </span>
                    <p className="text-[11px] text-[var(--color-on-surface-muted)] mt-1">
                      Risk Score: {(prediction.risk_score * 100).toFixed(1)}% | Confidence: {(prediction.confidence * 100).toFixed(1)}%
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="font-[var(--font-display)] text-xl font-bold text-[var(--color-on-surface)]">
                      {prediction.recommended_ambulances}
                    </span>
                    <p className="text-[10px] text-[var(--color-on-surface-muted)] uppercase tracking-wider font-semibold">
                      Ambulances Rec.
                    </p>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="mt-4 w-full h-1.5 rounded-full bg-[var(--color-surface-container-high)] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-1000"
                    style={{
                      width: `${prediction.risk_score * 100}%`,
                      backgroundColor: riskColor,
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Active Dispatch Panel */}
          <div className="card-lifted p-5 relative overflow-hidden">
            <div className="absolute inset-0 z-0 opacity-10 bg-cyan-700" />
            <div className="relative z-10">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-[var(--font-display)] text-[13px] font-semibold tracking-tight text-[var(--color-on-surface)] flex items-center gap-2">
                  <Ambulance className="h-4 w-4 text-cyan-600" />
                  Active AI Dispatch
                </h3>
              </div>
              {dispatch ? (
                <div className="flex items-end justify-between">
                  <div>
                    <span className="font-[var(--font-display)] text-xl font-bold uppercase tracking-tight text-cyan-600">
                      {dispatch.vehicle.id}
                    </span>
                    <p className="text-[11px] text-[var(--color-on-surface-muted)] mt-1 capitalize">
                      Status: {dispatch.vehicle.status.replace("_", " ")}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="font-[var(--font-display)] text-xl font-bold text-[var(--color-on-surface)]">
                      {isFetchingEta ? "..." : `${dispatch.eta.toFixed(1)}m`}
                    </span>
                    <p className="text-[10px] text-[var(--color-on-surface-muted)] uppercase tracking-wider font-semibold">
                      Estimated ETA
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-center text-[12px] text-[var(--color-on-surface-muted)] py-2">
                  Calculating optimal dispatch...
                </div>
              )}
            </div>
          </div>

          {/* Quick Stats Panel */}
          <div className="card-lifted p-5">
            <h3 className="font-[var(--font-display)] text-[13px] font-semibold tracking-tight text-[var(--color-on-surface)] mb-4">
              Fleet Overview
            </h3>
            <div className="space-y-3">
              {fleetBreakdown.map((item) => (
                <div key={item.label} className="flex items-center gap-3">
                  <span
                    className="status-glow shrink-0"
                    style={{
                      backgroundColor: item.color,
                      color: item.color,
                    }}
                  />
                  <span className="flex-1 text-[12px] text-[var(--color-on-surface-muted)]">
                    {item.label}
                  </span>
                  <span className="font-[var(--font-display)] text-[14px] font-bold text-[var(--color-on-surface)]">
                    {item.count}
                  </span>
                  <div className="w-16 h-1.5 rounded-full bg-[var(--color-surface-container-high)] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${(item.count / totalFleet) * 100}%`,
                        backgroundColor: item.color,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-3 border-t border-[var(--color-surface-container-high)]">
              <div className="flex items-center justify-between">
                <span className="font-[var(--font-display)] text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--color-on-surface-muted)]">
                  Total Fleet
                </span>
                <span className="font-[var(--font-display)] text-xl font-bold text-[var(--color-on-surface)]">
                  {totalFleet}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* ── Recent Dispatches Table ── */}
      <div className="grid grid-cols-1 gap-4 mt-6">
        <div className="card-lifted p-6 min-h-[300px]">
          <div className="flex items-center justify-between mb-6">
             <h2 className="font-[var(--font-display)] text-[18px] font-semibold text-[var(--color-on-surface)]">
               Recent Dispatch History
             </h2>
             <span className="text-[12px] font-medium px-3 py-1 bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-muted)] rounded-full">
               System Analytics
             </span>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--color-surface-container-high)] text-[13px] text-[var(--color-on-surface-muted)] uppercase tracking-wider">
                  <th className="pb-3 px-4 font-semibold">Vehicle</th>
                  <th className="pb-3 px-4 font-semibold">ETA</th>
                  <th className="pb-3 px-4 font-semibold">Location</th>
                  <th className="pb-3 px-4 font-semibold">Risk Level</th>
                  <th className="pb-3 px-4 shrink-0 whitespace-nowrap text-right font-semibold">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-surface-container-high)] text-[14px]">
                {(!analytics?.recent_dispatches || analytics.recent_dispatches.length === 0) ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-[var(--color-on-surface-muted)]">
                      {loading ? "Loading analytics via backend..." : error ? "Analytics unavailable." : "No recent dispatches logged."}
                    </td>
                  </tr>
                ) : (
                  analytics.recent_dispatches.map((row: any) => (
                    <tr key={row.id} className="hover:bg-[rgba(255,255,255,0.02)] transition-colors">
                      <td className="py-4 px-4 font-medium text-[var(--color-on-surface)] flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-[var(--color-primary)]"></div>
                        {row.vehicle_id}
                      </td>
                      <td className="py-4 px-4 font-mono text-[13px]">{row.eta ? `${row.eta} min` : 'N/A'}</td>
                      <td className="py-4 px-4 font-mono text-[13px] text-[var(--color-on-surface-muted)]">
                        {row.hotspot_lat?.toFixed(3)}, {row.hotspot_lng?.toFixed(3)}
                      </td>
                      <td className="py-4 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold uppercase ${
                          row.risk_level === 'critical' ? 'bg-[var(--color-error)] text-white' :
                          row.risk_level === 'high' ? 'bg-[var(--color-warning)] text-black' :
                          'bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)]'
                        }`}>
                          {row.risk_level || 'Unknown'}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-right text-[12px] text-[var(--color-on-surface-muted)] whitespace-nowrap">
                        {new Date(row.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
