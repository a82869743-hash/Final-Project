"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import {
  Bell, Search, User, X, AlertTriangle, Info, CheckCircle,
  Wifi, WifiOff, Activity, CloudSun, CloudRain, CloudFog, CloudLightning, Shield, Menu, CornerDownLeft,
} from "lucide-react";
import { api, type NearestWeather } from "@/lib/api";
import { navigation } from "@/components/layout/Sidebar";

const WX_ICONS = [CloudSun, CloudRain, CloudFog, CloudLightning];
const DEFAULT_LOCATION = { lat: 28.6139, lng: 77.209 }; // New Delhi
import { useToast } from "@/components/ui/Toast";

const pageTitles: Record<string, string> = {
  "/dashboard": "Command Dashboard",
  "/dispatch": "Dispatch Control",
  "/tracking": "Fleet Tracking",
  "/hospitals": "Hospital Monitoring",
  "/risk": "Risk Intelligence",
  "/planner": "Fleet Planner",
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

export default function Navbar({ onMenu }: { onMenu?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
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
  const [weather, setWeather] = useState<NearestWeather | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const searchRef = useRef<HTMLDivElement>(null);

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
        setVehicleCount(vehicles.filter((v) => v.status !== "offline").length);
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
      } catch {
        // Silently fail if backend is unreachable
      }
    }
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 10000);
    return () => clearInterval(interval);
  }, []);

  // Live weather (Open-Meteo via backend) for the operator's city: uses the
  // browser location only if permission was already granted, else New Delhi
  useEffect(() => {
    let cancelled = false;
    async function load(lat: number, lng: number) {
      try {
        const w = await api.getWeatherNearest(lat, lng);
        if (!cancelled) setWeather(w);
      } catch { /* keep last value */ }
    }
    async function resolve() {
      try {
        const perm = await navigator.permissions?.query({ name: "geolocation" as PermissionName });
        if (perm?.state === "granted") {
          navigator.geolocation.getCurrentPosition(
            (p) => load(p.coords.latitude, p.coords.longitude),
            () => load(DEFAULT_LOCATION.lat, DEFAULT_LOCATION.lng),
            { maximumAge: 600000, timeout: 8000 },
          );
          return;
        }
      } catch { /* permissions API unsupported */ }
      load(DEFAULT_LOCATION.lat, DEFAULT_LOCATION.lng);
    }
    resolve();
    const interval = setInterval(resolve, 600000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // Close search suggestions when clicking outside
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
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

  const q = searchQuery.trim().toLowerCase();
  const suggestions = q
    ? navigation.filter((n) => n.label.toLowerCase().includes(q) || n.href.includes(q) ||
        (pageTitles[n.href] ?? "").toLowerCase().includes(q))
    : navigation;

  function go(href: string) {
    router.push(href);
    setSearchQuery("");
    setSearchOpen(false);
  }

  function handleSearch(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Escape") { setSearchOpen(false); (e.target as HTMLInputElement).blur(); }
    else if (e.key === "Enter") {
      const hit = suggestions[activeIdx] ?? suggestions[0];
      if (hit) go(hit.href);
      else if (q) showToast(`No page matches "${searchQuery}"`, "info");
    }
  }

  const WxIcon = WX_ICONS[weather?.weather_class ?? 0] ?? CloudSun;

  function handleProfileClick() {
    showToast("Profile settings coming soon", "info");
  }

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--color-outline-variant)]" style={{ background: "var(--color-surface)" }}>
      {/* ── Global Status Bar ── */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-1.5 border-b border-[var(--color-outline-variant)]" style={{ background: "var(--color-surface-container-low)" }}>
        <div className="flex items-center gap-4">
          <span className="text-[10px] font-mono font-bold text-[var(--color-on-surface-muted)] tracking-wider tabular-nums" suppressHydrationWarning>{time}</span>
          <div className="h-3 w-px bg-[var(--color-outline-variant)]" />
          <div className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${aiOnline ? "bg-[var(--color-success)]" : "bg-[var(--color-error)]"} animate-pulse`} />
            <span className={`text-[9px] font-bold tracking-wider uppercase ${aiOnline ? "text-[var(--color-success)]" : "text-[var(--color-error)]"}`}>
              AI {aiOnline ? "ONLINE" : "OFFLINE"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 sm:gap-4">
          <div className="hidden sm:flex items-center gap-1.5 text-[9px] font-bold tracking-wider text-[var(--color-on-surface-muted)] uppercase">
            <Activity className="h-3 w-3 text-[var(--color-info)]" />
            <span>Vehicles:</span>
            <span className="text-[var(--color-on-surface)]">{vehicleCount}</span>
          </div>
          <div className="hidden sm:block h-3 w-px bg-[var(--color-outline-variant)]" />
          <div className="hidden md:flex items-center gap-1.5 text-[9px] font-bold tracking-wider text-[var(--color-on-surface-muted)] uppercase">
            <Shield className="h-3 w-3 text-[var(--color-warning)]" />
            <span>Incidents:</span>
            <span className="text-[var(--color-on-surface)]">{incidentCount}</span>
          </div>
          <div className="hidden md:block h-3 w-px bg-[var(--color-outline-variant)]" />
          <div className="flex items-center gap-1.5 text-[9px] font-bold tracking-wider text-[var(--color-on-surface-muted)] uppercase"
            title={weather?.live ? `${weather.description} · live from Open-Meteo` : "Live weather unavailable"}>
            <WxIcon className="h-3 w-3 text-[var(--color-warning)]" />
            <span className="tabular-nums">{weather?.temperature_c != null ? `${Math.round(weather.temperature_c)}°C` : "—"}</span>
            {weather?.city && <span className="hidden lg:inline text-[var(--color-on-surface-muted)]">{weather.city}</span>}
          </div>
          <div className="h-3 w-px bg-[var(--color-outline-variant)]" />
          <div className="flex items-center gap-1.5 text-[9px] font-bold tracking-wider text-[var(--color-on-surface-muted)] uppercase">
            {aiOnline ? <Wifi className="h-3 w-3 text-[var(--color-success)]" /> : <WifiOff className="h-3 w-3 text-[var(--color-error)]" />}
            <span className={aiOnline ? "" : "text-[var(--color-error)]"}>{aiOnline ? "Connected" : "Reconnecting"}</span>
          </div>
        </div>
      </div>

      {/* ── Main Navbar ── */}
      <div className="flex h-14 items-center justify-between gap-3 px-4 sm:px-6">
        {/* Page Title */}
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={onMenu} aria-label="Open menu"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--color-on-surface-muted)] hover:bg-[var(--color-surface-container-low)] lg:hidden">
            <Menu className="h-4 w-4" />
          </button>
          <h2 className="truncate font-[var(--font-display)] text-[15px] font-bold tracking-tight text-[var(--color-on-surface)]">
            {title}
          </h2>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-2">
          {/* Search — jump to any page */}
          <div className="relative mr-1 sm:mr-2 hidden sm:block" ref={searchRef}>
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-on-surface-muted)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setActiveIdx(0); setSearchOpen(true); }}
              onFocus={() => setSearchOpen(true)}
              onKeyDown={handleSearch}
              placeholder="Jump to…"
              aria-label="Search pages"
              className="h-8 w-48 rounded-lg bg-[var(--color-surface-container-low)] border border-[var(--color-outline-variant)] pl-9 pr-4 text-[12px] text-[var(--color-on-surface)] placeholder:text-[var(--color-on-surface-muted)] outline-none transition-colors focus:border-[var(--color-primary)]/40 focus:shadow-[0_0_0_1px_rgba(0,103,127,0.15)]"
            />
            {searchOpen && (
              <div className="absolute right-0 top-10 w-60 rounded-lg border border-[var(--color-outline-variant)] bg-[var(--color-surface)] p-1 shadow-[var(--shadow-ambient)] animate-fade-in z-50">
                {suggestions.length === 0 ? (
                  <div className="px-3 py-3 text-[11px] text-[var(--color-on-surface-muted)]">No matching page</div>
                ) : suggestions.map((n, i) => (
                  <button key={n.href} onMouseDown={(e) => { e.preventDefault(); go(n.href); }} onMouseEnter={() => setActiveIdx(i)}
                    className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[12px] transition-colors ${i === activeIdx ? "bg-[var(--color-primary)]/8 text-[var(--color-primary)]" : "text-[var(--color-on-surface)]"}`}>
                    <n.icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="flex-1">{n.label}</span>
                    {i === activeIdx && <CornerDownLeft className="h-3 w-3 opacity-60" />}
                  </button>
                ))}
              </div>
            )}
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
