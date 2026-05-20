"use client";

import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import {
  Bell, Search, User, X, AlertTriangle, Info, CheckCircle,
  Wifi, Activity, CloudSun, Shield, Zap,
} from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";

const pageTitles: Record<string, string> = {
  "/dashboard": "Command Dashboard",
  "/dispatch": "Dispatch Control",
  "/tracking": "Fleet Tracking",
  "/analytics": "Strategic Analytics",
  "/analyzer": "Call Analyzer",
  "/voice": "Voice Command",
  "/video-intelligence": "Video Intelligence",
  "/settings": "System Settings",
};

interface Notification {
  id: string;
  title: string;
  time: string;
  type: "critical" | "warning" | "info" | "success";
  read: boolean;
}

const typeConfig = {
  critical: { icon: AlertTriangle, color: "#dc2626" },
  warning: { icon: AlertTriangle, color: "#d97706" },
  info: { icon: Info, color: "#0284c7" },
  success: { icon: CheckCircle, color: "#16a34a" },
};

export default function Navbar() {
  const pathname = usePathname();
  const title = pageTitles[pathname ?? ""] ?? "Sentinel";
  const { showToast } = useToast();
  
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const [time, setTime] = useState("");
  const [vehicleCount, setVehicleCount] = useState(0);
  const [incidentCount, setIncidentCount] = useState(0);
  const [aiOnline, setAiOnline] = useState(true);

  const unreadCount = notifications.filter((n) => !n.read).length;

  // Live clock
  useEffect(() => {
    const update = () => setTime(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch live stats
  useEffect(() => {
    async function fetchStats() {
      try {
        const [vehicles, alerts] = await Promise.all([api.getVehicles(), api.getAlerts()]);
        setVehicleCount(vehicles.filter((v: any) => v.status !== "offline").length);
        setIncidentCount(alerts.length);
        setAiOnline(true);
      } catch {
        setAiOnline(false);
      }
    }
    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, []);

  // Polling alerts from the backend
  useEffect(() => {
    async function fetchAlerts() {
      try {
        const data = await api.getAlerts();
        const mapped: Notification[] = data.map(a => ({
          id: a.id,
          title: `${a.title} - ${a.location}`,
          time: a.time,
          type: a.severity as "critical" | "warning" | "info" | "success",
          read: false
        }));
        
        setNotifications((prev) => {
          const newNotifs = [...prev];
          mapped.forEach(m => {
            const existing = newNotifs.find(n => n.id === m.id);
            if (!existing) {
              newNotifs.unshift(m);
            }
          });
          return newNotifs;
        });
      } catch (err) {
        // Silently fail if backend is unreachable
      }
    }
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 10000);
    return () => clearInterval(interval);
  }, []);

  // Close panel when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    }
    if (showNotifications) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showNotifications]);

  function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    showToast("All notifications marked as read", "success");
  }

  function dismissNotification(id: string) {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }

  function handleSearch(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && searchQuery.trim()) {
      showToast(`Searching for: ${searchQuery}`, "info");
    }
  }

  function handleProfileClick() {
    showToast("Profile settings coming soon", "info");
  }

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--color-outline-variant)]" style={{ background: "var(--color-surface)" }}>
      {/* ── Global Status Bar ── */}
      <div className="flex items-center justify-between px-6 py-1.5 border-b border-[var(--color-outline-variant)]" style={{ background: "var(--color-surface-container-low)" }}>
        <div className="flex items-center gap-4">
          <span className="text-[10px] font-mono font-bold text-[var(--color-on-surface-muted)] tracking-wider">{time}</span>
          <div className="h-3 w-px bg-[var(--color-outline-variant)]" />
          <div className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${aiOnline ? "bg-[var(--color-success)]" : "bg-[var(--color-error)]"} animate-pulse`} />
            <span className={`text-[9px] font-bold tracking-wider uppercase ${aiOnline ? "text-[var(--color-success)]" : "text-[var(--color-error)]"}`}>
              AI {aiOnline ? "ONLINE" : "OFFLINE"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-[9px] font-bold tracking-wider text-[var(--color-on-surface-muted)] uppercase">
            <Activity className="h-3 w-3 text-[var(--color-info)]" />
            <span>Vehicles:</span>
            <span className="text-[var(--color-on-surface)]">{vehicleCount}</span>
          </div>
          <div className="h-3 w-px bg-[var(--color-outline-variant)]" />
          <div className="flex items-center gap-1.5 text-[9px] font-bold tracking-wider text-[var(--color-on-surface-muted)] uppercase">
            <Shield className="h-3 w-3 text-[var(--color-warning)]" />
            <span>Incidents:</span>
            <span className="text-[var(--color-on-surface)]">{incidentCount}</span>
          </div>
          <div className="h-3 w-px bg-[var(--color-outline-variant)]" />
          <div className="flex items-center gap-1.5 text-[9px] font-bold tracking-wider text-[var(--color-on-surface-muted)] uppercase">
            <CloudSun className="h-3 w-3 text-[var(--color-warning)]" />
            <span>32°C</span>
          </div>
          <div className="h-3 w-px bg-[var(--color-outline-variant)]" />
          <div className="flex items-center gap-1.5 text-[9px] font-bold tracking-wider text-[var(--color-on-surface-muted)] uppercase">
            <Wifi className="h-3 w-3 text-[var(--color-success)]" />
            <span>Connected</span>
          </div>
        </div>
      </div>

      {/* ── Main Navbar ── */}
      <div className="flex h-14 items-center justify-between px-6">
        {/* Page Title */}
        <div>
          <h2 className="font-[var(--font-display)] text-[15px] font-bold tracking-tight text-[var(--color-on-surface)]">
            {title}
          </h2>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative mr-2">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-on-surface-muted)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearch}
              placeholder="Search..."
              className="h-8 w-48 rounded-lg bg-[var(--color-surface-container-low)] border border-[var(--color-outline-variant)] pl-9 pr-4 text-[12px] text-[var(--color-on-surface)] placeholder:text-[var(--color-on-surface-muted)] outline-none transition-colors focus:border-[var(--color-primary)]/40 focus:shadow-[0_0_0_1px_rgba(0,103,127,0.15)]"
            />
          </div>

          {/* Notifications */}
          <div className="relative" ref={panelRef}>
            <button
              onClick={() => setShowNotifications((p) => !p)}
              className="relative flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-on-surface-muted)] transition-colors hover:bg-[var(--color-surface-container-high)] hover:text-[var(--color-on-surface)]"
            >
              <Bell className="h-[16px] w-[16px]" />
              {unreadCount > 0 && (
                <span className="absolute right-0.5 top-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-[var(--color-error)] px-1 text-[8px] font-bold text-white">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            {/* Notifications Panel */}
            {showNotifications && (
              <div className="absolute right-0 top-12 w-[360px] rounded-lg bg-[var(--color-surface)] shadow-[var(--shadow-ambient)] border border-[var(--color-outline-variant)] overflow-hidden animate-fade-in z-50">
                <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-outline-variant)]">
                  <h4 className="font-[var(--font-display)] text-[12px] font-bold text-[var(--color-on-surface)]">
                    Notifications
                  </h4>
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllRead}
                      className="text-[10px] font-medium text-[var(--color-primary)] hover:underline flex items-center gap-1"
                    >
                      <CheckCircle className="h-3 w-3" />
                      Mark all read
                    </button>
                  )}
                </div>

                <div className="max-h-[320px] overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="px-4 py-8 text-center text-[11px] text-[var(--color-on-surface-muted)] flex flex-col items-center">
                      <Bell className="h-6 w-6 mb-2 opacity-20" />
                      No notifications right now
                    </div>
                  ) : (
                    notifications.map((n) => {
                      const cfg = typeConfig[n.type] || typeConfig.info;
                      const Icon = cfg.icon;
                      return (
                        <div
                          key={n.id}
                          className={`group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-[var(--color-surface-container-low)] ${
                            !n.read ? "bg-[rgba(0,103,127,0.04)]" : ""
                          }`}
                          onClick={() => {
                            if (!n.read) {
                              setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
                            }
                          }}
                        >
                          <Icon
                            className="h-4 w-4 mt-0.5 shrink-0"
                            style={{ color: cfg.color }}
                          />
                          <div className="flex-1 min-w-0 cursor-pointer">
                            <p className={`text-[11px] leading-snug ${!n.read ? "font-medium text-[var(--color-on-surface)]" : "text-[var(--color-on-surface-muted)]"}`}>
                              {n.title}
                            </p>
                            <span className="text-[9px] text-[var(--color-on-surface-muted)]">
                              {n.time}
                            </span>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); dismissNotification(n.id); }}
                            className="shrink-0 p-0.5 opacity-0 group-hover:opacity-100 rounded-full hover:bg-[var(--color-surface-container-high)] transition-all"
                          >
                            <X className="h-3 w-3 text-[var(--color-on-surface-muted)]" />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Avatar */}
          <button 
            onClick={handleProfileClick}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-dim)] text-white transition-transform hover:scale-105 active:scale-95"
          >
            <User className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
}
