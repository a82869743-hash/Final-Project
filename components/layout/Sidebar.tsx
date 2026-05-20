"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Truck,
  MapPin,
  BarChart3,
  Mic,
  Mic2,
  Video,
  Settings,
  Loader2,
  ShieldAlert,
} from "lucide-react";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Dispatch", href: "/dispatch", icon: Truck },
  { label: "Tracking", href: "/tracking", icon: MapPin },
  { label: "Analytics", href: "/analytics", icon: BarChart3 },
  { label: "Analyzer", href: "/analyzer", icon: Mic },
  { label: "Voice Command", href: "/voice", icon: Mic2 },
  { label: "Video Intel", href: "/video-intelligence", icon: Video },
  { label: "Settings", href: "/settings", icon: Settings },
];

type SystemState = "online" | "degraded" | "offline" | "checking";

const stateConfig: Record<SystemState, { color: string; bg: string; label: string }> = {
  online: { color: "#16a34a", bg: "rgba(22,163,74,0.06)", label: "All Systems Online" },
  degraded: { color: "#d97706", bg: "rgba(217,119,6,0.06)", label: "Partially Degraded" },
  offline: { color: "#dc2626", bg: "rgba(220,38,38,0.06)", label: "Backend Offline" },
  checking: { color: "#64748b", bg: "rgba(100,116,139,0.04)", label: "Checking..." },
};

export default function Sidebar() {
  const pathname = usePathname();
  const [systemState, setSystemState] = useState<SystemState>("checking");
  const [serviceCount, setServiceCount] = useState("—");

  useEffect(() => {
    async function checkHealth() {
      setSystemState("checking");
      try {
        // Render free tier cold starts can take ~30s; use generous timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        const res = await fetch(
          (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api") + "/health",
          { cache: "no-store", signal: controller.signal }
        );
        clearTimeout(timeoutId);
        if (res.ok) {
          const data = await res.json();
          const statuses = Object.values(data) as { status: string }[];
          const onlineCount = statuses.filter((s) => s.status === "online").length;
          const total = statuses.length;
          setServiceCount(`${onlineCount}/${total}`);

          if (onlineCount === total) {
            setSystemState("online");
          } else if (onlineCount > 0) {
            setSystemState("degraded");
          } else {
            setSystemState("offline");
          }
        } else {
          setSystemState("offline");
          setServiceCount("0/4");
        }
      } catch {
        setSystemState("offline");
        setServiceCount("0/4");
      }
    }

    checkHealth();
    const interval = setInterval(checkHealth, 30000); // Re-check every 30s
    return () => clearInterval(interval);
  }, []);

  const state = stateConfig[systemState];

  return (
    <aside className="fixed left-0 top-0 h-full w-[260px] flex flex-col z-40 border-r border-[var(--color-outline-variant)]" style={{ background: "var(--color-surface)" }}>
      {/* ── Brand ── */}
      <div className="flex items-center gap-3 px-6 py-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-dim)] overflow-hidden shadow-lg">
          <Image src="/logo.png" alt="Sentinel" width={28} height={28} className="object-contain" />
        </div>
        <div>
          <h1 className="font-[var(--font-display)] text-[15px] font-bold tracking-tight text-[var(--color-on-surface)]">
            SENTINEL
          </h1>
          <span className="font-[var(--font-display)] text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--color-on-surface-muted)]">
            Tactical Command
          </span>
        </div>
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 px-3 py-2 space-y-0.5">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || pathname?.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group flex items-center gap-3 rounded-lg px-4 py-2.5 text-[12px] font-medium transition-all duration-200
                ${
                  isActive
                    ? "bg-[var(--color-primary)]/8 text-[var(--color-primary)] border border-[var(--color-primary)]/15"
                    : "text-[var(--color-on-surface-muted)] hover:bg-[var(--color-surface-container-low)] hover:text-[var(--color-on-surface)] border border-transparent"
                }`}
            >
              <item.icon
                className={`h-[16px] w-[16px] transition-colors ${
                  isActive
                    ? "text-[var(--color-primary)]"
                    : "text-[var(--color-on-surface-muted)] group-hover:text-[var(--color-on-surface)]"
                }`}
              />
              {item.label}
              {isActive && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[var(--color-primary)] shadow-[0_0_6px_var(--color-primary)]" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* ── Live System Status ── */}
      <div
        className="mx-3 mb-4 rounded-lg px-4 py-3 transition-all duration-500 border border-[var(--color-outline-variant)]"
        style={{ backgroundColor: state.bg }}
      >
        <div className="flex items-center gap-2 mb-1.5">
          {systemState === "checking" ? (
            <Loader2 className="h-3 w-3 animate-spin" style={{ color: state.color }} />
          ) : (
            <span
              className="h-2 w-2 rounded-full animate-pulse"
              style={{ backgroundColor: state.color, boxShadow: `0 0 6px ${state.color}` }}
            />
          )}
          <span className="font-[var(--font-display)] text-[9px] font-bold uppercase tracking-[0.12em]" style={{ color: state.color }}>
            {state.label}
          </span>
        </div>
        <p className="text-[10px] text-[var(--color-on-surface-muted)] font-medium">
          Services: <span className="text-[var(--color-on-surface)] font-bold">{serviceCount}</span>
        </p>
      </div>
    </aside>
  );
}
