"use client";

import { useState, useRef, useEffect } from "react";
import { Bot, X, Send, Loader2 } from "lucide-react";
import { api } from "@/lib/api";

interface Message {
  id: string;
  sender: "user" | "aegis";
  text: string;
  isAction?: boolean;
  severity?: string;
}

const CITY_ALIASES: Record<string, string> = {
  bangalore: "Bengaluru", bombay: "Mumbai", calcutta: "Kolkata", madras: "Chennai", gurgaon: "Delhi",
  noida: "Delhi", "new delhi": "Delhi", trivandrum: "Thiruvananthapuram", vizag: "Visakhapatnam",
  allahabad: "Prayagraj", cochin: "Kochi", baroda: "Vadodara", calicut: "Kozhikode",
};
const SUBSYSTEM_NAMES: Record<string, string> = {
  fastapi: "FastAPI backend", ml_model: "ML risk engine", supabase: "Database", whisper: "Whisper transcription",
  weather: "Live weather feed",
};

function findCity(lower: string, names: string[]): string | null {
  for (const [alias, name] of Object.entries(CITY_ALIASES)) if (lower.includes(alias)) return name;
  return names.find((n) => lower.includes(n.toLowerCase())) ?? null;
}

/** Answers backed by live backend data (status, weather, risk, fleet, planning). */
async function getLiveResponse(text: string): Promise<string | null> {
  const lower = text.toLowerCase().trim();

  if (/\b(status|health|online|systems?)\b/.test(lower) && !lower.includes("ambulance status")) {
    const h = await api.health();
    const rows = Object.entries(h as unknown as Record<string, { status: string; latency: string; optional?: boolean }>);
    const core = rows.filter(([, v]) => !v.optional);
    const ok = core.every(([, v]) => v.status === "online");
    return `${ok ? "✅ All core systems online." : "⚠️ Some core systems need attention."}\n\n` +
      rows.map(([k, v]) => `• ${SUBSYSTEM_NAMES[k] ?? k} — ${v.status}${v.latency ? ` (${v.latency})` : ""}${v.optional ? " · optional" : ""}`).join("\n");
  }

  const wantsWeather = /\b(weather|temperature|rain|fog|forecast)\b/.test(lower);
  const wantsRisk = /\b(risk|danger|dangerous|safe|unsafe|hotspot)/.test(lower);
  if (wantsWeather || wantsRisk) {
    const r = await api.getRiskNow();
    const city = findCity(lower, r.cities.map((c) => c.city));
    const c = city ? r.cities.find((x) => x.city === city) : null;
    if (c) {
      const wx = c.temperature_c != null ? `${Math.round(c.temperature_c)}°C, ${c.description ?? c.weather_label}` : c.weather_label;
      return `📍 ${c.city} — ${String(r.hour_ist).padStart(2, "0")}:00 IST\n\n` +
        `🌤 Weather: ${wx}${r.weather_live ? " (live, Open-Meteo)" : " (live feed offline)"}\n` +
        `⚠️ Risk: ${c.risk_level} — ${Math.round(c.percentile)}th percentile of Indian city-hours\n` +
        `🚑 Expected accidents next hour: ${c.expected_accidents_next_hour.toFixed(2)}\n` +
        `☠️ Expected deaths/hour: ${c.expected_deaths_per_hour.toFixed(3)}\n\n` +
        "Source: MoRTH/NCRB city statistics + XGBoost severity model. See Risk AI for a full breakdown.";
    }
    const top = r.cities.slice(0, 5).map((x, i) => `${i + 1}. ${x.city} — ${x.risk_level} (P${Math.round(x.percentile)}) · ${x.weather_label}`).join("\n");
    return `Highest-risk cities right now (${String(r.hour_ist).padStart(2, "0")}:00 IST, ${r.weather_live ? "live weather" : "weather offline"}):\n\n${top}\n\n` +
      `${r.counts.High} high · ${r.counts.Medium} medium · ${r.counts.Low} low across ${r.cities.length} cities.\nAsk e.g. "risk in Pune" for one city.`;
  }

  if (/\b(plan|pre-?position|reposition|relocat|where should)/.test(lower)) {
    const p = await api.getFleetPlan(6);
    const moves = p.moves.slice(0, 5).map((m) => `• ${m.units}× ${m.from} → ${m.to} (${m.distance_km} km, ~${m.drive_min} min)`).join("\n");
    return `🗺 Fleet plan for the next 6 h\n\nExpected accidents: ${p.expected_accidents_total.toFixed(1)} across 53 cities\n` +
      `Demand coverage: ${Math.round(p.coverage_now * 100)}% → ${Math.round(p.coverage_after * 100)}% after plan\n\n` +
      (moves || "No reachable relocation improves coverage right now.") +
      (p.unmet_cities.length ? `\n\nOut of reach: ${p.unmet_cities.slice(0, 5).join(", ")}` : "") +
      "\n\nOpen Fleet Planner to dispatch these moves.";
  }

  if (/\b(fleet|vehicles?|ambulances?)\b/.test(lower) && !/\b(near|nearest|closest|send|need)\b/.test(lower)) {
    const v = await api.getVehicles();
    const count = (st: string) => v.filter((x) => x.status === st).length;
    return `🚑 Live fleet — ${v.length} units\n\n• Available: ${count("available")}\n• En route: ${count("en_route")}\n` +
      `• On scene: ${count("on_scene")}\n• Critical: ${count("critical")}\n• Offline: ${count("offline")}\n\nSee Tracking for live positions.`;
  }
  return null;
}

// ── Quick response patterns for common queries ──
function getQuickResponse(text: string): string | null {
  const lower = text.toLowerCase().trim();

  // Help / what can you do
  if (lower === "help" || lower.includes("what can you do") || lower.includes("capabilities")) {
    return "I can help you with:\n\n🚨 Emergency Dispatch — \"Report accident near Andheri\"\n🚑 Locate Resources — \"Find nearest ambulance\"\n📊 Risk Analysis — \"What's the risk level in Delhi?\"\n🗺️ Fleet Tracking — \"Show fleet\"\n🌦 Live weather & risk — \"Risk in Mumbai\"\n📦 Pre-positioning — \"Where should ambulances go?\"\n🎥 Video Intel — \"Analyze accident footage\"\n🎙️ Voice Commands — Use the Voice tab\n\nJust type your query and I'll route it through the appropriate system.";
  }

  // Video intelligence
  if (lower.includes("video") && (lower.includes("intel") || lower.includes("analysis") || lower.includes("analyze"))) {
    return "The Video Intelligence module uses YOLOv8 for:\n\n• Vehicle detection & classification (car, truck, bus, motorcycle)\n• Accident type identification (head-on, rear-end, pileup, etc.)\n• Severity scoring (Minor → Fatal)\n• Pedestrian & crowd detection\n• Fire/smoke detection\n\nGo to Video Intelligence tab → Upload accident footage → Get full analysis report.";
  }

  // Scope check
  if (lower.includes("news") || lower.includes("stock") || lower.includes("joke") ||
      lower.includes("recipe") || lower.includes("game")) {
    return "I am configured specifically for Aegis Tactical emergency response operations. I cannot assist with queries outside this scope.";
  }

  return null;
}

export default function AegisCopilot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { id: "msg-0", sender: "aegis", text: "Aegis-1 online. I'm your tactical AI assistant for emergency dispatch, fleet tracking, and risk intelligence. How can I help?" }
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  const handleSend = async () => {
    if (!inputValue.trim()) return;

    const userText = inputValue;
    setInputValue("");
    setMessages(prev => [...prev, { id: `msg-${Date.now()}`, sender: "user", text: userText }]);
    setIsTyping(true);

    try {
      // Live data answers first, then static help, then intent routing
      const quickReply = (await getLiveResponse(userText).catch(() => null)) ?? getQuickResponse(userText);
      if (quickReply) {
        setMessages(prev => [...prev, { 
          id: `msg-${Date.now()}`, sender: "aegis", text: quickReply 
        }]);
        setIsTyping(false);
        return;
      }

      // Route through backend text-intent for emergency/action queries
      const result = await api.textIntent(userText);

      let replyText = "";
      let severity = "info";
      let isAction = false;

      const intent = result.intent;
      const action = result.action_result;
      const location = intent?.extracted_location;

      if (intent?.intent === "accident" || intent?.intent === "fire") {
        severity = "critical";
        isAction = true;
        replyText = `🚨 CRITICAL ALERT — ${intent.description}\n`;
        if (location) {
          replyText += `📍 Location: ${location.name} (${location.latitude.toFixed(3)}, ${location.longitude.toFixed(3)})\n`;
        }
        if (action?.data?.nearest_ambulance) {
          replyText += `🚑 Nearest Ambulance: ${action.data.nearest_ambulance.vehicle_id} — ${action.data.nearest_ambulance.distance_km} km, ETA ${action.data.nearest_ambulance.estimated_arrival_min} min\n`;
        }
        if (action?.data?.nearest_hospital) {
          replyText += `🏥 Nearest Hospital: ${action.data.nearest_hospital.hospital_name} — ${action.data.nearest_hospital.distance_km} km\n`;
        }
        replyText += `\nEmergency protocol activated. Dispatching resources now.`;

      } else if (intent?.intent === "help") {
        severity = "warning";
        isAction = true;
        replyText = `🚑 Help request acknowledged.\n`;
        if (location) {
          replyText += `📍 Location detected: ${location.name}\n`;
        }
        if (action?.data?.nearest_ambulance) {
          replyText += `\nClosest Ambulance: ${action.data.nearest_ambulance.vehicle_id}\n• Distance: ${action.data.nearest_ambulance.distance_km} km\n• ETA: ${action.data.nearest_ambulance.estimated_arrival_min} min\n• Status: ${action.data.nearest_ambulance.status}\n`;
        }
        if (action?.data?.nearest_hospital) {
          replyText += `\nClosest Hospital: ${action.data.nearest_hospital.hospital_name}\n• City: ${action.data.nearest_hospital.city}\n• Distance: ${action.data.nearest_hospital.distance_km} km\n• Beds Available: ${action.data.nearest_hospital.available_beds}/${action.data.nearest_hospital.total_beds}\n• ICU: ${action.data.nearest_hospital.icu_beds}\n• Emergency: ${action.data.nearest_hospital.has_emergency}\n`;
        }

      } else if (intent?.intent === "traffic") {
        replyText = `🚦 Traffic analysis initiated for ${location ? location.name : "your area"}.\n\nI've flagged this location on the monitoring system. Check the Dashboard for real-time congestion data and risk overlay.`;

      } else if (intent?.intent === "risk") {
        replyText = `📊 Risk assessment queued for ${location ? location.name : "current zone"}.\n\nUse the Dashboard → Region filter → select the city to view:\n• ML risk prediction (Now to +12h)\n• Accident hotspot density\n• Critical zone alerts\n\nThe XGBoost model processes traffic, weather, and historical data for accurate forecasting.`;

      } else {
        // Unknown intent — still respond contextually
        replyText = `Understood: "${userText.substring(0, 80)}${userText.length > 80 ? "..." : ""}"\n\nI've processed this through the intent detection pipeline. Confidence: ${((intent?.confidence || 0.1) * 100).toFixed(0)}%.\n\nFor best results, try phrases like:\n• "Accident near [location]"\n• "Find nearest ambulance in [city]"\n• "Show risk level for [area]"`;
      }

      setMessages(prev => [...prev, { 
        id: `msg-${Date.now()}`, 
        sender: "aegis", 
        text: replyText,
        isAction,
        severity,
      }]);
    } catch {
      setMessages(prev => [...prev, { 
        id: `msg-${Date.now()}`, 
        sender: "aegis", 
        text: "⚠️ Connection to Aegis Intelligence Core unavailable. The AI backend may be initializing — please retry in a few seconds." 
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <>
      {/* Floating Action Button */}
      <div className="fixed bottom-6 right-6 z-50 group">
        {!isOpen && (
          <div className="absolute inset-0 bg-cyan-500 rounded-full animate-ping opacity-75"></div>
        )}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`relative p-4 rounded-full shadow-[0_0_20px_rgba(6,182,212,0.4)] transition-all duration-300 ${
            isOpen ? "bg-[var(--color-surface-container-low)] text-[var(--color-on-surface)] rotate-90 scale-90" : "bg-cyan-600 text-white hover:bg-cyan-500 hover:scale-105"
          }`}
        >
          {isOpen ? <X className="h-6 w-6" /> : <Bot className="h-6 w-6" />}
        </button>
      </div>

      {/* Chat Window */}
      {isOpen && (
        <div className="fixed bottom-24 z-50 w-[min(380px,calc(100vw-2rem))] h-[min(520px,calc(100vh-8rem))] right-4 sm:right-6 bg-[var(--color-surface)]/95 backdrop-blur-2xl rounded-[var(--radius-lg)] shadow-[0_10px_40px_rgba(0,0,0,0.2)] flex flex-col overflow-hidden border border-[var(--color-outline-variant)] animate-fade-in">
          
          {/* Header */}
          <div className="px-4 py-3 border-b border-[var(--color-outline-variant)] flex items-center gap-3 bg-[var(--color-surface-container-high)]">
            <div className="bg-cyan-500/20 p-2 rounded-full">
              <BrainCircuitIcon className="h-4 w-4 text-cyan-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-[var(--font-display)] text-[14px] font-bold text-[var(--color-on-surface)]">Aegis-1 Copilot</h3>
              <p className="text-[10px] text-cyan-500 flex items-center gap-1 font-semibold uppercase tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse"></span>
                Tactical AI Online
              </p>
            </div>
            <span className="text-[9px] font-bold px-2 py-1 bg-cyan-500/10 text-cyan-500 rounded-full uppercase tracking-wider">
              v2.0
            </span>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}>
                <div 
                  className={`max-w-[88%] rounded-[var(--radius-md)] p-3 text-[12px] leading-relaxed shadow-sm ${
                    msg.sender === "user" 
                      ? "bg-cyan-600 text-white border border-cyan-500" 
                      : msg.isAction && msg.severity === "critical"
                      ? "bg-red-50 text-red-900 border border-red-200 font-medium"
                      : msg.isAction && msg.severity === "warning"
                      ? "bg-amber-50 text-amber-900 border border-amber-200"
                      : "bg-[var(--color-surface-container-low)] text-[var(--color-on-surface)] border border-[var(--color-outline-variant)]"
                  }`}
                  style={{ whiteSpace: "pre-line" }}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-[var(--color-surface-container-low)] rounded-[var(--radius-md)] p-3 border border-[var(--color-outline-variant)] flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 text-cyan-500 animate-spin" />
                  <span className="text-[11px] text-[var(--color-on-surface-muted)]">Processing...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-[var(--color-outline-variant)] bg-[var(--color-surface-container-low)]">
            <div className="relative flex items-center">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder="Report incident, ask status, get help..."
                className="w-full bg-[var(--color-surface)] border border-[var(--color-outline-variant)] text-[var(--color-on-surface)] text-[12px] rounded-full pl-4 pr-12 py-2.5 focus:outline-none focus:ring-1 focus:ring-cyan-500 transition-all placeholder:text-[var(--color-on-surface-muted)]"
              />
              <div className="absolute right-1 flex items-center gap-1">
                <button 
                  onClick={handleSend}
                  disabled={!inputValue.trim() || isTyping}
                  className="p-1.5 bg-cyan-600 text-white rounded-full hover:bg-cyan-500 disabled:opacity-50 disabled:hover:bg-cyan-600 transition-colors"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function BrainCircuitIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
      <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
      <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" />
      <path d="M17.599 6.5a3 3 0 0 0 .399-1.375" />
      <path d="M6.003 5.125A3 3 0 0 0 6.401 6.5" />
      <path d="M3.477 10.896a4 4 0 0 1 .585-.396" />
      <path d="M19.938 10.5a4 4 0 0 1 .585.396" />
      <path d="M6 18a4 4 0 0 1-1.967-.516" />
      <path d="M19.967 17.484A4 4 0 0 1 18 18" />
    </svg>
  );
}
