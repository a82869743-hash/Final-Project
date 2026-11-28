import { type LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  change?: string;
  changeType?: "up" | "down" | "neutral";
  icon: LucideIcon;
  accentColor?: string;
}

export default function StatCard({
  label,
  value,
  change,
  changeType = "neutral",
  icon: Icon,
  accentColor,
}: StatCardProps) {
  const changeColors = {
    up: "text-[var(--color-success)] bg-[var(--color-success)]/8",
    down: "text-[var(--color-error)] bg-[var(--color-error)]/8",
    neutral: "text-[var(--color-on-surface-muted)] bg-[var(--color-surface-container-low)]",
  };

  return (
    <div className="group card-lifted flex flex-col justify-between p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-ambient)]">
      <div className="flex items-start justify-between mb-4">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] transition-transform duration-200 group-hover:scale-105"
          style={{
            backgroundColor: accentColor
              ? `${accentColor}15`
              : "var(--color-surface-container-high)",
          }}
        >
          <Icon
            className="h-5 w-5"
            style={{ color: accentColor ?? "var(--color-on-surface-muted)" }}
          />
        </div>
        {change && (
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${changeColors[changeType]}`}
          >
            {change}
          </span>
        )}
      </div>

      <div>
        <p className="font-[var(--font-display)] text-[26px] leading-tight font-bold tracking-tight text-[var(--color-on-surface)] tabular-nums">
          {value}
        </p>
        <p className="mt-0.5 font-[var(--font-display)] text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--color-on-surface-muted)]">
          {label}
        </p>
      </div>
    </div>
  );
}
