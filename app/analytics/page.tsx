"use client";

import { useEffect, useMemo, useState } from "react";
import {
  TrendingUp, TrendingDown, Skull, Car, AlertTriangle, Activity, MapPin, BrainCircuit,
  Database, Clock, CloudRain, Ambulance, Loader2,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area,
  Cell, LineChart, Line, Legend,
} from "recharts";
import { api, API_BASE, type AnalyticsStats } from "@/lib/api";

const tooltipStyle = {
  backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "8px",
  boxShadow: "0 8px 24px rgba(0,0,0,0.08)", fontSize: "11px", color: "#1e293b",
};
const TIER_COLOR: Record<string, string> = { High: "#dc2626", Medium: "#d97706", Low: "#16a34a" };

interface City {
  city: string; state: string; latitude: number; longitude: number;
  accidents_2021: number | null; accidents_2022: number | null; deaths_2021: number | null; deaths_2022: number | null;
  injured_2022: number | null; fatality_rate_2022: number | null; yoy_change_2021_2022: number | null;
  night_share_2020: number | null; risk_index: number; risk_tier: string;
  share_overspeeding_2020: number | null; share_drunk_driving_2020: number | null;
}
interface IndiaStats {
  cities: City[];
  totals: { accidents_2021: number; accidents_2022: number; deaths_2021: number; deaths_2022: number; injured_2022: number; cities: number };
  month_profile_2020: { month: string; accidents: number }[];
  slot_profile_2020: { slot: string; accidents: number }[];
  national_time_2018: { slot: string; share: number }[];
  weather_2018: { weather: string; accidents: number; killed: number; deaths_per_100: number; severity_multiplier: number }[];
  cause_share_mean_2020: Record<string, number>;
  sources: string[];
}
interface Forecast { hour: string; risk_level: string; percentile: number; p_fatal_or_serious: number; expected_deaths_per_hour: number }

const pct = (v: number | null | undefined, d = 1) => v == null ? "—" : `${(v * 100).toFixed(d)}%`;
const num = (v: number | null | undefined) => v == null ? "—" : Math.round(v).toLocaleString();

export default function AnalyticsPage() {
  const [tab, setTab] = useState<"overview" | "cities" | "conditions" | "forecast" | "operations">("overview");
  const [stats, setStats] = useState<IndiaStats | null>(null);
  const [ops, setOps] = useState<AnalyticsStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<"risk_index" | "accidents_2022" | "deaths_2022" | "fatality_rate_2022" | "yoy_change_2021_2022">("risk_index");
  const [fcCity, setFcCity] = useState("Delhi");
  const [fcWeather, setFcWeather] = useState(0);
  const [forecast, setForecast] = useState<Forecast[] | null>(null);
  const [fcLoading, setFcLoading] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/india-stats`).then((r) => r.json()).then(setStats).catch(() => setError("Backend unreachable — start the API to load real statistics."));
    api.getAnalytics().then(setOps).catch(() => {});
  }, []);

  const fcTarget = stats?.cities.find((c) => c.city === fcCity);
  useEffect(() => {
    if (!fcTarget) return;
    let active = true;
    const t = setTimeout(() => {
      setFcLoading(true);
      fetch(`${API_BASE}/risk-forecast?lat=${fcTarget.latitude}&lng=${fcTarget.longitude}&hours=24&weather=${fcWeather}`)
        .then((r) => r.json()).then((d) => active && setForecast(d.forecast)).catch(() => {})
        .finally(() => active && setFcLoading(false));
    }, 0);
    return () => { active = false; clearTimeout(t); };
  }, [fcTarget, fcWeather]);

  const sorted = useMemo(() => stats ? [...stats.cities].sort((a, b) => ((b[sortKey] ?? -Infinity) as number) - ((a[sortKey] ?? -Infinity) as number)) : [], [stats, sortKey]);

  const insights = useMemo(() => {
    if (!stats) return [];
    const withData = stats.cities.filter((c) => c.accidents_2022 && c.fatality_rate_2022 != null);
    const deadliest = [...withData].sort((a, b) => b.fatality_rate_2022! - a.fatality_rate_2022!)[0];
    const most = [...withData].sort((a, b) => b.accidents_2022! - a.accidents_2022!)[0];
    const rising = [...withData].filter((c) => c.yoy_change_2021_2022 != null).sort((a, b) => b.yoy_change_2021_2022! - a.yoy_change_2021_2022!)[0];
    const peak = [...stats.national_time_2018].sort((a, b) => b.share - a.share)[0];
    const fog = stats.weather_2018.find((w) => w.weather === "Fog");
    const clear = stats.weather_2018.find((w) => w.weather === "Clear");
    return [
      { text: `${most.city} recorded the most accidents in 2022 (${num(most.accidents_2022)}) among million-plus cities`, severity: "critical", icon: Car },
      { text: `${deadliest.city} has the highest fatality rate: ${pct(deadliest.fatality_rate_2022)} of accidents kill someone`, severity: "critical", icon: Skull },
      { text: `${rising.city} saw the steepest rise: ${pct(rising.yoy_change_2021_2022, 0)} more accidents in 2022 vs 2021`, severity: "warning", icon: TrendingUp },
      { text: `Peak window nationally is ${peak.slot} h — ${pct(peak.share)} of all accidents (MoRTH 2018)`, severity: "info", icon: Clock },
      ...(fog && clear ? [{ text: `Fog is ${(fog.deaths_per_100 / clear.deaths_per_100).toFixed(2)}× deadlier per accident than clear weather (${fog.deaths_per_100} vs ${clear.deaths_per_100} deaths/100)`, severity: "warning", icon: CloudRain }] : []),
      { text: `Over-speeding causes ${pct(stats.cause_share_mean_2020.overspeeding, 0)} of city accidents on average (NCRB 2020)`, severity: "info", icon: AlertTriangle },
    ];
  }, [stats]);

  const insightColor = (s: string) => s === "critical" ? "#dc2626" : s === "warning" ? "#d97706" : "#0284c7";

  const kpis = stats ? [
    { label: "Accidents 2022", value: num(stats.totals.accidents_2022), change: (stats.totals.accidents_2022 - stats.totals.accidents_2021) / stats.totals.accidents_2021, icon: Car, color: "#0284c7" },
    { label: "Deaths 2022", value: num(stats.totals.deaths_2022), change: (stats.totals.deaths_2022 - stats.totals.deaths_2021) / stats.totals.deaths_2021, icon: Skull, color: "#dc2626" },
    { label: "Fatality rate", value: pct(stats.totals.deaths_2022 / stats.totals.accidents_2022), change: null, icon: Activity, color: "#d97706" },
    { label: "Cities covered", value: String(stats.totals.cities), change: null, icon: MapPin, color: "#00677f" },
  ] : [];

  return (
    <div className="space-y-5 animate-fade-in">
      {error && <div className="card-lifted p-3 text-[12px] text-[var(--color-error)]">{error}</div>}

      {/* KPI Row */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {!stats && Array.from({ length: 4 }, (_, i) => <div key={i} className="card-lifted h-[72px] shimmer" />)}
        {kpis.map((k) => (
          <div key={k.label} className="card-lifted p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg shrink-0" style={{ background: `${k.color}12` }}>
              <k.icon className="h-5 w-5" style={{ color: k.color }} />
            </div>
            <div>
              <p className="font-[var(--font-display)] text-lg font-bold text-[var(--color-on-surface)]">{k.value}</p>
              <div className="flex items-center gap-1.5">
                <span className="font-[var(--font-display)] text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--color-on-surface-muted)]">{k.label}</span>
                {k.change != null && (
                  <span className={`flex items-center gap-0.5 text-[9px] font-bold ${k.change <= 0 ? "text-[var(--color-success)]" : "text-[var(--color-error)]"}`}>
                    {k.change > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {k.change > 0 ? "+" : ""}{(k.change * 100).toFixed(1)}% vs 2021
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Insights */}
      <div className="card-lifted p-5">
        <h3 className="font-[var(--font-display)] text-[13px] font-bold text-[var(--color-on-surface)] mb-4 flex items-center gap-2">
          <BrainCircuit className="h-4 w-4 text-[var(--color-info)]" /> Data-Driven Insights
          <span className="ml-auto text-[8px] font-bold tracking-wider uppercase px-2 py-0.5 rounded bg-[var(--color-info)]/10 text-[var(--color-info)]">MoRTH · NCRB</span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {insights.map((ins, i) => {
            const c = insightColor(ins.severity);
            return (
              <div key={i} className="flex items-start gap-3 px-3 py-3 rounded-lg border-l-[3px] animate-fade-in" style={{ background: `${c}06`, borderLeftColor: c, animationDelay: `${i * 0.08}s` }}>
                <ins.icon className="h-4 w-4 mt-0.5 shrink-0" style={{ color: c }} />
                <p className="text-[11px] text-[var(--color-on-surface-muted)] leading-relaxed">{ins.text}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 bg-[var(--color-surface-container-low)] border border-[var(--color-outline-variant)] rounded-lg p-1 w-fit">
        {(["overview", "cities", "conditions", "forecast", "operations"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-md text-[11px] font-bold uppercase tracking-wider transition-all ${tab === t ? "bg-[var(--color-primary)]/10 text-[var(--color-primary)] border border-[var(--color-primary)]/20" : "text-[var(--color-on-surface-muted)] hover:text-[var(--color-on-surface)] border border-transparent"}`}>
            {t}
          </button>
        ))}
      </div>

      {stats && tab === "overview" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 animate-fade-in">
          <ChartCard title="Accidents by time of day" sub="53 cities, MoRTH 2020">
            <AreaChart data={stats.slot_profile_2020}>
              <defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#00677f" stopOpacity={0.25} /><stop offset="100%" stopColor="#00677f" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="slot" tick={{ fontSize: 10, fill: "#64748b" }} stroke="#e2e8f0" />
              <YAxis tick={{ fontSize: 10, fill: "#64748b" }} stroke="#e2e8f0" width={50} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="accidents" stroke="#00677f" strokeWidth={2} fill="url(#g1)" />
            </AreaChart>
          </ChartCard>
          <ChartCard title="Accidents by month" sub="53 cities, MoRTH 2020 — note the April–May COVID lockdown dip">
            <BarChart data={stats.month_profile_2020}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#64748b" }} stroke="#e2e8f0" />
              <YAxis tick={{ fontSize: 10, fill: "#64748b" }} stroke="#e2e8f0" width={50} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="accidents" radius={[4, 4, 0, 0]}>
                {stats.month_profile_2020.map((m) => <Cell key={m.month} fill={m.month === "Apr" || m.month === "May" ? "#cbd5e1" : "#0284c7"} />)}
              </Bar>
            </BarChart>
          </ChartCard>
          <ChartCard title="Top 10 cities by deaths (2022)" sub="MoRTH 2022">
            <BarChart data={[...stats.cities].sort((a, b) => (b.deaths_2022 ?? 0) - (a.deaths_2022 ?? 0)).slice(0, 10)} layout="vertical" margin={{ left: 20 }}>
              <XAxis type="number" tick={{ fontSize: 10, fill: "#64748b" }} stroke="#e2e8f0" />
              <YAxis type="category" dataKey="city" width={90} tick={{ fontSize: 10, fill: "#64748b" }} stroke="#e2e8f0" />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="deaths_2022" name="Deaths" fill="#dc2626" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ChartCard>
          <ChartCard title="2021 → 2022 change, top 10 by accidents" sub="MoRTH 2021 & 2022">
            <BarChart data={[...stats.cities].sort((a, b) => (b.accidents_2022 ?? 0) - (a.accidents_2022 ?? 0)).slice(0, 10)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="city" tick={{ fontSize: 9, fill: "#64748b" }} stroke="#e2e8f0" interval={0} angle={-30} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 10, fill: "#64748b" }} stroke="#e2e8f0" width={45} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="accidents_2021" name="2021" fill="#cbd5e1" radius={[3, 3, 0, 0]} />
              <Bar dataKey="accidents_2022" name="2022" fill="#00677f" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ChartCard>
        </div>
      )}

      {stats && tab === "cities" && (
        <div className="card-lifted p-5 animate-fade-in">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <h3 className="font-[var(--font-display)] text-[13px] font-bold mr-auto">City Risk Table · {stats.cities.length} million-plus cities</h3>
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value as typeof sortKey)} className="text-[11px] bg-[var(--color-surface-container-low)] rounded-md px-2 py-1.5 outline-none">
              <option value="risk_index">Sort: risk index</option>
              <option value="accidents_2022">Sort: accidents</option>
              <option value="deaths_2022">Sort: deaths</option>
              <option value="fatality_rate_2022">Sort: fatality rate</option>
              <option value="yoy_change_2021_2022">Sort: YoY change</option>
            </select>
          </div>
          <div className="overflow-x-auto max-h-[520px]">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-white">
                <tr className="text-left">
                  {["#", "City", "Accidents '22", "Deaths '22", "Fatality", "YoY", "Night share", "Over-speeding", "Risk index", "Tier"].map((h) => (
                    <th key={h} className="pb-2 pr-3 font-[var(--font-display)] text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--color-on-surface-muted)]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((c, i) => (
                  <tr key={c.city} className="hover:bg-[var(--color-surface-container-low)]">
                    <td className="py-1.5 pr-3 text-[var(--color-on-surface-muted)]">{i + 1}</td>
                    <td className="py-1.5 pr-3"><b>{c.city}</b> <span className="text-[10px] text-[var(--color-on-surface-muted)]">{c.state}</span></td>
                    <td className="py-1.5 pr-3">{num(c.accidents_2022)}</td>
                    <td className="py-1.5 pr-3">{num(c.deaths_2022)}</td>
                    <td className="py-1.5 pr-3">{pct(c.fatality_rate_2022)}</td>
                    <td className="py-1.5 pr-3" style={{ color: (c.yoy_change_2021_2022 ?? 0) > 0 ? "#dc2626" : "#16a34a" }}>{c.yoy_change_2021_2022 == null ? "—" : `${c.yoy_change_2021_2022 > 0 ? "+" : ""}${(c.yoy_change_2021_2022 * 100).toFixed(0)}%`}</td>
                    <td className="py-1.5 pr-3">{pct(c.night_share_2020, 0)}</td>
                    <td className="py-1.5 pr-3">{pct(c.share_overspeeding_2020, 0)}</td>
                    <td className="py-1.5 pr-3 w-32">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-[var(--color-surface-container-high)] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${c.risk_index}%`, background: TIER_COLOR[c.risk_tier] }} /></div>
                        <span className="font-bold w-8 text-right">{c.risk_index.toFixed(0)}</span>
                      </div>
                    </td>
                    <td className="py-1.5 pr-3"><span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ color: TIER_COLOR[c.risk_tier], background: `${TIER_COLOR[c.risk_tier]}14` }}>{c.risk_tier}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-[var(--color-on-surface-muted)] mt-3">Risk index = 2022 accidents × fatality rate (expected deaths), scaled so the highest city = 100. Cities without 2022 data use their 2020 count.</p>
        </div>
      )}

      {stats && tab === "conditions" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 animate-fade-in">
          <ChartCard title="Deaths per 100 accidents by weather" sub="All India, MoRTH 2018">
            <BarChart data={stats.weather_2018}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="weather" tick={{ fontSize: 10, fill: "#64748b" }} stroke="#e2e8f0" />
              <YAxis tick={{ fontSize: 10, fill: "#64748b" }} stroke="#e2e8f0" width={40} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="deaths_per_100" name="Deaths / 100 accidents" radius={[4, 4, 0, 0]}>
                {stats.weather_2018.map((w) => <Cell key={w.weather} fill={w.severity_multiplier > 1.3 ? "#dc2626" : w.severity_multiplier > 1.05 ? "#d97706" : "#0284c7"} />)}
              </Bar>
            </BarChart>
          </ChartCard>
          <ChartCard title="Share of accidents by time slot" sub="All India, MoRTH 2018">
            <BarChart data={stats.national_time_2018.map((s) => ({ ...s, pct: +(s.share * 100).toFixed(1) }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="slot" tick={{ fontSize: 10, fill: "#64748b" }} stroke="#e2e8f0" />
              <YAxis unit="%" tick={{ fontSize: 10, fill: "#64748b" }} stroke="#e2e8f0" width={40} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="pct" name="% of accidents" fill="#00677f" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartCard>
          <div className="card-lifted p-5 lg:col-span-2">
            <h3 className="font-[var(--font-display)] text-[12px] font-bold mb-3">Average cause mix in cities (NCRB 2020)</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(stats.cause_share_mean_2020).map(([k, v]) => (
                <div key={k} className="rounded-lg p-3 bg-[var(--color-surface-container-low)]">
                  <p className="font-[var(--font-display)] text-xl font-bold">{pct(v, 1)}</p>
                  <p className="font-[var(--font-display)] text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--color-on-surface-muted)]">{k.replace(/_/g, " ")}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {stats && tab === "forecast" && (
        <div className="card-lifted p-5 animate-fade-in">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <h3 className="font-[var(--font-display)] text-[13px] font-bold mr-auto flex items-center gap-2">24-hour Risk Forecast {fcLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}</h3>
            <select value={fcCity} onChange={(e) => setFcCity(e.target.value)} className="text-[11px] bg-[var(--color-surface-container-low)] rounded-md px-2 py-1.5 outline-none">
              {[...stats.cities].sort((a, b) => a.city.localeCompare(b.city)).map((c) => <option key={c.city}>{c.city}</option>)}
            </select>
            <select value={fcWeather} onChange={(e) => setFcWeather(+e.target.value)} className="text-[11px] bg-[var(--color-surface-container-low)] rounded-md px-2 py-1.5 outline-none">
              <option value={0}>Clear</option><option value={1}>Rain</option><option value={2}>Fog</option><option value={3}>Storm</option>
            </select>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={forecast ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "#64748b" }} stroke="#e2e8f0" />
              <YAxis yAxisId="l" domain={[0, 100]} unit="" tick={{ fontSize: 10, fill: "#64748b" }} stroke="#e2e8f0" width={36} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Line yAxisId="l" type="monotone" dataKey="percentile" name="Risk percentile" stroke="#dc2626" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
          <p className="text-[10px] text-[var(--color-on-surface-muted)] mt-2">Real-data engine per hour: city rate (MoRTH 2022) × city time profile (MoRTH 2020) × weather fatality factor (MoRTH 2018) × ML severity. Percentile is vs all Indian city-hours.</p>
        </div>
      )}

      {tab === "operations" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 animate-fade-in">
          <div className="card-lifted p-5">
            <h3 className="font-[var(--font-display)] text-[13px] font-bold mb-4 flex items-center gap-2"><Ambulance className="h-4 w-4 text-[var(--color-primary)]" /> Dispatch Operations (this deployment)</h3>
            {!ops ? <p className="text-[11px] text-[var(--color-on-surface-muted)]">Loading…</p> : (
              <div className="grid grid-cols-2 gap-3">
                {[["Total dispatches", ops.total_dispatches], ["Avg ETA (min)", ops.avg_eta], ["Vehicles tracked", ops.active_vehicles], ["High-risk predictions", ops.high_risk_zones]].map(([l, v]) => (
                  <div key={String(l)} className="rounded-lg p-3 bg-[var(--color-surface-container-low)]">
                    <p className="font-[var(--font-display)] text-xl font-bold">{String(v)}</p>
                    <p className="font-[var(--font-display)] text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--color-on-surface-muted)]">{l}</p>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[10px] text-[var(--color-on-surface-muted)] mt-3">Logged by this system to Supabase, or the local SQLite database when Supabase isn&apos;t configured.</p>
          </div>
          <div className="card-lifted p-5">
            <h3 className="font-[var(--font-display)] text-[13px] font-bold mb-4">Recent dispatches</h3>
            {(ops?.recent_dispatches ?? []).length === 0 ? (
              <p className="text-[11px] text-[var(--color-on-surface-muted)]">No dispatches yet — create one from Dispatch, Voice or Video.</p>
            ) : (
              <ul className="space-y-1.5">
                {(ops?.recent_dispatches ?? []).map((d, i) => (
                  <li key={i} className="text-[11px] flex gap-2 px-2 py-1.5 rounded bg-[var(--color-surface-container-low)]">
                    <b>{d.vehicle_id}</b>
                    <span className="text-[var(--color-on-surface-muted)]">→ {Number(d.hotspot_lat).toFixed(3)}, {Number(d.hotspot_lng).toFixed(3)} · ETA {d.eta ?? "—"} min</span>
                    <span className="ml-auto text-[var(--color-on-surface-muted)]">{d.timestamp ? new Date(d.timestamp).toLocaleTimeString() : ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {stats && (
        <div className="card-lifted p-4 flex items-start gap-2 text-[10px] text-[var(--color-on-surface-muted)]">
          <Database className="h-3.5 w-3.5 shrink-0 mt-0.5 text-[var(--color-primary)]" />
          <span><b>Sources:</b> {stats.sources.join(" · ")}</span>
        </div>
      )}
    </div>
  );
}

function ChartCard({ title, sub, children }: { title: string; sub: string; children: React.ReactElement }) {
  return (
    <div className="card-lifted p-5">
      <h3 className="font-[var(--font-display)] text-[12px] font-bold text-[var(--color-on-surface)]">{title}</h3>
      <p className="text-[10px] text-[var(--color-on-surface-muted)] mb-3">{sub}</p>
      <ResponsiveContainer width="100%" height={260}>{children}</ResponsiveContainer>
    </div>
  );
}
