"use client";

import { useDispatchContext } from "@/components/providers/DispatchProvider";

interface ActivityItem {
  id: string;
  action: string;
  target: string;
  time: string;
  status: "completed" | "in-progress" | "pending" | "critical";
}

const mockActivity: ActivityItem[] = [
  {
    id: "1",
    action: "Dispatched",
    target: "Ambulance A1 → MG Road",
    time: "1 min ago",
    status: "in-progress",
  },
  {
    id: "2",
    action: "Arrived",
    target: "Ambulance A3 → Sector 7 Hospital",
    time: "4 min ago",
    status: "completed",
  },
  {
    id: "3",
    action: "AI Prediction",
    target: "High-risk zone detected — NH-48",
    time: "6 min ago",
    status: "completed",
  },
  {
    id: "4",
    action: "Call Analyzed",
    target: "Emergency #4821 — Cardiac event",
    time: "10 min ago",
    status: "completed",
  },
  {
    id: "5",
    action: "Maintenance",
    target: "Ambulance A6 — Scheduled check",
    time: "15 min ago",
    status: "pending",
  },
];

const statusColors = {
  completed: "bg-[var(--color-success)]",
  "in-progress": "bg-[var(--color-primary)]",
  pending: "bg-[var(--color-outline-variant)]",
  critical: "bg-[var(--color-error)] animate-pulse",
};

export default function ActivityFeed() {
  const { dispatch } = useDispatchContext();

  const activities = [...mockActivity];
  if (dispatch) {
    activities.unshift({
      id: `live-dispatch-${dispatch.vehicle.id}`,
      action: "Active Dispatch",
      target: `Unit ${dispatch.vehicle.name || dispatch.vehicle.id} en route to Hotspot (ETA: ${Math.round(dispatch.eta || 5)} mins)`,
      time: "Live tracking",
      status: "critical"
    });
  }

  return (
    <div className="card-lifted p-5">
      <h3 className="font-[var(--font-display)] text-[13px] font-semibold tracking-tight text-[var(--color-on-surface)] mb-4">
        Recent Activity
      </h3>

      <div className="space-y-0">
        {activities.map((item, idx) => (
          <div
            key={item.id}
            className="relative flex gap-3 pb-4 last:pb-0 animate-fade-in"
            style={{ animationDelay: `${idx * 0.07}s` }}
          >
            {/* Timeline line */}
            {idx < activities.length - 1 && (
              <div className="absolute left-[7px] top-[18px] h-[calc(100%-6px)] w-px bg-[var(--color-surface-container-high)]" />
            )}

            {/* Dot */}
            <div
              className={`relative z-10 mt-1.5 h-[15px] w-[15px] shrink-0 rounded-full border-[3px] border-[var(--color-surface)] ${statusColors[item.status]}`}
            />

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-[var(--font-display)] text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--color-primary)]">
                  {item.action}
                </span>
                <span className="text-[10px] text-[var(--color-on-surface-muted)]">
                  {item.time}
                </span>
              </div>
              <p className="mt-0.5 text-[12px] text-[var(--color-on-surface-muted)] leading-snug">
                {item.target}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
