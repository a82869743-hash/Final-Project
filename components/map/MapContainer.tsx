"use client";

import { type Vehicle } from "@/lib/api";

interface MapContainerProps {
  height?: string;
  className?: string;
  vehicles?: Vehicle[];
}

export default function MapContainer({
  height = "400px",
  className = "",
  vehicles,
}: MapContainerProps) {
  const hasVehicles = vehicles && vehicles.length > 0;

  return (
    <div
      className={`card-lifted relative overflow-hidden ${className}`}
      style={{ height }}
    >
      <div className="absolute inset-0 z-0 bg-[var(--color-surface-container-low)] text-[var(--color-on-surface-muted)]">
        <div className="w-full h-full flex items-center justify-center">
          Map will be integrated here
        </div>
      </div>

      {/* Overlay label */}
      <div className="absolute left-4 top-4 glass rounded-[var(--radius-md)] px-3 py-1.5 flex items-center gap-2 z-10">
        <span className="font-[var(--font-display)] text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-on-surface)]">
          Live Fleet Map
        </span>
        {hasVehicles && (
          <span className="flex h-1.5 w-1.5 rounded-full bg-[var(--color-success)] animate-pulse" />
        )}
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 right-4 glass rounded-[var(--radius-md)] px-3 py-2 flex gap-4 z-10">
        {[
          { color: "var(--color-success)", label: "En Route" },
          { color: "var(--color-primary)", label: "Available" },
          { color: "var(--color-warning)", label: "On Scene" },
          { color: "var(--color-error)", label: "Critical" },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full"
              style={{
                backgroundColor: item.color,
                boxShadow: `0 0 4px ${item.color}`,
              }}
            />
            <span className="text-[10px] font-medium text-[var(--color-on-surface-muted)]">
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
