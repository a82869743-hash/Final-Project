"use client";

import { useEffect, useState } from "react";
import {
  Truck,
  MapPin,
  Search,
  Send,
  CheckCircle,
  AlertCircle,
  User,
  Gauge,
  Navigation,
} from "lucide-react";
import { api, type Vehicle, type DispatchResponse } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";

const statusConfig: Record<string, { color: string; label: string; dot: string }> = {
  available: { color: "#00677f", label: "Available", dot: "bg-[var(--color-primary)]" },
  en_route: { color: "#10b981", label: "En Route", dot: "bg-[var(--color-success)]" },
  on_scene: { color: "#f59e0b", label: "On Scene", dot: "bg-[var(--color-warning)]" },
  critical: { color: "#ef4444", label: "Critical", dot: "bg-[var(--color-error)]" },
  offline: { color: "#c6c6cd", label: "Offline", dot: "bg-[var(--color-outline-variant)]" },
};

export default function DispatchPage() {
  const { showToast } = useToast();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null);
  const [incidentLocation, setIncidentLocation] = useState("");
  const [dispatching, setDispatching] = useState(false);
  const [dispatchResult, setDispatchResult] = useState<DispatchResponse | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    async function fetchVehicles() {
      try {
        const data = await api.getVehicles();
        setVehicles(data);
      } catch (err) {
        console.error("Failed to fetch vehicles:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchVehicles();
    const interval = setInterval(fetchVehicles, 5000);
    return () => clearInterval(interval);
  }, []);

  const filteredVehicles = vehicles.filter((v) => {
    const matchesSearch =
      v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.driver.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || v.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  async function handleDispatch() {
    if (!selectedVehicle || !incidentLocation) return;
    setDispatching(true);
    setDispatchResult(null);
    try {
      const result = await api.dispatch({
        vehicle_id: selectedVehicle,
        incident_location: incidentLocation,
        incident_lat: 19.076 + Math.random() * 0.05,
        incident_lng: 72.877 + Math.random() * 0.05,
        priority: "high",
      });
      setDispatchResult(result);
      showToast(`Dispatched ${selectedVehicle} — ETA: ${result.estimated_arrival}`, "success");
      // Refresh vehicles after dispatch
      const updated = await api.getVehicles();
      setVehicles(updated);
      setSelectedVehicle(null);
      setIncidentLocation("");
    } catch (err) {
      console.error("Dispatch error:", err);
      setDispatchResult({
        success: false,
        message: "Dispatch failed — check backend connection",
        vehicle_id: selectedVehicle,
        estimated_arrival: "—",
      });
      showToast("Dispatch failed — check backend connection", "error");
    } finally {
      setDispatching(false);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Dispatch Form ── */}
      <div className="card-lifted p-5">
        <h3 className="font-[var(--font-display)] text-[13px] font-semibold tracking-tight text-[var(--color-on-surface)] mb-4">
          Quick Dispatch
        </h3>
        <div className="flex flex-wrap gap-3 items-end">
          {/* Selected vehicle display */}
          <div className="flex-1 min-w-[200px]">
            <label className="font-[var(--font-display)] text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--color-on-surface-muted)] mb-1.5 block">
              Selected Unit
            </label>
            <div className="h-10 flex items-center rounded-[var(--radius-md)] bg-[var(--color-surface-container-high)] px-3 text-[13px]">
              {selectedVehicle ? (
                <span className="text-[var(--color-on-surface)] font-medium">
                  {vehicles.find((v) => v.id === selectedVehicle)?.name ?? selectedVehicle}
                </span>
              ) : (
                <span className="text-[var(--color-on-surface-muted)]">Select from table below</span>
              )}
            </div>
          </div>

          {/* Incident location */}
          <div className="flex-[2] min-w-[280px]">
            <label className="font-[var(--font-display)] text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--color-on-surface-muted)] mb-1.5 block">
              Incident Location
            </label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-on-surface-muted)]" />
              <input
                type="text"
                value={incidentLocation}
                onChange={(e) => setIncidentLocation(e.target.value)}
                placeholder="Enter incident address or location..."
                className="h-10 w-full rounded-[var(--radius-md)] bg-[var(--color-surface-container-high)] pl-9 pr-4 text-[13px] text-[var(--color-on-surface)] placeholder:text-[var(--color-on-surface-muted)] outline-none transition-colors focus:bg-[var(--color-surface)] focus:shadow-[var(--shadow-soft)]"
              />
            </div>
          </div>

          {/* Dispatch button */}
          <button
            onClick={handleDispatch}
            disabled={!selectedVehicle || !incidentLocation || dispatching}
            className="btn-primary h-10 px-6 flex items-center gap-2 text-[13px] disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none"
          >
            <Send className="h-4 w-4" />
            {dispatching ? "Dispatching..." : "Dispatch"}
          </button>
        </div>

        {/* Dispatch result */}
        {dispatchResult && (
          <div
            className={`mt-3 flex items-center gap-2 rounded-[var(--radius-md)] px-4 py-2.5 text-[12px] font-medium animate-fade-in ${
              dispatchResult.success
                ? "bg-[rgba(16,185,129,0.08)] text-[var(--color-success)]"
                : "bg-[rgba(239,68,68,0.08)] text-[var(--color-error)]"
            }`}
          >
            {dispatchResult.success ? (
              <CheckCircle className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            {dispatchResult.message}
            {dispatchResult.success && (
              <span className="ml-auto text-[11px] text-[var(--color-on-surface-muted)]">
                ETA: {dispatchResult.estimated_arrival}
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Filters ── */}
      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-on-surface-muted)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search units, drivers..."
            className="h-9 w-full rounded-[var(--radius-md)] bg-[var(--color-surface-container-low)] pl-9 pr-4 text-[13px] text-[var(--color-on-surface)] placeholder:text-[var(--color-on-surface-muted)] outline-none transition-colors focus:bg-[var(--color-surface)] focus:shadow-[var(--shadow-soft)]"
          />
        </div>

        {/* Status pills */}
        <div className="flex gap-1.5">
          {["all", "available", "en_route", "on_scene", "critical", "offline"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-full px-3 py-1.5 text-[11px] font-medium transition-all ${
                statusFilter === s
                  ? "bg-[var(--color-primary)] text-white shadow-[var(--shadow-glow-cyan)]"
                  : "bg-[var(--color-surface-container-low)] text-[var(--color-on-surface-muted)] hover:bg-[var(--color-surface-container-high)]"
              }`}
            >
              {s === "all" ? "All" : statusConfig[s]?.label ?? s}
            </button>
          ))}
        </div>
      </div>

      {/* ── Vehicle Table ── */}
      <div className="card-lifted overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[var(--color-surface-container-low)]">
                {["", "Unit", "Driver", "Status", "Speed", "Destination", "Action"].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left font-[var(--font-display)] text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-on-surface-muted)]"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-[13px] text-[var(--color-on-surface-muted)]">
                    Loading fleet data...
                  </td>
                </tr>
              ) : filteredVehicles.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-[13px] text-[var(--color-on-surface-muted)]">
                    No vehicles match the current filter.
                  </td>
                </tr>
              ) : (
                filteredVehicles.map((v, idx) => {
                  const cfg = statusConfig[v.status];
                  const isSelected = selectedVehicle === v.id;
                  return (
                    <tr
                      key={v.id}
                      onClick={() => v.status === "available" && setSelectedVehicle(v.id)}
                      className={`border-t border-[var(--color-surface-container-high)] transition-colors animate-fade-in ${
                        isSelected
                          ? "bg-[rgba(0,103,127,0.06)]"
                          : v.status === "available"
                          ? "cursor-pointer hover:bg-[var(--color-surface-container-low)]"
                          : ""
                      }`}
                      style={{ animationDelay: `${idx * 0.03}s` }}
                    >
                      {/* Radio */}
                      <td className="w-10 px-4 py-3">
                        {v.status === "available" && (
                          <div
                            className={`h-4 w-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                              isSelected
                                ? "border-[var(--color-primary)] bg-[var(--color-primary)]"
                                : "border-[var(--color-outline-variant)]"
                            }`}
                          >
                            {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                          </div>
                        )}
                      </td>
                      {/* Unit */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Truck className="h-4 w-4 text-[var(--color-on-surface-muted)]" />
                          <div>
                            <span className="text-[13px] font-semibold text-[var(--color-on-surface)]">
                              {v.name}
                            </span>
                            <span className="ml-2 text-[11px] text-[var(--color-on-surface-muted)]">
                              {v.id}
                            </span>
                          </div>
                        </div>
                      </td>
                      {/* Driver */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5 text-[var(--color-on-surface-muted)]" />
                          <span className="text-[12px] text-[var(--color-on-surface-muted)]">
                            {v.driver || "—"}
                          </span>
                        </div>
                      </td>
                      {/* Status */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={`status-glow ${cfg.dot}`}
                            style={{ color: cfg.color }}
                          />
                          <span className="text-[12px] font-medium" style={{ color: cfg.color }}>
                            {cfg.label}
                          </span>
                        </div>
                      </td>
                      {/* Speed */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <Gauge className="h-3.5 w-3.5 text-[var(--color-on-surface-muted)]" />
                          <span className="text-[12px] text-[var(--color-on-surface-muted)]">
                            {v.speed > 0 ? `${Math.round(v.speed)} km/h` : "—"}
                          </span>
                        </div>
                      </td>
                      {/* Destination */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 max-w-[200px]">
                          {v.destination && (
                            <Navigation className="h-3.5 w-3.5 shrink-0 text-[var(--color-on-surface-muted)]" />
                          )}
                          <span className="text-[12px] text-[var(--color-on-surface-muted)] truncate">
                            {v.destination || "—"}
                          </span>
                        </div>
                      </td>
                      {/* Action */}
                      <td className="px-4 py-3">
                        {v.status === "available" && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedVehicle(v.id);
                            }}
                            className={`rounded-[var(--radius-md)] px-3 py-1.5 text-[11px] font-medium transition-all ${
                              isSelected
                                ? "bg-[var(--color-primary)] text-white"
                                : "bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-muted)] hover:bg-[var(--color-primary)] hover:text-white"
                            }`}
                          >
                            Select
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
