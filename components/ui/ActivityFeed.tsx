"use client";

import { useEffect, useRef, useState } from "react";
import { Radio } from "lucide-react";
import { useDispatchContext } from "@/components/providers/DispatchProvider";
import type { Vehicle } from "@/lib/api";

interface ActivityItem {
  id: string;
  action: string;
  target: string;
  at: number;              // epoch ms
  status: "completed" | "in-progress" | "pending" | "critical";
}

interface LoggedDispatch {
  id?: string | number;
  vehicle_id?: string;
  eta?: number;
  hotspot_lat?: number;
  hotspot_lng?: number;
  timestamp?: string;
}

const statusColors = {
  completed: "bg-[var(--color-success)]",
  "in-progress": "bg-[var(--color-primary)]",
  pending: "bg-[var(--color-outline-variant)]",
  critical: "bg-[var(--color-error)] animate-pulse",
};

/** Fleet status change → activity entry */
const TRANSITIONS: Record<string, { action: string; status: ActivityItem["status"] }> = {
  en_route: { action: "Dispatched", status: "in-progress" },
  critical: { action: "Critical response", status: "critical" },
  on_scene: { action: "Arrived on scene", status: "completed" },
  available: { action: "Cleared · available", status: "completed" },
  offline: { action: "Off shift", status: "pending" },
};

const MAX_ITEMS = 8;

function ago(ms: number, now: number) {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

/**
 * Real activity: fleet status transitions observed on the live feed, plus
 * dispatches logged in the database. Nothing here is scripted.
 */
export default function ActivityFeed({ vehicles = [], recentDispatches = [] }: {
  vehicles?: Vehicle[];
  recentDispatches?: LoggedDispatch[];
}) {
  const { dispatch } = useDispatchContext();
  const lastStatus = useRef<Map<string, string>>(new Map());
  const [events, setEvents] = useState<ActivityItem[]>([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);

  // Diff each fleet update against the previous one
  useEffect(() => {
    if (!vehicles.length) return;
    const prev = lastStatus.current;
    const first = prev.size === 0;
    const fresh: ActivityItem[] = [];
    const t = Date.now();
    for (const v of vehicles) {
      const before = prev.get(v.id);
      prev.set(v.id, v.status);
      if (first || before === undefined || before === v.status) continue;
      const tr = TRANSITIONS[v.status];
      if (!tr) continue;
      fresh.push({
        id: `${v.id}-${v.status}-${t}`,
        action: tr.action,
        target: `${v.name}${v.destination && (v.status === "en_route" || v.status === "critical") ? ` → ${v.destination}` : ""}`,
        at: t,
        status: tr.status,
      });
    }
    if (fresh.length) {
      const id = setTimeout(() => setEvents((e) => [...fresh, ...e].slice(0, MAX_ITEMS)), 0);
      return () => clearTimeout(id);
    }
  }, [vehicles]);

  const logged: ActivityItem[] = recentDispatches.slice(0, 4).map((d, i) => ({
    id: `db-${d.id ?? i}`,
    action: "Dispatch logged",
    target: `${d.vehicle_id ?? "Unit"}${d.hotspot_lat != null && d.hotspot_lng != null ? ` → ${d.hotspot_lat.toFixed(3)}, ${d.hotspot_lng.toFixed(3)}` : ""}${d.eta ? ` · ETA ${d.eta} min` : ""}`,
    at: d.timestamp ? new Date(d.timestamp).getTime() : 0,
    status: "completed",
  }));

  const activities: ActivityItem[] = [...events, ...logged].sort((a, b) => b.at - a.at).slice(0, MAX_ITEMS);
  if (dispatch) {
    activities.unshift({
      id: `live-dispatch-${dispatch.vehicle.id}`,
      action: "AI recommendation",
      target: `${dispatch.vehicle.name || dispatch.vehicle.id} → highest-risk hotspot (ETA ${Math.max(1, Math.round(dispatch.eta))} min)`,
      at: now,
      status: "critical",
    });
  }

  return (
    <div className="card-lifted p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-[var(--font-display)] text-[13px] font-semibold tracking-tight text-[var(--color-on-surface)]">
          Recent Activity
        </h3>
        <span className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--color-on-surface-muted)]">
          <Radio className="h-3 w-3 text-[var(--color-success)]" /> Live feed
        </span>
      </div>

      {activities.length === 0 ? (
        <p className="py-6 text-center text-[11px] text-[var(--color-on-surface-muted)]">
          Listening to the fleet feed — status changes will appear here as they happen.
        </p>
      ) : (
        <div className="space-y-0">
          {activities.map((item, idx) => (
            <div key={item.id} className="relative flex gap-3 pb-4 last:pb-0 animate-fade-in">
              {/* Timeline line */}
              {idx < activities.length - 1 && (
                <div className="absolute left-[7px] top-[18px] h-[calc(100%-6px)] w-px bg-[var(--color-surface-container-high)]" />
              )}
              {/* Dot */}
              <div className={`relative z-10 mt-1.5 h-[15px] w-[15px] shrink-0 rounded-full border-[3px] border-[var(--color-surface)] ${statusColors[item.status]}`} />
              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-[var(--font-display)] text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--color-primary)]">
                    {item.action}
                  </span>
                  <span className="text-[10px] text-[var(--color-on-surface-muted)]">
                    {item.at ? (item.id.startsWith("live-") ? "now" : ago(item.at, now)) : "logged"}
                  </span>
                </div>
                <p className="mt-0.5 text-[12px] text-[var(--color-on-surface-muted)] leading-snug truncate">
                  {item.target}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
