"use client";

import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
} from "recharts";
import { type Vehicle, type Alert } from "@/lib/api";

interface PremiumAnalyticsProps {
  vehicles: Vehicle[];
  alerts: Alert[];
}

export default function PremiumAnalytics({ vehicles, alerts }: PremiumAnalyticsProps) {
  // Compute Incidents Timeline (Mock 24h spread based on alerts length)
  const timelineData = useMemo(() => {
    const data = [];
    const baseIncidents = alerts.length * 2;
    for (let i = 0; i < 24; i += 2) {
      data.push({
        time: `${i}:00`,
        incidents: Math.max(0, baseIncidents + Math.floor(Math.sin(i) * 10) + Math.floor(Math.random() * 5)),
      });
    }
    return data;
  }, [alerts.length]);

  // Compute Severity Breakdown
  const severityData = useMemo(() => {
    const critical = alerts.filter(a => a.severity === "critical").length;
    const warning = alerts.filter(a => a.severity === "warning").length;
    const info = alerts.filter(a => a.severity === "info").length;
    
    return [
      { name: "Critical", value: critical, color: "#ef4444" },
      { name: "Warning", value: warning, color: "#f59e0b" },
      { name: "Info", value: info, color: "#3b82f6" },
    ];
  }, [alerts]);

  // Compute Fleet Utilization
  const fleetData = useMemo(() => {
    const available = vehicles.filter(v => v.status === "available").length;
    const enRoute = vehicles.filter(v => v.status === "en_route").length;
    const onScene = vehicles.filter(v => v.status === "on_scene" || v.status === "critical").length;
    const offline = vehicles.filter(v => v.status === "offline").length;

    return [
      { name: "Available", value: available, color: "#10b981" },
      { name: "En Route", value: enRoute, color: "#3b82f6" },
      { name: "On Scene", value: onScene, color: "#f59e0b" },
      { name: "Offline", value: offline, color: "#6b7280" },
    ].filter(item => item.value > 0);
  }, [vehicles]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="glass rounded-[var(--radius-md)] p-3 border border-[var(--color-outline-variant)] shadow-xl">
          <p className="text-[12px] text-[var(--color-on-surface-muted)] mb-1">{label}</p>
          <p className="text-[14px] font-bold text-[var(--color-on-surface)]">
            {payload[0].name}: {payload[0].value}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in mt-6">
      
      {/* 24h Timeline */}
      <div className="glass rounded-[var(--radius-lg)] p-5 col-span-1 lg:col-span-2 shadow-lg relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-br from-[#3b82f6]/5 to-transparent z-0 pointer-events-none" />
        <h3 className="text-[14px] font-[var(--font-display)] font-semibold uppercase tracking-wider text-[var(--color-on-surface-muted)] mb-6 z-10 relative">
          Incidents Timeline (24h)
        </h3>
        <div className="h-[250px] w-full z-10 relative">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={timelineData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-outline-variant)" vertical={false} />
              <XAxis dataKey="time" stroke="var(--color-on-surface-muted)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--color-on-surface-muted)" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Line 
                type="monotone" 
                dataKey="incidents" 
                name="Incidents"
                stroke="#3b82f6" 
                strokeWidth={3}
                dot={{ r: 4, fill: "#3b82f6", strokeWidth: 2, stroke: "var(--color-surface)" }}
                activeDot={{ r: 6, strokeWidth: 0 }}
                animationDuration={1500}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Fleet Utilization / Severity */}
      <div className="flex flex-col gap-6 col-span-1">
        
        {/* Severity */}
        <div className="glass rounded-[var(--radius-lg)] p-5 shadow-lg relative overflow-hidden flex-1">
          <h3 className="text-[14px] font-[var(--font-display)] font-semibold uppercase tracking-wider text-[var(--color-on-surface-muted)] mb-4">
            Alert Severity Breakdown
          </h3>
          <div className="h-[120px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={severityData} layout="vertical" margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" width={60} stroke="var(--color-on-surface-muted)" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: 'var(--color-surface-container)' }} content={<CustomTooltip />} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} animationDuration={1500}>
                  {severityData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Fleet Utilization */}
        <div className="glass rounded-[var(--radius-lg)] p-5 shadow-lg relative overflow-hidden flex-1 flex flex-col">
          <h3 className="text-[14px] font-[var(--font-display)] font-semibold uppercase tracking-wider text-[var(--color-on-surface-muted)] mb-2">
            Fleet Utilization
          </h3>
          <div className="flex-1 flex items-center justify-center">
            <div className="h-[140px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={fleetData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={65}
                    paddingAngle={5}
                    dataKey="value"
                    animationDuration={1500}
                    stroke="none"
                  >
                    {fleetData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            
            {/* Legend */}
            <div className="flex flex-col gap-2 shrink-0 pr-4">
              {fleetData.map((entry) => (
                <div key={entry.name} className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                  <span className="text-[11px] text-[var(--color-on-surface-muted)]">{entry.name}</span>
                  <span className="text-[12px] font-bold text-[var(--color-on-surface)] ml-auto">{entry.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
