"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BrainCircuit, MapPin, CloudFog, Clock, Gauge, Users, Car, Footprints, ArrowUpRight, ArrowDownRight,
  Minus, Loader2, Database, ShieldCheck, Info,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell,
} from "recharts";
import { api, API_BASE, type AccidentRiskResponse, type RiskZone } from "@/lib/api";

const tooltipStyle = {
  backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "8px",
  boxShadow: "0 8px 24px rgba(0,0,0,0.08)", fontSize: "11px", color: "#1e293b",
};
const LEVEL_COLOR: Record<string, string> = { High: "#dc2626", Medium: "#d97706", Low: "#16a34a" };
const WEATHER = ["Clear", "Rain", "Fog / mist", "Storm / hail"];

interface Profile { city: string; slots: string[]; slot_share: (number | null)[]; national: number[]; accidents_2022: number | null; deaths_2022: number | null }
interface ModelCard {
  model_version: string;
  cities_covered: number;
  severity_model: {
    dataset: string; rows: number; roc_auc: number; base_rate_ksi: number; brier_calibrated: number;
    brier_baseline: number; top_decile_ksi_rate: number; top_decile_lift: number;
    feature_importance: Record<string, number>;
  };
  frequency_model: { dataset: string; validation: string; mae_unseen_city: number; mae_baseline_national_profile: number; decision: string };
  india_weather_factors_2018: Record<string, { accidents: number; killed: number; deaths_per_100: number; severity_multiplier: number }>;
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="font-[var(--font-display)] text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--color-on-surface-muted)]">{children}</span>;
}

const pretty = (k: string) => k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export default function RiskPage() {
  const [zones, setZones] = useState<RiskZone[]>([]);
  const [city, setCity] = useState("Delhi");
  const [hour, setHour] = useState(21);
  const [weather, setWeather] = useState(0);
  const [highway, setHighway] = useState(false);
  const [speed, setSpeed] = useState(50);
  const [vehicles, setVehicles] = useState(2);
  const [casualties, setCasualties] = useState(1);
  const [pedestrian, setPedestrian] = useState(false);
  const [result, setResult] = useState<AccidentRiskResponse | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [card, setCard] = useState<ModelCard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getRiskZones().then((r) => setZones(r.zones)).catch(() => setError("Backend unreachable"));
    api.getRiskModel().then((m) => setCard(m as unknown as ModelCard)).catch(() => {});
  }, []);

  const zone = zones.find((z) => z.area === city);

  // Re-assess whenever inputs change (debounced)
  useEffect(() => {
    if (!zone) return;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await api.predictRisk({
          latitude: zone.lat, longitude: zone.lng, time: `${String(hour).padStart(2, "0")}:00`,
          weather, highway, speed_kmh: speed, vehicles, casualties, pedestrian,
        });
        setResult(r); setError(null);
      } catch { setError("Prediction failed — is the backend running?"); }
      finally { setLoading(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [zone, hour, weather, highway, speed, vehicles, casualties, pedestrian]);

  useEffect(() => {
    if (!city) return;
    fetch(`${API_BASE}/risk-profile/${encodeURIComponent(city)}`)
      .then((r) => (r.ok ? r.json() : null)).then(setProfile).catch(() => setProfile(null));
  }, [city]);

  const profileData = useMemo(() => profile ? profile.slots.map((s, i) => ({
    slot: s, city: profile.slot_share[i] != null ? +(profile.slot_share[i]! * 100).toFixed(1) : null,
    national: +(profile.national[i] * 100).toFixed(1), active: Math.floor(hour / 3) === i,
  })) : [], [profile, hour]);

  const importance = useMemo(() => card ? Object.entries(card.severity_model.feature_importance)
    .sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => ({ name: pretty(k), value: +(v * 100).toFixed(1) })) : [], [card]);

  const color = result ? LEVEL_COLOR[result.risk_level] : "#64748b";
  const cityOptions = useMemo(() => [...zones].sort((a, b) => (a.area ?? "").localeCompare(b.area ?? "")), [zones]);

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="font-[var(--font-display)] text-xl font-bold text-[var(--color-on-surface)] flex items-center gap-2">
          <BrainCircuit className="h-5 w-5 text-[var(--color-primary)]" /> Accident Risk Intelligence
        </h1>
        <p className="text-[11px] text-[var(--color-on-surface-muted)]">
          Real-data risk engine: MoRTH / NCRB Indian accident statistics + an XGBoost severity model trained on 104k real collisions. Every factor is explained.
        </p>
      </div>
      {error && <div className="card-lifted p-3 text-[11px] text-[var(--color-error)]">{error}</div>}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Inputs */}
        <div className="card-lifted p-5 space-y-4">
          <h3 className="font-[var(--font-display)] text-[13px] font-bold">Scenario</h3>
          <div>
            <Label><MapPin className="inline h-3 w-3 mr-1" />City (53 MoRTH million-plus cities)</Label>
            <select value={city} onChange={(e) => setCity(e.target.value)} className="mt-1 w-full text-[12px] bg-[var(--color-surface-container-low)] rounded-md px-2 py-2 outline-none">
              {cityOptions.map((z) => <option key={z.area} value={z.area}>{z.area} · {z.state}</option>)}
            </select>
          </div>
          <div>
            <div className="flex justify-between"><Label><Clock className="inline h-3 w-3 mr-1" />Hour</Label><span className="text-[11px] font-bold">{String(hour).padStart(2, "0")}:00</span></div>
            <input type="range" min={0} max={23} value={hour} onChange={(e) => setHour(+e.target.value)} className="w-full accent-[var(--color-primary)]" />
          </div>
          <div>
            <Label><CloudFog className="inline h-3 w-3 mr-1" />Weather</Label>
            <div className="mt-1 grid grid-cols-2 gap-1">
              {WEATHER.map((w, i) => (
                <button key={w} onClick={() => setWeather(i)} className={`text-[11px] py-1.5 rounded-md font-semibold ${weather === i ? "bg-[var(--color-primary)] text-white" : "bg-[var(--color-surface-container-low)] text-[var(--color-on-surface-muted)]"}`}>{w}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1">
            {[["City road", false], ["Highway", true]].map(([l, v]) => (
              <button key={String(l)} onClick={() => { setHighway(v as boolean); setSpeed(v ? 90 : 50); }} className={`text-[11px] py-1.5 rounded-md font-semibold ${highway === v ? "bg-[var(--color-primary)] text-white" : "bg-[var(--color-surface-container-low)] text-[var(--color-on-surface-muted)]"}`}>{String(l)}</button>
            ))}
          </div>
          <div>
            <div className="flex justify-between"><Label><Gauge className="inline h-3 w-3 mr-1" />Speed limit</Label><span className="text-[11px] font-bold">{speed} km/h</span></div>
            <input type="range" min={20} max={120} step={10} value={speed} onChange={(e) => setSpeed(+e.target.value)} className="w-full accent-[var(--color-primary)]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label><Car className="inline h-3 w-3 mr-1" />Vehicles</Label>
              <input type="number" min={1} max={10} value={vehicles} onChange={(e) => setVehicles(Math.max(1, +e.target.value))} className="mt-1 w-full text-[12px] bg-[var(--color-surface-container-low)] rounded-md px-2 py-1.5 outline-none" />
            </div>
            <div>
              <Label><Users className="inline h-3 w-3 mr-1" />Casualties</Label>
              <input type="number" min={1} max={20} value={casualties} onChange={(e) => setCasualties(Math.max(1, +e.target.value))} className="mt-1 w-full text-[12px] bg-[var(--color-surface-container-low)] rounded-md px-2 py-1.5 outline-none" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-[11px] cursor-pointer">
            <input type="checkbox" checked={pedestrian} onChange={(e) => setPedestrian(e.target.checked)} className="accent-[var(--color-primary)]" />
            <Footprints className="h-3.5 w-3.5" /> At a pedestrian crossing
          </label>
        </div>

        {/* Result + factors */}
        <div className="card-lifted p-5 xl:col-span-2 space-y-4">
          <div className="flex flex-wrap items-center gap-6">
            <div>
              <Label>Risk level</Label>
              <div className="flex items-center gap-2">
                <span className="font-[var(--font-display)] text-3xl font-bold" style={{ color }}>{result?.risk_level ?? "—"}</span>
                {loading && <Loader2 className="h-4 w-4 animate-spin text-[var(--color-on-surface-muted)]" />}
              </div>
            </div>
            <div><Label>Percentile</Label><p className="font-[var(--font-display)] text-2xl font-bold">{result ? `${result.percentile.toFixed(0)}` : "—"}<span className="text-[12px]">th</span></p></div>
            <div><Label>P(fatal / serious)</Label><p className="font-[var(--font-display)] text-2xl font-bold">{result ? `${(result.p_fatal_or_serious * 100).toFixed(1)}%` : "—"}</p></div>
            <div><Label>Expected deaths / hr</Label><p className="font-[var(--font-display)] text-2xl font-bold">{result ? result.expected_deaths_per_hour.toFixed(3) : "—"}</p></div>
          </div>
          <div className="h-2 rounded-full bg-[var(--color-surface-container-high)] overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${(result?.risk_score ?? 0) * 100}%`, background: color }} />
          </div>
          <p className="text-[10px] text-[var(--color-on-surface-muted)]">
            Percentile vs. all 424 real Indian city × 3-hour slots. High = top 15%, Medium = top 50%.
          </p>

          <div>
            <h4 className="font-[var(--font-display)] text-[12px] font-bold mb-2">Why this score — factor breakdown</h4>
            <div className="space-y-2">
              {(result?.factors ?? []).map((f) => {
                const Icon = f.impact === "up" ? ArrowUpRight : f.impact === "down" ? ArrowDownRight : Minus;
                const c = f.impact === "up" ? "#dc2626" : f.impact === "down" ? "#16a34a" : "#64748b";
                return (
                  <div key={f.factor} className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-[var(--color-surface-container-low)]">
                    <Icon className="h-4 w-4 mt-0.5 shrink-0" style={{ color: c }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="text-[11px] font-bold">{f.factor}</span>
                        <span className="text-[11px] font-semibold" style={{ color: c }}>{f.value}</span>
                      </div>
                      <p className="text-[10px] text-[var(--color-on-surface-muted)]">{f.detail}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="card-lifted p-5">
          <h3 className="font-[var(--font-display)] text-[13px] font-bold mb-1">When do accidents happen in {city}?</h3>
          <p className="text-[10px] text-[var(--color-on-surface-muted)] mb-3">Share of accidents by 3-hour slot. City: MoRTH 2020 · National: MoRTH 2018</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={profileData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="slot" tick={{ fontSize: 10, fill: "#64748b" }} stroke="#e2e8f0" />
              <YAxis unit="%" tick={{ fontSize: 10, fill: "#64748b" }} stroke="#e2e8f0" width={36} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="city" name={city} radius={[4, 4, 0, 0]}>
                {profileData.map((d) => <Cell key={d.slot} fill={d.active ? "#dc2626" : "#00677f"} />)}
              </Bar>
              <Bar dataKey="national" name="India" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card-lifted p-5">
          <h3 className="font-[var(--font-display)] text-[13px] font-bold mb-1">What drives crash severity?</h3>
          <p className="text-[10px] text-[var(--color-on-surface-muted)] mb-3">XGBoost feature importance (gain share), severity model</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={importance} layout="vertical" margin={{ left: 30 }}>
              <XAxis type="number" unit="%" tick={{ fontSize: 10, fill: "#64748b" }} stroke="#e2e8f0" />
              <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10, fill: "#64748b" }} stroke="#e2e8f0" />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="value" fill="#00677f" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Model card */}
      {card && (
        <div className="card-lifted p-5">
          <h3 className="font-[var(--font-display)] text-[13px] font-bold mb-4 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[var(--color-success)]" /> Model Card · {card.model_version}
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {[
              ["Training records", card.severity_model.rows.toLocaleString()],
              ["ROC-AUC (held-out)", card.severity_model.roc_auc.toFixed(3)],
              ["Top-10% lift", `${card.severity_model.top_decile_lift}×`],
              ["Brier vs baseline", `${card.severity_model.brier_calibrated} / ${card.severity_model.brier_baseline}`],
            ].map(([l, v]) => (
              <div key={l} className="rounded-lg p-3 bg-[var(--color-surface-container-low)]">
                <p className="font-[var(--font-display)] text-lg font-bold">{v}</p><Label>{l}</Label>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[11px] text-[var(--color-on-surface-muted)] leading-relaxed">
            <div className="space-y-2">
              <p className="flex gap-2"><Database className="h-4 w-4 shrink-0 text-[var(--color-primary)]" />
                <span><b className="text-[var(--color-on-surface)]">Severity model:</b> {card.severity_model.dataset}. Target: whether a collision is fatal or serious
                  (base rate {(card.severity_model.base_rate_ksi * 100).toFixed(1)}%). The top-risk 10% of scenarios are fatal/serious {(card.severity_model.top_decile_ksi_rate * 100).toFixed(0)}% of the time.</span></p>
              <p className="flex gap-2"><Info className="h-4 w-4 shrink-0 text-[var(--color-info)]" />
                <span>India publishes no per-crash geocoded records, so the condition→severity effect is learned from these
                  official police records and combined with real Indian rates below. AUC ≈ 0.65 is typical for
                  collision-severity models in published research: severity depends on many things no dataset records.</span></p>
            </div>
            <div className="space-y-2">
              <p><b className="text-[var(--color-on-surface)]">Indian data:</b> MoRTH 2022 accidents & deaths for {card.cities_covered} million-plus cities, MoRTH 2020 time-of-day and month tables, MoRTH 2018 weather tables, NCRB ADSI.</p>
              <p><b className="text-[var(--color-on-surface)]">Weather (India, deaths per 100 accidents):</b>{" "}
                {Object.entries(card.india_weather_factors_2018).map(([k, w]) => `${pretty(k)} ${w.deaths_per_100}`).join(" · ")}</p>
              <p><b className="text-[var(--color-on-surface)]">Frequency model:</b> {card.frequency_model.validation}. Unseen-city MAE {card.frequency_model.mae_unseen_city} vs
                national-profile baseline {card.frequency_model.mae_baseline_national_profile} → {card.frequency_model.decision}.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
