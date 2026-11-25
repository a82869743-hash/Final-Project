"use client";

import { useState } from "react";
import { AlertTriangle, ArrowRight, ChevronDown, ChevronUp } from "lucide-react";

import { useToast } from "@/components/ui/Toast";
import { useDispatchContext } from "@/components/providers/DispatchProvider";
import { api } from "@/lib/api";

interface Alert {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  location: string;
  time: string;
}

const severityStyles = {
  critical: {
    bg: "bg-[rgba(239,68,68,0.06)]",
    dot: "bg-[var(--color-error)] text-[var(--color-error)]",
    text: "text-[var(--color-error)]",
  },
  warning: {
    bg: "bg-[rgba(245,158,11,0.06)]",
    dot: "bg-[var(--color-warning)] text-[var(--color-warning)]",
    text: "text-[var(--color-warning)]",
  },
  info: {
    bg: "bg-[rgba(59,130,246,0.06)]",
    dot: "bg-[var(--color-info)] text-[var(--color-info)]",
    text: "text-[var(--color-info)]",
  },
};

// No invented alerts when the API is unreachable: show an empty state
const fallbackAlerts: Alert[] = [];

interface AlertsListProps {
  alerts?: Alert[];
}

export default function AlertsList({ alerts }: AlertsListProps) {
  const { showToast } = useToast();
  const { setDispatch } = useDispatchContext();
  const [isExpanded, setIsExpanded] = useState(true);
  
  const data = alerts && alerts.length > 0 ? alerts : fallbackAlerts;
  const criticalCount = data.filter((a) => a.severity === "critical").length;

  // Real quick-dispatch: locate the alert (coordinates in the text, else geocode),
  // pick the nearest available ambulance and dispatch it through the API.
  const quickDispatch = async (alert: Alert) => {
    try {
      const m = alert.location.match(/\((-?\d+\.\d+),\s*(-?\d+\.\d+)\)/);
      const geo = m ? { latitude: +m[1], longitude: +m[2] } : await api.geocode(alert.location.split(",")[0]);
      const em = await api.emergency({ latitude: geo.latitude, longitude: geo.longitude });
      const amb = em.nearest_ambulance;
      if (!amb?.vehicle_id) throw new Error("no ambulance");
      const d = await api.dispatch({ vehicle_id: amb.vehicle_id, incident_location: alert.title,
        incident_lat: geo.latitude, incident_lng: geo.longitude, priority: alert.severity === "critical" ? "critical" : "high" });
      setDispatch({
        vehicle: { id: amb.vehicle_id, name: amb.vehicle_id, lat: amb.latitude, lng: amb.longitude, status: "en_route", destination: alert.title, speed: 60, heading: 0, driver: "Auto-Dispatch" },
        hotspot: { lat: geo.latitude, lng: geo.longitude },
        eta: parseFloat(d.estimated_arrival),
      });
      showToast(`${amb.vehicle_id} dispatched to ${alert.title} — ETA ${d.estimated_arrival}`, "success");
    } catch {
      showToast(`Could not auto-dispatch to ${alert.location}`, "error");
    }
  };

  return (
    <div className="card-lifted flex flex-col h-full max-h-[420px] transition-all duration-300">
      {/* Header */}
      <div 
        className="flex items-center justify-between px-5 pt-5 pb-3 cursor-pointer hover:bg-[var(--color-surface-container-low)] transition-colors rounded-t-[var(--radius-lg)]"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-[var(--color-error)]" />
          <h3 className="font-[var(--font-display)] text-[13px] font-semibold tracking-tight text-[var(--color-on-surface)]">
            Active Alerts
          </h3>
          <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[var(--color-error)] px-1.5 text-[10px] font-bold text-white ml-2">
            {criticalCount}
          </span>
        </div>
        <button className="text-[var(--color-on-surface-muted)] hover:text-[var(--color-on-surface)] transition-colors">
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {/* Alert List */}
      {isExpanded && (
        <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2 custom-scrollbar">
          {data.length === 0 && (
            <p className="px-3 py-6 text-center text-[11px] text-[var(--color-on-surface-muted)]">No active alerts</p>
          )}
          {data.map((alert, idx) => {
            const style = severityStyles[alert.severity];
            return (
              <div
                key={alert.id}
                onClick={() => quickDispatch(alert)}
                className={`group flex items-start gap-3 rounded-[var(--radius-md)] px-3 py-3 transition-all duration-200 cursor-pointer hover:${style.bg} animate-fade-in ${
                  alert.severity === "critical" ? "pulse-active" : ""
                }`}
                style={{ animationDelay: `${idx * 0.06}s` }}
              >
                <span className={`status-glow mt-1.5 shrink-0 ${style.dot}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-[var(--color-on-surface)] leading-snug">
                    {alert.title}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[var(--color-on-surface-muted)]">
                    {alert.location}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-[10px] text-[var(--color-on-surface-muted)]">
                    {alert.time}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-[var(--color-on-surface-muted)] opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
