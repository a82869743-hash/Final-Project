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
    up: "text-[var(--color-success)]",
    down: "text-[var(--color-error)]",
    neutral: "text-[var(--color-on-surface-muted)]",
  };

  return (
    <div className="card-lifted flex flex-col justify-between p-5 transition-all duration-200 hover:shadow-[var(--shadow-ambient)]">
      <div className="flex items-start justify-between mb-4">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)]"
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
            className={`text-[11px] font-semibold ${changeColors[changeType]}`}
          >
            {change}
          </span>
        )}
      </div>

      <div>
        <p className="font-[var(--font-display)] text-2xl font-bold tracking-tight text-[var(--color-on-surface)]">
          {value}
        </p>
        <p className="mt-0.5 font-[var(--font-display)] text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--color-on-surface-muted)]">
          {label}
        </p>
      </div>
    </div>
  );
}
