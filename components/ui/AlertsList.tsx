"use client";

import { useState } from "react";
import { AlertTriangle, ArrowRight, ChevronDown, ChevronUp } from "lucide-react";

import { useToast } from "@/components/ui/Toast";
import { useDispatchContext } from "@/components/providers/DispatchProvider";

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

// Fallback data when no API response
const fallbackAlerts: Alert[] = [
  { id: "ALT-001", severity: "critical", title: "Multi-vehicle collision — 3 casualties", location: "MG Road & Ring Road Junction", time: "2 min ago" },
  { id: "ALT-002", severity: "critical", title: "Cardiac arrest reported", location: "Sector 14, Block C", time: "5 min ago" },
  { id: "ALT-003", severity: "warning", title: "Ambulance A5 — delayed response", location: "Highway NH-48, KM 22", time: "8 min ago" },
  { id: "ALT-004", severity: "warning", title: "High traffic zone — reroute suggested", location: "Central Market Area", time: "12 min ago" },
  { id: "ALT-005", severity: "info", title: "Ambulance A2 — maintenance due", location: "Station Bravo", time: "20 min ago" },
];

interface AlertsListProps {
  alerts?: Alert[];
}

export default function AlertsList({ alerts }: AlertsListProps) {
  const { showToast } = useToast();
  const { setDispatch } = useDispatchContext();
  const [isExpanded, setIsExpanded] = useState(true);
  
  const data = alerts && alerts.length > 0 ? alerts : fallbackAlerts;
  const criticalCount = data.filter((a) => a.severity === "critical").length;

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
          {data.map((alert, idx) => {
            const style = severityStyles[alert.severity];
            return (
              <div
                key={alert.id}
                onClick={() => {
                  showToast(`AI Copilot overriding: Dispatching rapid response to ${alert.location}`, "success");
                  // Simulate an instant dispatch to the map
                  setDispatch({
                    vehicle: { id: "V-RAPID", name: "Rapid Response", lat: 28.6139, lng: 77.2090, status: "en_route", destination: alert.location, speed: 60, heading: 0, driver: "Auto-Dispatch" },
                    hotspot: { lat: 28.6200, lng: 77.2200 }, // Slight offset to draw a visible route
                    eta: Math.random() * 4 + 1
                  });
                }}
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
