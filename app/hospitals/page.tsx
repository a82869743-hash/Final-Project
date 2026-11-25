"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  BedDouble, HeartPulse, Wind, Activity, Siren, Droplet, Stethoscope, Ambulance,
  AlertTriangle, Search, Clock, ShieldAlert, Building2, Navigation, Loader2, RefreshCw,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell,
} from "recharts";
import {
  api, type Hospital, type HospitalAlert, type HospitalSummary, type HospitalRecommendation,
  type CapacityStatus,
} from "@/lib/api";

const HospitalMap = dynamic(() => import("@/components/map/HospitalMap"), {
  ssr: false,
  loading: () => <div className="card-lifted h-[380px] flex items-center justify-center text-[11px] text-[var(--color-on-surface-muted)]">Loading map…</div>,
});

const STATUS: Record<CapacityStatus, { color: string; label: string }> = {
  normal: { color: "#16a34a", label: "Normal" },
  moderate: { color: "#0284c7", label: "Moderate" },
  high: { color: "#d97706", label: "High" },
  critical: { color: "#dc2626", label: "Critical" },
};

const WARD_ICON: Record<string, typeof BedDouble> = {
  icu: HeartPulse, ventilator: Wind, hdu: Activity, emergency: Siren, general: BedDouble,
  pediatric: Stethoscope, maternity: Stethoscope, isolation: ShieldAlert, burns: AlertTriangle,
};

const tooltipStyle = {
  backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "8px",
  boxShadow: "0 8px 24px rgba(0,0,0,0.08)", fontSize: "11px", color: "#1e293b",
};

const REFRESH_MS = 5000;

function Bar100({ pct, status }: { pct: number; status: CapacityStatus }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-[var(--color-surface-container-high)] overflow-hidden">
      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, pct)}%`, background: STATUS[status].color }} />
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="font-[var(--font-display)] text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--color-on-surface-muted)]">{children}</span>;
}

export default function HospitalsPage() {
  const [summary, setSummary] = useState<HospitalSummary | null>(null);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [alerts, setAlerts] = useState<HospitalAlert[]>([]);
  const [selected, setSelected] = useState<Hospital | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [city, setCity] = useState("All");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"occupancy" | "icu" | "wait">("occupancy");
  const [error, setError] = useState<string | null>(null);
  const [updated, setUpdated] = useState<Date | null>(null);
  const [recs, setRecs] = useState<HospitalRecommendation[] | null>(null);
  const [recNeed, setRecNeed] = useState("icu");
  const [recLoading, setRecLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, h, a] = await Promise.all([api.getHospitalSummary(), api.getHospitals(), api.getHospitalAlerts(20)]);
      setSummary(s); setHospitals(h.hospitals); setAlerts(a.alerts);
      setUpdated(new Date()); setError(null);
    } catch {
      setError("Backend unreachable — retrying…");
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = setInterval(load, REFRESH_MS);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [load]);

  // Detail with history for the selected hospital
  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    const fetchDetail = () => api.getHospital(selectedId).then((h) => active && setSelected(h)).catch(() => {});
    fetchDetail();
    const t = setInterval(fetchDetail, REFRESH_MS);
    return () => { active = false; clearInterval(t); };
  }, [selectedId]);

  const cities = useMemo(() => ["All", ...Array.from(new Set(hospitals.map((h) => h.city))).sort()], [hospitals]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const l = hospitals.filter((h) => (city === "All" || h.city === city) &&
      (!q || h.name.toLowerCase().includes(q) || h.city.toLowerCase().includes(q)));
    return [...l].sort((a, b) =>
      sort === "icu" ? a.wards.icu.available - b.wards.icu.available
        : sort === "wait" ? b.er_wait_min - a.er_wait_min
          : b.occupancy_pct - a.occupancy_pct);
  }, [hospitals, city, query, sort]);

  const findBest = async () => {
    const h = selected ?? list[0];
    if (!h) return;
    setRecLoading(true);
    try {
      const r = await api.recommendHospitals(h.lat, h.lng, recNeed, 5);
      setRecs(r.recommendations);
    } catch { setRecs([]); } finally { setRecLoading(false); }
  };

  const wardChart = summary
    ? Object.entries(summary.wards).map(([k, w]) => ({ key: k, name: w.label, pct: w.occupancy_pct, available: w.available, status: w.status }))
    : [];

  const kpis = summary ? [
    { label: "Total Beds", value: summary.total_beds.toLocaleString(), sub: `${summary.available_beds.toLocaleString()} free`, icon: BedDouble, color: "#0284c7" },
    { label: "Occupancy", value: `${summary.occupancy_pct}%`, sub: `${summary.total_hospitals} hospitals`, icon: Activity, color: summary.occupancy_pct > 85 ? "#dc2626" : "#d97706" },
    { label: "ICU Beds Free", value: summary.icu_available.toLocaleString(), sub: "critical care", icon: HeartPulse, color: "#dc2626" },
    { label: "Ventilators Free", value: summary.ventilators_available.toLocaleString(), sub: "invasive support", icon: Wind, color: "#7c3aed" },
    { label: "On Diversion", value: String(summary.hospitals_on_diversion), sub: "not taking trauma", icon: ShieldAlert, color: summary.hospitals_on_diversion ? "#dc2626" : "#16a34a" },
    { label: "Inbound Ambulances", value: String(summary.incoming_ambulances), sub: "en route to ER", icon: Ambulance, color: "#00677f" },
  ] : [];

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="font-[var(--font-display)] text-xl font-bold text-[var(--color-on-surface)] flex items-center gap-2">
            <Building2 className="h-5 w-5 text-[var(--color-primary)]" /> Live Hospital Monitoring
          </h1>
          <p className="text-[11px] text-[var(--color-on-surface-muted)]">
            Bed occupancy, critical-care capacity and ER load across {summary?.total_hospitals ?? "—"} major hospitals · refreshes every 5s
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2 text-[10px]">
          {error ? (
            <span className="px-2 py-1 rounded bg-[var(--color-error)]/10 text-[var(--color-error)] font-bold">{error}</span>
          ) : (
            <span className="flex items-center gap-1.5 px-2 py-1 rounded bg-[var(--color-success)]/10 text-[var(--color-success)] font-bold">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-success)] animate-pulse" /> LIVE
            </span>
          )}
          <span className="text-[var(--color-on-surface-muted)] flex items-center gap-1"><Clock className="h-3 w-3" />{updated ? updated.toLocaleTimeString() : "—"}</span>
          <button onClick={load} className="p-1.5 rounded hover:bg-[var(--color-surface-container-low)]" aria-label="Refresh"><RefreshCw className="h-3.5 w-3.5 text-[var(--color-on-surface-muted)]" /></button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {!kpis.length && Array.from({ length: 6 }, (_, i) => <div key={i} className="card-lifted h-[72px] shimmer" />)}
        {kpis.map((k) => (
          <div key={k.label} className="card-lifted p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg shrink-0" style={{ background: `${k.color}12` }}>
              <k.icon className="h-5 w-5" style={{ color: k.color }} />
            </div>
            <div className="min-w-0">
              <p className="font-[var(--font-display)] text-lg font-bold text-[var(--color-on-surface)] leading-tight">{k.value}</p>
              <Label>{k.label}</Label>
              <p className="text-[9px] text-[var(--color-on-surface-muted)]">{k.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Ward occupancy + trend */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="card-lifted p-5 xl:col-span-2">
          <h3 className="font-[var(--font-display)] text-[13px] font-bold text-[var(--color-on-surface)] mb-4">Network Bed Occupancy by Ward</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {wardChart.map((w) => {
              const Icon = WARD_ICON[w.key] ?? BedDouble;
              const cfg = STATUS[w.status as CapacityStatus];
              const full = summary!.wards[w.key];
              return (
                <div key={w.key} className="rounded-lg p-3 bg-[var(--color-surface-container-low)]">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className="h-4 w-4" style={{ color: cfg.color }} />
                    <span className="text-[11px] font-bold text-[var(--color-on-surface)]">{w.name}</span>
                    <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ color: cfg.color, background: `${cfg.color}14` }}>{cfg.label}</span>
                  </div>
                  <div className="flex items-baseline gap-1 mb-1.5">
                    <span className="font-[var(--font-display)] text-xl font-bold" style={{ color: cfg.color }}>{w.pct}%</span>
                    <span className="text-[10px] text-[var(--color-on-surface-muted)]">{full.occupied.toLocaleString()} / {full.capacity.toLocaleString()}</span>
                  </div>
                  <Bar100 pct={w.pct} status={w.status as CapacityStatus} />
                  <p className="text-[10px] mt-1.5 text-[var(--color-on-surface-muted)]"><b className="text-[var(--color-on-surface)]">{w.available.toLocaleString()}</b> beds available</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card-lifted p-5 flex flex-col">
          <h3 className="font-[var(--font-display)] text-[13px] font-bold text-[var(--color-on-surface)] mb-1">Network Occupancy Trend</h3>
          <p className="text-[10px] text-[var(--color-on-surface-muted)] mb-3">Rolling live window</p>
          <div className="flex-1 min-h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={summary?.trend ?? []}>
                <defs>
                  <linearGradient id="occ" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00677f" stopOpacity={0.25} /><stop offset="100%" stopColor="#00677f" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="t" tick={{ fontSize: 9, fill: "#64748b" }} stroke="#e2e8f0" minTickGap={30} />
                <YAxis domain={["dataMin - 1", "dataMax + 1"]} tick={{ fontSize: 9, fill: "#64748b" }} unit="%" stroke="#e2e8f0" width={40} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="occupancy" stroke="#00677f" strokeWidth={2} fill="url(#occ)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <h4 className="font-[var(--font-display)] text-[11px] font-bold text-[var(--color-on-surface)] mt-4 mb-2">City Load</h4>
          <div className="h-[150px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={(summary?.cities ?? []).slice(0, 8)} layout="vertical" margin={{ left: 10 }}>
                <XAxis type="number" domain={[0, 100]} hide />
                <YAxis type="category" dataKey="city" tick={{ fontSize: 9, fill: "#64748b" }} width={70} stroke="#e2e8f0" />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v}%`, "Occupancy"]} />
                <Bar dataKey="occupancy_pct" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                  {(summary?.cities ?? []).slice(0, 8).map((c) => (
                    <Cell key={c.city} fill={c.occupancy_pct >= 85 ? "#dc2626" : c.occupancy_pct >= 75 ? "#d97706" : "#0284c7"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Map + alerts */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <HospitalMap hospitals={list} selectedId={selectedId} onSelect={(id) => setSelectedId(id)} recommendations={recs ?? []} height="380px" />
        </div>
        <div className="card-lifted p-5 flex flex-col max-h-[380px]">
          <h3 className="font-[var(--font-display)] text-[13px] font-bold text-[var(--color-on-surface)] mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-[var(--color-error)]" /> Capacity Alerts
            <span className="ml-auto text-[9px] font-bold px-2 py-0.5 rounded bg-[var(--color-error)]/10 text-[var(--color-error)]">{alerts.length}</span>
          </h3>
          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {alerts.length === 0 && <p className="text-[11px] text-[var(--color-on-surface-muted)]">No capacity alerts — all hospitals within limits.</p>}
            {alerts.map((a, i) => {
              const c = a.severity === "critical" ? "#dc2626" : "#d97706";
              return (
                <div key={i} className="px-3 py-2 rounded-lg border-l-[3px]" style={{ background: `${c}08`, borderLeftColor: c }}>
                  <p className="text-[11px] font-semibold text-[var(--color-on-surface)]">{a.message}</p>
                  <p className="text-[10px] text-[var(--color-on-surface-muted)]">{a.hospital} · {a.city}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Hospital table + detail */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="card-lifted p-5 xl:col-span-2">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <h3 className="font-[var(--font-display)] text-[13px] font-bold text-[var(--color-on-surface)] mr-auto">Hospitals</h3>
            <div className="flex items-center gap-1.5 bg-[var(--color-surface-container-low)] rounded-md px-2 py-1.5">
              <Search className="h-3.5 w-3.5 text-[var(--color-on-surface-muted)]" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search hospital or city"
                className="bg-transparent text-[11px] outline-none w-40" />
            </div>
            <select value={city} onChange={(e) => setCity(e.target.value)} className="text-[11px] bg-[var(--color-surface-container-low)] rounded-md px-2 py-1.5 outline-none">
              {cities.map((c) => <option key={c}>{c}</option>)}
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="text-[11px] bg-[var(--color-surface-container-low)] rounded-md px-2 py-1.5 outline-none">
              <option value="occupancy">Sort: occupancy</option>
              <option value="icu">Sort: fewest ICU beds</option>
              <option value="wait">Sort: longest ER wait</option>
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-left">
                  {["Hospital", "Occupancy", "ICU free", "Vent free", "ER wait", "O₂", "Status"].map((h) => (
                    <th key={h} className="pb-2 pr-3"><Label>{h}</Label></th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map((h) => {
                  const cfg = STATUS[h.status];
                  const active = h.id === selectedId;
                  return (
                    <tr key={h.id} onClick={() => setSelectedId(h.id)}
                      className={`cursor-pointer transition-colors ${active ? "bg-[var(--color-primary)]/8" : "hover:bg-[var(--color-surface-container-low)]"}`}>
                      <td className="py-2 pr-3">
                        <p className="font-semibold text-[var(--color-on-surface)]">{h.name}</p>
                        <p className="text-[10px] text-[var(--color-on-surface-muted)]">{h.city} · {h.type} · {h.total_beds.toLocaleString()} beds</p>
                      </td>
                      <td className="py-2 pr-3 w-28">
                        <span className="font-bold" style={{ color: cfg.color }}>{h.occupancy_pct}%</span>
                        <Bar100 pct={h.occupancy_pct} status={h.status} />
                      </td>
                      <td className="py-2 pr-3 font-bold" style={{ color: h.wards.icu.available <= 2 ? "#dc2626" : undefined }}>{h.wards.icu.available}</td>
                      <td className="py-2 pr-3 font-bold">{h.wards.ventilator.available}</td>
                      <td className="py-2 pr-3">{h.er_wait_min} min</td>
                      <td className="py-2 pr-3" style={{ color: h.oxygen_pct < 30 ? "#dc2626" : undefined }}>{h.oxygen_pct}%</td>
                      <td className="py-2 pr-3">
                        {h.accepting_critical
                          ? <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ color: cfg.color, background: `${cfg.color}14` }}>{cfg.label}</span>
                          : <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[var(--color-error)]/10 text-[var(--color-error)]">DIVERSION</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Detail */}
        <div className="card-lifted p-5 space-y-4">
          {!selected ? (
            <div className="h-full flex flex-col items-center justify-center text-center gap-2 py-10">
              <Building2 className="h-8 w-8 text-[var(--color-outline-variant)]" />
              <p className="text-[11px] text-[var(--color-on-surface-muted)]">Select a hospital to see live ward-level detail</p>
            </div>
          ) : (
            <>
              <div>
                <h3 className="font-[var(--font-display)] text-[14px] font-bold text-[var(--color-on-surface)]">{selected.name}</h3>
                <p className="text-[10px] text-[var(--color-on-surface-muted)]">{selected.city}, {selected.state} · {selected.type} · Trauma level {selected.trauma_level}</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { l: "Doctors", v: selected.doctors_on_duty, i: Stethoscope },
                  { l: "Blood units", v: selected.blood_units, i: Droplet },
                  { l: "Oxygen", v: `${selected.oxygen_pct}%`, i: Wind },
                  { l: "Admits/hr", v: selected.admissions_hr, i: Activity },
                  { l: "Discharges/hr", v: selected.discharges_hr, i: Activity },
                  { l: "Inbound", v: selected.incoming_ambulances, i: Ambulance },
                ].map((s) => (
                  <div key={s.l} className="rounded-lg p-2 bg-[var(--color-surface-container-low)]">
                    <s.i className="h-3.5 w-3.5 text-[var(--color-primary)] mb-1" />
                    <p className="font-[var(--font-display)] text-[13px] font-bold">{s.v}</p>
                    <Label>{s.l}</Label>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                {Object.entries(selected.wards).map(([k, w]) => (
                  <div key={k}>
                    <div className="flex justify-between text-[10px] mb-0.5">
                      <span className="font-semibold text-[var(--color-on-surface)]">{w.label}{w.critical_care && <span className="text-[var(--color-error)]"> •</span>}</span>
                      <span className="text-[var(--color-on-surface-muted)]">{w.available} free / {w.capacity}</span>
                    </div>
                    <Bar100 pct={w.occupancy_pct} status={w.status} />
                  </div>
                ))}
              </div>
              {selected.history && selected.history.length > 1 && (
                <div className="h-[110px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={selected.history}>
                      <XAxis dataKey="t" hide />
                      <YAxis domain={["dataMin - 2", "dataMax + 2"]} hide />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Area dataKey="icu" name="ICU %" stroke="#dc2626" fill="#dc262615" strokeWidth={1.5} isAnimationActive={false} />
                      <Area dataKey="occupancy" name="Overall %" stroke="#00677f" fill="#00677f10" strokeWidth={1.5} isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          )}

          {/* Smart routing */}
          <div className="pt-3 border-t border-[var(--color-outline-variant)]/40">
            <h4 className="font-[var(--font-display)] text-[12px] font-bold text-[var(--color-on-surface)] flex items-center gap-1.5 mb-2">
              <Navigation className="h-3.5 w-3.5 text-[var(--color-primary)]" /> Best Hospital for Patient
            </h4>
            <p className="text-[10px] text-[var(--color-on-surface-muted)] mb-2">
              Ranks nearby hospitals by ETA, free beds in the needed ward, ER wait and diversion status{selected ? ` (from ${selected.name})` : ""}.
            </p>
            <div className="flex gap-2">
              <select value={recNeed} onChange={(e) => setRecNeed(e.target.value)} className="text-[11px] flex-1 bg-[var(--color-surface-container-low)] rounded-md px-2 py-1.5 outline-none">
                <option value="icu">ICU</option><option value="ventilator">Ventilator</option><option value="emergency">Trauma / ER</option>
                <option value="burns">Burns</option><option value="pediatric">Pediatric</option><option value="maternity">Maternity</option>
              </select>
              <button onClick={findBest} disabled={recLoading || !list.length} className="btn-primary text-[11px] px-3 py-1.5 rounded-md flex items-center gap-1.5 disabled:opacity-50">
                {recLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Navigation className="h-3.5 w-3.5" />} Find
              </button>
            </div>
            {recs && (
              <ol className="mt-3 space-y-1.5">
                {recs.length === 0 && <li className="text-[10px] text-[var(--color-on-surface-muted)]">No hospital within 150 km.</li>}
                {recs.map((r, i) => (
                  <li key={r.id} className="flex items-center gap-2 text-[11px] rounded-md px-2 py-1.5 bg-[var(--color-surface-container-low)]">
                    <span className="font-[var(--font-display)] font-bold text-[var(--color-primary)] w-4">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold truncate">{r.name}</p>
                      <p className="text-[10px] text-[var(--color-on-surface-muted)]">{r.distance_km} km · ~{r.eta_min} min · {r.ward_available} free · ER {r.er_wait_min} min</p>
                    </div>
                    {!r.accepting_critical && <span className="text-[8px] font-bold text-[var(--color-error)]">DIVERSION</span>}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </div>

      <p className="text-[10px] text-[var(--color-on-surface-muted)]">
        Hospitals, locations and bed totals are real (approximate public figures). Live occupancy is a time-driven telemetry
        simulation, since no national real-time bed API is public; it can be replaced with a state HMIS feed in
        <code className="mx-1">backend/services/hospital_registry.py</code>.
      </p>
    </div>
  );
}
