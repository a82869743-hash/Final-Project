"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  Route, Ambulance, Activity, Skull, ShieldCheck, ArrowRight, AlertTriangle, Loader2,
  RefreshCw, CloudSun, CloudRain, CloudFog, CloudLightning, Sparkles, Database, MapPin, CheckCircle2,
} from "lucide-react";
import {
  AreaChart, Area, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";
import {
  api, type CityForecast, type DemandHour, type DemandModelCard, type FleetPlan,
} from "@/lib/api";
import { useToast } from "@/components/ui/Toast";

const FleetPlanMap = dynamic(() => import("@/components/map/FleetPlanMap"), {
  ssr: false,
  loading: () => <div className="card-lifted h-[440px] shimmer" />,
});

const HORIZONS = [3, 6, 12, 24];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WX_ICON = [CloudSun, CloudRain, CloudFog, CloudLightning];

const tooltipStyle = {
  backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "8px",
  boxShadow: "0 8px 24px rgba(0,0,0,0.08)", fontSize: "11px", color: "#1e293b",
};

function Label({ children }: { children: React.ReactNode }) {
  return <span className="font-[var(--font-display)] text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--color-on-surface-muted)]">{children}</span>;
}

function SectionTitle({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-4">
      <div>
        <h3 className="font-[var(--font-display)] text-[13px] font-bold text-[var(--color-on-surface)]">{title}</h3>
        {sub && <p className="text-[10px] text-[var(--color-on-surface-muted)] mt-0.5">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

export default function PlannerPage() {
  const { showToast } = useToast();
  const [horizon, setHorizon] = useState(6);
  const [plan, setPlan] = useState<FleetPlan | null>(null);
  const [national, setNational] = useState<DemandHour[]>([]);
  const [card, setCard] = useState<DemandModelCard | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [forecast, setForecast] = useState<CityForecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (h: number) => {
    try {
      const [p, n] = await Promise.all([api.getFleetPlan(h), api.getNationalDemand()]);
      setPlan(p);
      setNational(n.hours);
      setSelected((s) => s ?? p.cities[0]?.city ?? null);
      setError(null);
    } catch {
      setError("Backend unreachable — retrying…");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(() => load(horizon), 0);
    const t = setInterval(() => load(horizon), 20000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [horizon, load]);

  useEffect(() => { api.getDemandModel().then(setCard).catch(() => {}); }, []);

  useEffect(() => {
    if (!selected) return;
    let active = true;
    api.getCityForecast(selected, 24).then((f) => active && setForecast(f)).catch(() => {});
    return () => { active = false; };
  }, [selected]);

  const apply = async () => {
    if (!plan || plan.units_to_move === 0) return;
    setApplying(true);
    try {
      const r = await api.applyFleetPlan(horizon);
      showToast(`${r.applied} unit${r.applied === 1 ? "" : "s"} repositioning — coverage ${pct(r.coverage_before)} → ${pct(r.coverage_after)}`, "success");
      await load(horizon);
    } catch {
      showToast("Could not apply the plan — backend unreachable", "error");
    } finally {
      setApplying(false);
    }
  };

  const sel = useMemo(() => plan?.cities.find((c) => c.city === selected) ?? null, [plan, selected]);

  const seasonality = useMemo(() => {
    if (!forecast) return [];
    const tot = forecast.month_counts_2023.reduce((a, b) => a + b, 0) || 1;
    return MONTHS.map((m, i) => ({
      month: m,
      observed: +(forecast.month_counts_2023[i] / tot * 100).toFixed(2),
      model: +(forecast.month_share[i] * 100).toFixed(2),
      current: i === new Date().getMonth(),
    }));
  }, [forecast]);

  const kpis = plan ? [
    { label: `Accidents · next ${horizon}h`, value: plan.expected_accidents_total.toFixed(1), sub: "53 cities, NCRB 2023 rates", icon: Activity, color: "#0284c7" },
    { label: "Expected deaths", value: plan.expected_deaths_total.toFixed(1), sub: plan.weather.live ? "live-weather adjusted" : "clear-weather baseline", icon: Skull, color: "#dc2626" },
    { label: "Demand coverage", value: pct(plan.coverage_now), sub: `→ ${pct(plan.coverage_after)} after plan`, icon: ShieldCheck, color: plan.coverage_now >= 0.8 ? "#16a34a" : "#d97706" },
    { label: "Units to move", value: String(plan.units_to_move), sub: `of ${plan.fleet.deployable} on standby`, icon: Route, color: "#00677f" },
    { label: "Unmet demand", value: String(plan.unmet_units), sub: plan.unmet_units ? `${plan.unmet_cities.length} cities out of reach` : "every city reachable", icon: AlertTriangle, color: plan.unmet_units ? "#d97706" : "#16a34a" },
  ] : [];

  return (
    <div className="space-y-5 animate-fade-in">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-[var(--font-display)] text-xl font-bold text-[var(--color-on-surface)] flex items-center gap-2">
            <Route className="h-5 w-5 text-[var(--color-primary)]" /> Fleet Pre-positioning Planner
          </h1>
          <p className="text-[11px] text-[var(--color-on-surface-muted)] mt-0.5 max-w-2xl">
            Forecasts accidents per city from real NCRB 2023 and MoRTH data, adjusts severity for live weather,
            and moves standby ambulances to where demand will be.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {plan && (
            <span className={`hidden sm:inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[10px] font-bold ${plan.weather.live ? "bg-[var(--color-success)]/10 text-[var(--color-success)]" : "bg-[var(--color-warning)]/10 text-[var(--color-warning)]"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${plan.weather.live ? "bg-[var(--color-success)] animate-pulse" : "bg-[var(--color-warning)]"}`} />
              {plan.weather.live ? "LIVE WEATHER" : "WEATHER OFFLINE"}
            </span>
          )}
          <div className="flex rounded-lg bg-[var(--color-surface-container-low)] p-1 border border-[var(--color-outline-variant)]/60">
            {HORIZONS.map((h) => (
              <button key={h} onClick={() => { setHorizon(h); setLoading(true); }}
                className={`px-3 py-1.5 rounded-md text-[11px] font-bold font-[var(--font-display)] transition-all ${horizon === h ? "bg-white text-[var(--color-primary)] shadow-sm" : "text-[var(--color-on-surface-muted)] hover:text-[var(--color-on-surface)]"}`}>
                {h}h
              </button>
            ))}
          </div>
          <button onClick={() => { setLoading(true); load(horizon); }} aria-label="Refresh plan"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-outline-variant)]/60 bg-white text-[var(--color-on-surface-muted)] hover:text-[var(--color-primary)] transition-colors">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/5 px-4 py-2.5 text-[11px] text-[var(--color-warning)] flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5" /> {error}
        </div>
      )}

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {(kpis.length ? kpis : Array.from({ length: 5 }, () => null)).map((k, i) => k ? (
          <div key={k.label} className="card-lifted p-4 transition-shadow hover:shadow-[var(--shadow-ambient)]">
            <div className="flex items-center gap-2 mb-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-md" style={{ background: `${k.color}14` }}>
                <k.icon className="h-3.5 w-3.5" style={{ color: k.color }} />
              </span>
              <Label>{k.label}</Label>
            </div>
            <div className="font-[var(--font-display)] text-2xl font-bold text-[var(--color-on-surface)] tabular-nums">{k.value}</div>
            <div className="text-[10px] text-[var(--color-on-surface-muted)] mt-0.5">{k.sub}</div>
          </div>
        ) : <div key={i} className="card-lifted h-[104px] shimmer" />)}
      </div>

      {/* ── Map + relocation plan ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2">
          <FleetPlanMap plan={plan} selected={selected} onSelect={setSelected} />
        </div>
        <div className="card-lifted p-5 flex flex-col max-h-[440px]">
          <SectionTitle title="Relocation Plan"
            sub={plan ? `Drives capped at ${plan.max_reposition_km} km (~${Math.min(horizon, 4)} h)` : "Computing…"}
            right={<Ambulance className="h-4 w-4 text-[var(--color-primary)]" />} />
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 -mr-1">
            {!plan && Array.from({ length: 4 }, (_, i) => <div key={i} className="h-14 rounded-lg shimmer" />)}
            {plan && plan.moves.length === 0 && (
              <div className="flex flex-col items-center justify-center text-center py-8 text-[11px] text-[var(--color-on-surface-muted)]">
                <CheckCircle2 className="h-7 w-7 text-[var(--color-success)] mb-2" />
                No reachable relocation improves coverage right now.
              </div>
            )}
            {plan?.moves.map((m, i) => (
              <button key={i} onClick={() => setSelected(m.to)}
                className="w-full text-left rounded-lg bg-[var(--color-surface-container-low)] px-3 py-2.5 hover:bg-[var(--color-surface-container-high)] transition-colors">
                <div className="flex items-center gap-2 text-[12px] font-semibold text-[var(--color-on-surface)]">
                  <span className="truncate">{m.from}</span>
                  <ArrowRight className="h-3 w-3 shrink-0 text-[var(--color-primary)]" />
                  <span className="truncate">{m.to}</span>
                  <span className="ml-auto shrink-0 rounded bg-[var(--color-primary)]/10 px-1.5 py-0.5 text-[10px] font-bold text-[var(--color-primary)]">×{m.units}</span>
                </div>
                <div className="text-[10px] text-[var(--color-on-surface-muted)] mt-0.5 font-mono">
                  {m.unit_ids.join(", ")} · {m.distance_km} km · ~{m.drive_min} min
                </div>
              </button>
            ))}
            {plan && plan.unmet_cities.length > 0 && (
              <div className="rounded-lg border border-[var(--color-warning)]/25 bg-[var(--color-warning)]/5 px-3 py-2.5 text-[10px] text-[var(--color-on-surface)]">
                <div className="flex items-center gap-1.5 font-bold text-[var(--color-warning)] mb-1">
                  <AlertTriangle className="h-3 w-3" /> Out of reach — needs a new base
                </div>
                {plan.unmet_cities.slice(0, 8).join(", ")}{plan.unmet_cities.length > 8 ? ` +${plan.unmet_cities.length - 8} more` : ""}
              </div>
            )}
          </div>
          <button onClick={apply} disabled={!plan || plan.units_to_move === 0 || applying}
            className="btn-primary mt-4 flex items-center justify-center gap-2 py-2.5 text-[12px] disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none">
            {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Route className="h-3.5 w-3.5" />}
            {plan?.units_to_move ? `Dispatch ${plan.units_to_move} relocation${plan.units_to_move > 1 ? "s" : ""}` : "Fleet balanced"}
          </button>
        </div>
      </div>

      {/* ── Forecast charts ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="card-lifted p-5">
          <SectionTitle title="Next 24 Hours · All Cities" sub="Expected accidents per hour (IST), 53 million-plus cities" />
          <div className="h-[220px]">
            {national.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={national} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="natFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#00677f" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#00677f" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="hour" tick={{ fontSize: 9, fill: "#64748b" }} interval={3} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: "#64748b" }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => [Number(v).toFixed(1), "Expected accidents"]} />
                  <Area type="monotone" dataKey="expected_accidents" stroke="#00677f" strokeWidth={2} fill="url(#natFill)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : <div className="h-full shimmer rounded-lg" />}
          </div>
        </div>

        <div className="card-lifted p-5">
          <SectionTitle title={selected ? `${selected} · Hourly Forecast` : "City Forecast"}
            sub={forecast ? `Peak ${forecast.peak_hour} · ${forecast.total_expected_accidents.toFixed(1)} accidents in 24h · ${forecast.slot_source}` : "Select a city on the map"}
            right={forecast?.weather_now ? (() => {
              const W = WX_ICON[forecast.weather_now.weather_class] ?? CloudSun;
              return (
                <span className="flex items-center gap-1.5 rounded-md bg-[var(--color-surface-container-low)] px-2 py-1 text-[10px] font-semibold text-[var(--color-on-surface)]">
                  <W className="h-3.5 w-3.5 text-[var(--color-primary)]" />
                  {forecast.weather_now.temperature_c != null ? `${Math.round(forecast.weather_now.temperature_c)}°C` : "—"} · {forecast.weather_now.description}
                </span>
              );
            })() : null} />
          <div className="h-[220px]">
            {forecast ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={forecast.hours} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="hour" tick={{ fontSize: 9, fill: "#64748b" }} interval={3} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: "#64748b" }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={tooltipStyle}
                    formatter={(v, n) => [Number(v).toFixed(3), n === "expected_accidents" ? "Accidents" : "Deaths"]} />
                  <Bar dataKey="expected_accidents" radius={[3, 3, 0, 0]}>
                    {forecast.hours.map((h, i) => <Cell key={i} fill={h.weather_class ? "#d97706" : "#0891b2"} fillOpacity={0.85} />)}
                  </Bar>
                  <Line type="monotone" dataKey="expected_deaths" stroke="#dc2626" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : <div className="h-full shimmer rounded-lg" />}
          </div>
          <div className="flex gap-4 mt-2 text-[9px] text-[var(--color-on-surface-muted)]">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[#0891b2]" />Accidents</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[#d97706]" />Adverse weather hour</span>
            <span className="flex items-center gap-1"><span className="h-0.5 w-3 bg-[#dc2626]" />Expected deaths</span>
          </div>
        </div>

        <div className="card-lifted p-5">
          <SectionTitle title="Seasonality · 2023" sub="Share of the year's accidents by month: NCRB 2023 counts vs the shrunk model" />
          <div className="h-[220px]">
            {seasonality.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={seasonality} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 9, fill: "#64748b" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: "#64748b" }} tickLine={false} axisLine={false} unit="%" domain={[0, "auto"]} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => [`${v}%`, n === "observed" ? "Observed 2023" : "Model"]} />
                  <Bar dataKey="observed" radius={[3, 3, 0, 0]}>
                    {seasonality.map((s, i) => <Cell key={i} fill={s.current ? "#00677f" : "#cbd5e1"} />)}
                  </Bar>
                  <Line type="monotone" dataKey="model" stroke="#00677f" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : <div className="h-full shimmer rounded-lg" />}
          </div>
          <div className="flex gap-4 mt-2 text-[9px] text-[var(--color-on-surface-muted)]">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[#cbd5e1]" />Observed (raw)</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[#00677f]" />This month</span>
            <span className="flex items-center gap-1"><span className="h-0.5 w-3 bg-[#00677f]" />Model profile</span>
          </div>
        </div>
      </div>

      {/* ── City allocation table + selected city ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="card-lifted xl:col-span-2 overflow-hidden flex flex-col">
          <div className="px-5 pt-5">
            <SectionTitle title="City Allocation" sub={`Fair share of ${plan?.fleet.deployable ?? "—"} standby units by expected accidents over ${horizon}h`} />
          </div>
          <div className="relative flex-1 min-h-[380px]">
          <div className="absolute inset-0 overflow-auto">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-[var(--color-surface-container-low)] z-10">
                <tr className="text-left">
                  {["City", "Expected acc.", "Share", "Units now", "Target", "Gap", "Acc. / unit"].map((h) => (
                    <th key={h} className="px-4 py-2.5 font-[var(--font-display)] text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--color-on-surface-muted)] whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {plan?.cities.map((c) => (
                  <tr key={c.city} onClick={() => setSelected(c.city)}
                    className={`cursor-pointer transition-colors border-t border-[var(--color-outline-variant)]/30 ${c.city === selected ? "bg-[var(--color-primary)]/5" : "hover:bg-[var(--color-surface-container-low)]"}`}>
                    <td className="px-4 py-2">
                      <div className="font-semibold text-[var(--color-on-surface)]">{c.city}</div>
                      <div className="text-[9px] text-[var(--color-on-surface-muted)]">{c.state}</div>
                    </td>
                    <td className="px-4 py-2 tabular-nums font-semibold">{c.expected_accidents.toFixed(2)}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-14 rounded-full bg-[var(--color-surface-container-high)] overflow-hidden">
                          <div className="h-full rounded-full bg-[var(--color-primary)]" style={{ width: `${Math.min(100, (c.demand_share / (plan.cities[0]?.demand_share || 1)) * 100)}%` }} />
                        </div>
                        <span className="tabular-nums text-[var(--color-on-surface-muted)]">{(c.demand_share * 100).toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-2 tabular-nums">{c.current_units}</td>
                    <td className="px-4 py-2 tabular-nums">{c.target_units}</td>
                    <td className="px-4 py-2">
                      {c.delta === 0 ? <span className="text-[var(--color-success)] font-bold">✓</span> : (
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${c.delta > 0 ? (c.unmet ? "bg-[var(--color-warning)]/10 text-[var(--color-warning)]" : "bg-[var(--color-error)]/10 text-[var(--color-error)]") : "bg-[var(--color-info)]/10 text-[var(--color-info)]"}`}>
                          {c.delta > 0 ? `+${c.delta}` : c.delta}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 tabular-nums text-[var(--color-on-surface-muted)]">{c.accidents_per_unit ?? "—"}</td>
                  </tr>
                ))}
                {!plan && Array.from({ length: 6 }, (_, i) => (
                  <tr key={i}><td colSpan={7} className="px-4 py-2"><div className="h-6 rounded shimmer" /></td></tr>
                ))}
              </tbody>
            </table>
          </div>
          </div>
        </div>

        {/* Model card */}
        <div className="card-lifted p-5 space-y-4">
          <SectionTitle title="How the forecast works" sub={card ? `${card.model_version} · ${card.cities_covered} cities · ${card.total_accidents_2023.toLocaleString()} accidents (2023)` : "Loading model card…"}
            right={<Sparkles className="h-4 w-4 text-[var(--color-primary)]" />} />
          {sel && (
            <div className="rounded-lg bg-[var(--color-surface-container-low)] p-3">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--color-on-surface)]">
                <MapPin className="h-3.5 w-3.5 text-[var(--color-primary)]" /> {sel.city}
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2 text-center">
                {[["Acc. " + horizon + "h", sel.expected_accidents.toFixed(1)], ["Deaths", sel.expected_deaths.toFixed(2)], ["Units", `${sel.current_units}→${sel.after_units}`]].map(([l, v]) => (
                  <div key={l}><div className="font-[var(--font-display)] text-[15px] font-bold tabular-nums">{v}</div><Label>{l}</Label></div>
                ))}
              </div>
            </div>
          )}
          <p className="text-[10px] leading-relaxed text-[var(--color-on-surface-muted)]">
            <b className="text-[var(--color-on-surface)]">Accidents per hour</b> = city&apos;s 2023 total ÷ 365 × its month profile × its time-of-day profile.
            Deaths add the city&apos;s MoRTH 2022 fatality rate and the MoRTH 2018 weather fatality ratio for the forecast weather.
          </p>
          {card && (["month", "slot"] as const).map((k) => {
            const m = card.shrinkage[k];
            return (
              <div key={k} className="rounded-lg border border-[var(--color-outline-variant)]/50 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold capitalize text-[var(--color-on-surface)]">{m.label}</span>
                  {m.deployed && <span className="rounded bg-[var(--color-success)]/10 px-1.5 py-0.5 text-[9px] font-bold text-[var(--color-success)]">DEPLOYED</span>}
                </div>
                <div className="mt-2.5 space-y-1.5">
                  {([["Raw city profile", m.perplexity_raw_profile], ["Prior only", m.perplexity_prior_only], ["Shrunk (deployed)", m.perplexity_shrunk_profile]] as [string, number | null][]).map(([n, v], i) => {
                    const vals = [m.perplexity_raw_profile, m.perplexity_prior_only ?? m.perplexity_raw_profile, m.perplexity_shrunk_profile];
                    const lo = Math.min(...vals), hi = Math.max(...vals);
                    const w = v == null ? 0 : 35 + 65 * ((v - lo) / ((hi - lo) || 1));
                    return (
                      <div key={n} className="flex items-center gap-2 text-[10px]">
                        <span className="w-[92px] shrink-0 text-[var(--color-on-surface-muted)]">{n}</span>
                        <div className="h-1.5 flex-1 rounded-full bg-[var(--color-surface-container-high)] overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${w}%`, background: i === 2 ? "#00677f" : "#cbd5e1" }} />
                        </div>
                        <span className={`w-10 text-right tabular-nums ${i === 2 ? "font-bold text-[var(--color-on-surface)]" : "text-[var(--color-on-surface-muted)]"}`}>{v?.toFixed(3) ?? "—"}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="text-[9px] text-[var(--color-on-surface-muted)] mt-1">
                  Held-out perplexity per accident (lower is better) · pseudo-count k = {m.best_k} · {m.validation}
                </div>
              </div>
            );
          })}
          {card && (
            <div className="flex flex-wrap gap-1.5">
              {card.sources.map((s) => (
                <span key={s} className="inline-flex items-center gap-1 rounded bg-[var(--color-surface-container-low)] px-2 py-1 text-[9px] font-medium text-[var(--color-on-surface-muted)]">
                  <Database className="h-2.5 w-2.5" /> {s}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
