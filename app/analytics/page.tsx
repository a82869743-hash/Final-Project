"use client";

import { useEffect, useState } from "react";
import {
  BarChart3, TrendingUp, TrendingDown, Clock, Ambulance,
  AlertTriangle, Activity, MapPin, BrainCircuit, Zap, Shield,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
} from "recharts";

/* ── Chart tooltip style ── */
const tooltipStyle = {
  backgroundColor: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: "8px",
  boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
  fontSize: "11px",
  color: "#1e293b",
};

/* ── Mock analytics data ── */
const responseTimeData = [
  { hour: "00:00", time: 5.2 }, { hour: "02:00", time: 4.8 }, { hour: "04:00", time: 3.9 },
  { hour: "06:00", time: 4.1 }, { hour: "08:00", time: 6.3 }, { hour: "10:00", time: 5.5 },
  { hour: "12:00", time: 5.8 }, { hour: "14:00", time: 4.9 }, { hour: "16:00", time: 5.1 },
  { hour: "18:00", time: 7.2 }, { hour: "20:00", time: 6.1 }, { hour: "22:00", time: 4.5 },
];

const incidentsWeekly = [
  { day: "Mon", incidents: 42, resolved: 38 }, { day: "Tue", incidents: 35, resolved: 33 },
  { day: "Wed", incidents: 48, resolved: 45 }, { day: "Thu", incidents: 39, resolved: 36 },
  { day: "Fri", incidents: 55, resolved: 50 }, { day: "Sat", incidents: 62, resolved: 58 },
  { day: "Sun", incidents: 44, resolved: 42 },
];

const incidentTypes = [
  { name: "Cardiac", value: 28, color: "#FF3B30" },
  { name: "Accident", value: 35, color: "#FF9500" },
  { name: "Fall", value: 15, color: "#00D4FF" },
  { name: "Fire", value: 8, color: "#f97316" },
  { name: "Other", value: 14, color: "#475569" },
];

const zoneData = [
  { zone: "Zone A", risk: 0.82, incidents: 45, avgTime: 3.8 },
  { zone: "Zone B", risk: 0.65, incidents: 32, avgTime: 4.2 },
  { zone: "Zone C", risk: 0.45, incidents: 21, avgTime: 5.1 },
  { zone: "Zone D", risk: 0.73, incidents: 38, avgTime: 4.5 },
  { zone: "Zone E", risk: 0.31, incidents: 14, avgTime: 6.2 },
];

const forecastData = [
  { hour: "Now", risk: 42, incidents: 3 }, { hour: "+1h", risk: 48, incidents: 4 },
  { hour: "+2h", risk: 55, incidents: 5 }, { hour: "+3h", risk: 67, incidents: 7 },
  { hour: "+4h", risk: 78, incidents: 9 }, { hour: "+5h", risk: 85, incidents: 11 },
  { hour: "+6h", risk: 72, incidents: 8 }, { hour: "+7h", risk: 58, incidents: 5 },
  { hour: "+8h", risk: 45, incidents: 3 },
];

const kpiCards = [
  { label: "Total Calls Today", value: "127", change: "+8%", type: "up" as const, icon: Activity, color: "#0284c7" },
  { label: "Avg Response", value: "4.2 min", change: "-12%", type: "up" as const, icon: Clock, color: "#16a34a" },
  { label: "Fleet Utilization", value: "78%", change: "+5%", type: "up" as const, icon: Ambulance, color: "#d97706" },
  { label: "Critical Events", value: "6", change: "+2", type: "down" as const, icon: AlertTriangle, color: "#dc2626" },
];

/* ── AI Insights ── */
const aiInsights = [
  { text: "Response delays increased by 12% in Zone A between 6-8 PM", severity: "warning", icon: TrendingUp },
  { text: "Most active zone: Sector B with 62 incidents this week", severity: "info", icon: MapPin },
  { text: "Predicted peak traffic window: 6PM–8PM today", severity: "critical", icon: AlertTriangle },
  { text: "Fleet utilization improved 5% after rebalancing algorithm update", severity: "success", icon: Zap },
];

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<"overview" | "zones" | "performance" | "forecast">("overview");

  const insightColor = (s: string) => s === "critical" ? "#dc2626" : s === "warning" ? "#d97706" : s === "success" ? "#16a34a" : "#0284c7";

  return (
    <div className="space-y-5 animate-fade-in">
      {/* ── KPI Row ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpiCards.map((kpi) => (
          <div key={kpi.label} className="card-lifted p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg shrink-0"
              style={{ background: `${kpi.color}12` }}>
              <kpi.icon className="h-5 w-5" style={{ color: kpi.color }} />
            </div>
            <div>
              <p className="font-[var(--font-display)] text-lg font-bold text-[var(--color-on-surface)]">{kpi.value}</p>
              <div className="flex items-center gap-1.5">
                <span className="font-[var(--font-display)] text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--color-on-surface-muted)]">
                  {kpi.label}
                </span>
                <span className={`flex items-center gap-0.5 text-[9px] font-bold ${kpi.type === "up" ? "text-[var(--color-success)]" : "text-[var(--color-error)]"}`}>
                  {kpi.type === "up" ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {kpi.change}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── AI Insights Panel ── */}
      <div className="card-lifted p-5">
        <h3 className="font-[var(--font-display)] text-[13px] font-bold text-[var(--color-on-surface)] mb-4 flex items-center gap-2">
          <BrainCircuit className="h-4 w-4 text-[var(--color-info)]" />
          AI Intelligence Insights
          <span className="ml-auto text-[8px] font-bold tracking-wider uppercase px-2 py-0.5 rounded bg-[var(--color-info)]/10 text-[var(--color-info)]">Live Analysis</span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {aiInsights.map((insight, i) => {
            const c = insightColor(insight.severity);
            return (
              <div key={i} className="flex items-start gap-3 px-3 py-3 rounded-lg border-l-[3px] animate-fade-in"
                style={{ background: `${c}06`, borderLeftColor: c, animationDelay: `${i * 0.1}s` }}>
                <insight.icon className="h-4 w-4 mt-0.5 shrink-0" style={{ color: c }} />
                <p className="text-[11px] text-[var(--color-on-surface-muted)] leading-relaxed">{insight.text}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Tab Navigation ── */}
      <div className="flex gap-1 bg-[var(--color-surface-container-low)] border border-[var(--color-outline-variant)] rounded-lg p-1 w-fit">
        {(["overview", "zones", "performance", "forecast"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-md text-[11px] font-bold uppercase tracking-wider transition-all ${
              activeTab === tab
                ? "bg-[var(--color-primary)]/10 text-[var(--color-primary)] border border-[var(--color-primary)]/20"
                : "text-[var(--color-on-surface-muted)] hover:text-[var(--color-on-surface)] border border-transparent"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ── Overview Charts ── */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 animate-fade-in">
          <div className="card-lifted p-5">
            <h3 className="font-[var(--font-display)] text-[12px] font-bold text-[var(--color-on-surface)] mb-4">Response Time (24h)</h3>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={responseTimeData}>
                <defs>
                  <linearGradient id="gradientCyan" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00D4FF" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#00D4FF" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "#64748b" }} stroke="#e2e8f0" />
                <YAxis tick={{ fontSize: 10, fill: "#64748b" }} unit=" min" stroke="#e2e8f0" />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="time" stroke="#00D4FF" strokeWidth={2} fill="url(#gradientCyan)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="card-lifted p-5">
            <h3 className="font-[var(--font-display)] text-[12px] font-bold text-[var(--color-on-surface)] mb-4">Weekly Incidents</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={incidentsWeekly}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#64748b" }} stroke="#e2e8f0" />
                <YAxis tick={{ fontSize: 10, fill: "#64748b" }} stroke="#e2e8f0" />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="incidents" fill="#FF9500" radius={[4, 4, 0, 0]} />
                <Bar dataKey="resolved" fill="#34C759" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card-lifted p-5">
            <h3 className="font-[var(--font-display)] text-[12px] font-bold text-[var(--color-on-surface)] mb-4">Incident Classification</h3>
            <div className="flex items-center">
              <ResponsiveContainer width="60%" height={220}>
                <PieChart>
                  <Pie data={incidentTypes} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                    {incidentTypes.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div className="w-[40%] space-y-2">
                {incidentTypes.map((type) => (
                  <div key={type.name} className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: type.color }} />
                    <span className="flex-1 text-[10px] text-[var(--color-on-surface-muted)]">{type.name}</span>
                    <span className="font-[var(--font-display)] text-[11px] font-bold text-[var(--color-on-surface)]">{type.value}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card-lifted p-5">
            <h3 className="font-[var(--font-display)] text-[12px] font-bold text-[var(--color-on-surface)] mb-4">Fleet Efficiency</h3>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={responseTimeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "#64748b" }} stroke="#e2e8f0" />
                <YAxis tick={{ fontSize: 10, fill: "#64748b" }} stroke="#e2e8f0" />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="time" stroke="#34C759" strokeWidth={2} dot={{ r: 3, fill: "#34C759" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Zone Risk Tab ── */}
      {activeTab === "zones" && (
        <div className="animate-fade-in">
          <div className="card-lifted overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-[var(--color-surface-container-low)]">
                  {["Zone", "Risk Score", "Incidents", "Avg Response", "Risk Level"].map((h) => (
                    <th key={h} className="px-5 py-3 text-left font-[var(--font-display)] text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--color-on-surface-muted)]">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {zoneData.map((z, idx) => {
                  const riskColor = z.risk >= 0.7 ? "#FF3B30" : z.risk >= 0.4 ? "#FF9500" : "#34C759";
                  const riskLabel = z.risk >= 0.7 ? "High" : z.risk >= 0.4 ? "Medium" : "Low";
                  return (
                    <tr key={z.zone} className="border-t border-[var(--color-outline-variant)] hover:bg-[var(--color-surface-container-low)] transition-colors animate-fade-in"
                      style={{ animationDelay: `${idx * 0.05}s` }}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <MapPin className="h-3.5 w-3.5 text-[var(--color-info)]" />
                          <span className="text-[12px] font-bold text-[var(--color-on-surface)]">{z.zone}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-1.5 rounded-full bg-[#1e293b] overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${z.risk * 100}%`, backgroundColor: riskColor }} />
                          </div>
                          <span className="font-[var(--font-display)] text-[11px] font-bold" style={{ color: riskColor }}>
                            {(z.risk * 100).toFixed(0)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-[11px] text-[var(--color-on-surface-muted)]">{z.incidents}</td>
                      <td className="px-5 py-3 text-[11px] text-[var(--color-on-surface-muted)]">{z.avgTime} min</td>
                      <td className="px-5 py-3">
                        <span className="inline-flex px-2 py-0.5 rounded text-[9px] font-bold uppercase"
                          style={{ backgroundColor: `${riskColor}15`, color: riskColor }}>
                          {riskLabel}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Performance Tab ── */}
      {activeTab === "performance" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 animate-fade-in">
          <div className="card-lifted p-5">
            <h3 className="font-[var(--font-display)] text-[12px] font-bold text-[var(--color-on-surface)] mb-4">Response Time Distribution</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={[
                { range: "0-2 min", count: 12 }, { range: "2-4 min", count: 28 },
                { range: "4-6 min", count: 35 }, { range: "6-8 min", count: 18 },
                { range: "8-10 min", count: 8 }, { range: "10+ min", count: 3 },
              ]}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="range" tick={{ fontSize: 10, fill: "#64748b" }} stroke="#e2e8f0" />
                <YAxis tick={{ fontSize: 10, fill: "#64748b" }} stroke="#e2e8f0" />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" fill="#00D4FF" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card-lifted p-5">
            <h3 className="font-[var(--font-display)] text-[12px] font-bold text-[var(--color-on-surface)] mb-4">Call Volume Trend (7 Day)</h3>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={incidentsWeekly}>
                <defs>
                  <linearGradient id="gradientGreen" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#34C759" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#34C759" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#64748b" }} stroke="#e2e8f0" />
                <YAxis tick={{ fontSize: 10, fill: "#64748b" }} stroke="#e2e8f0" />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="incidents" stroke="#34C759" strokeWidth={2} fill="url(#gradientGreen)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Forecast Tab (NEW) ── */}
      {activeTab === "forecast" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 animate-fade-in">
          <div className="card-lifted p-5">
            <h3 className="font-[var(--font-display)] text-[12px] font-bold text-[var(--color-on-surface)] mb-4 flex items-center gap-2">
              <BrainCircuit className="h-4 w-4 text-[var(--color-info)]" />
              Risk Prediction Forecast
            </h3>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={forecastData}>
                <defs>
                  <linearGradient id="gradientRisk" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#FF3B30" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#FF3B30" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "#64748b" }} stroke="#e2e8f0" />
                <YAxis tick={{ fontSize: 10, fill: "#64748b" }} stroke="#e2e8f0" unit="%" />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="risk" stroke="#FF3B30" strokeWidth={2} fill="url(#gradientRisk)" name="Risk %" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="card-lifted p-5">
            <h3 className="font-[var(--font-display)] text-[12px] font-bold text-[var(--color-on-surface)] mb-4 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-[#FF9500]" />
              Predicted Incident Volume
            </h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={forecastData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "#64748b" }} stroke="#e2e8f0" />
                <YAxis tick={{ fontSize: 10, fill: "#64748b" }} stroke="#e2e8f0" />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="incidents" radius={[4, 4, 0, 0]} name="Predicted Incidents">
                  {forecastData.map((entry, i) => (
                    <Cell key={i} fill={entry.risk > 70 ? "#FF3B30" : entry.risk > 50 ? "#FF9500" : "#34C759"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Zone Performance Comparison */}
          <div className="card-lifted p-5 lg:col-span-2">
            <h3 className="font-[var(--font-display)] text-[12px] font-bold text-[var(--color-on-surface)] mb-4 flex items-center gap-2">
              <Shield className="h-4 w-4 text-[var(--color-info)]" />
              Zone Performance Comparison
            </h3>
            <div className="grid grid-cols-5 gap-3">
              {zoneData.map((z) => {
                const c = z.risk >= 0.7 ? "#FF3B30" : z.risk >= 0.4 ? "#FF9500" : "#34C759";
                return (
                  <div key={z.zone} className="rounded-lg border border-[var(--color-outline-variant)] p-4 text-center" style={{ background: `${c}08` }}>
                    <h4 className="text-[11px] font-bold text-[var(--color-on-surface)] mb-2">{z.zone}</h4>
                    <div className="text-2xl font-bold mb-1" style={{ color: c }}>{(z.risk * 100).toFixed(0)}%</div>
                    <p className="text-[9px] text-[var(--color-on-surface-muted)] uppercase font-bold tracking-wider">Risk Score</p>
                    <div className="mt-3 space-y-1 text-[10px] text-[var(--color-on-surface-muted)]">
                      <p>Incidents: <strong className="text-[var(--color-on-surface)]">{z.incidents}</strong></p>
                      <p>Avg ETA: <strong className="text-[var(--color-on-surface)]">{z.avgTime}m</strong></p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
