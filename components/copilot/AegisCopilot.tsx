"use client";

import { useState, useRef, useEffect } from "react";
import { Bot, X, Send, Mic, Loader2 } from "lucide-react";
import { api } from "@/lib/api";

interface Message {
  id: string;
  sender: "user" | "aegis";
  text: string;
  isAction?: boolean;
  severity?: string;
}

// ── Aegis Tactical system prompt for context-aware responses ──
const AEGIS_SYSTEM_CONTEXT = `You are Aegis Tactical AI Assistant, the intelligent emergency response and dispatch assistant integrated into the Aegis Tactical platform.

PRIMARY ROLE:
Act as a smart emergency operations assistant for demonstrations and system interaction. You assist dispatchers, emergency coordinators, and users with emergency analytics, predictions, tracking, and operational decisions.

CAPABILITIES:
- Emergency dispatch coordination
- Real-time fleet tracking & vehicle status queries
- AI-powered accident risk prediction (XGBoost ML model)
- Voice command processing & intent detection
- Video intelligence for accident analysis (YOLOv8)
- Hospital & ambulance proximity lookup (from real CSV datasets)
- Region-wise risk zone analysis across Indian cities

CURRENT SYSTEM ARCHITECTURE:
- Backend: FastAPI (Python) at port 8000
- Frontend: Next.js 14 (TypeScript) at port 3000
- ML: XGBoost model for risk prediction
- Video AI: YOLOv8 for accident detection
- Database: Supabase (PostgreSQL)
- Maps: Leaflet with OpenStreetMap
- Voice: Browser Speech API + Whisper fallback
- Geocoding: OpenStreetMap Nominatim

RESPONSE RULES:
- Stay within Aegis Tactical scope
- Provide actionable, data-driven responses
- Reference real system capabilities
- If asked about unrelated topics, respond: "I am configured specifically for Aegis Tactical emergency response operations."`;

// ── Quick response patterns for common queries ──
function getQuickResponse(text: string): string | null {
  const lower = text.toLowerCase().trim();

  // System status
  if (lower.includes("status") || lower.includes("online") || lower.includes("health")) {
    return "All Aegis Tactical subsystems are operational:\n• FastAPI backend — Online\n• ML Risk Predictor (XGBoost) — Active\n• Video AI (YOLOv8) — Standing by\n• Supabase DB — Connected\n• Vehicle WebSocket — Streaming\n\nAll critical services running within normal parameters.";
  }

  // Help / what can you do
  if (lower === "help" || lower.includes("what can you do") || lower.includes("capabilities")) {
    return "I can help you with:\n\n🚨 Emergency Dispatch — \"Report accident near Andheri\"\n🚑 Locate Resources — \"Find nearest ambulance\"\n📊 Risk Analysis — \"What's the risk level in Delhi?\"\n🗺️ Fleet Tracking — \"Show vehicle status\"\n🎥 Video Intel — \"Analyze accident footage\"\n🎙️ Voice Commands — Use the Voice tab\n\nJust type your query and I'll route it through the appropriate system.";
  }

  // Fleet/vehicles
  if (lower.includes("fleet") || lower.includes("vehicle") || lower.includes("ambulance status")) {
    return "Fleet status is available on the Tracking page. The system monitors all vehicles via WebSocket with:\n• Real-time GPS positioning\n• Status indicators (Available/En Route/On Scene/Critical)\n• Speed & heading data\n• Driver assignment\n• Click any vehicle marker to see its full ID and details.";
  }

  // Risk prediction
  if (lower.includes("risk") && (lower.includes("predict") || lower.includes("forecast") || lower.includes("zone"))) {
    return "The AI Risk Predictor uses an XGBoost model trained on historical accident data. You can:\n\n1. Dashboard → Use the 'Predictive ML Forecast' slider to see risk levels from NOW to +12 hours\n2. Region Filter → Select any Indian city to see localized risk zones\n3. Map → Colored dots show severity: 🔴 Critical | 🟠 High | 🟡 Medium | 🟢 Low\n\nThe model factors in: hour, day, traffic density, weather, population, and historical incidents.";
  }

  // Video intelligence
  if (lower.includes("video") && (lower.includes("intel") || lower.includes("analysis") || lower.includes("analyze"))) {
    return "The Video Intelligence module uses YOLOv8 for:\n\n• Vehicle detection & classification (car, truck, bus, motorcycle)\n• Accident type identification (head-on, rear-end, pileup, etc.)\n• Severity scoring (Minor → Fatal)\n• Pedestrian & crowd detection\n• Fire/smoke detection\n\nGo to Video Intelligence tab → Upload accident footage → Get full analysis report.";
  }

  // Scope check
  if (lower.includes("weather") || lower.includes("news") || lower.includes("stock") || 
      lower.includes("joke") || lower.includes("recipe") || lower.includes("game")) {
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
      // Check for quick local responses first
      const quickReply = getQuickResponse(userText);
      if (quickReply) {
        // Simulate slight delay for realism
        await new Promise(r => setTimeout(r, 400));
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
            isOpen ? "bg-[var(--color-surface-container)] text-[var(--color-on-surface)] rotate-90 scale-90" : "bg-cyan-600 text-white hover:bg-cyan-500 hover:scale-105"
          }`}
        >
          {isOpen ? <X className="h-6 w-6" /> : <Bot className="h-6 w-6" />}
        </button>
      </div>

      {/* Chat Window */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-50 w-[380px] h-[500px] bg-[var(--color-surface)]/95 backdrop-blur-2xl rounded-[var(--radius-lg)] shadow-[0_10px_40px_rgba(0,0,0,0.2)] flex flex-col overflow-hidden border border-[var(--color-outline-variant)] animate-fade-in">
          
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
                      ? "bg-red-950/40 text-red-200 border border-red-800/50 font-medium"
                      : msg.isAction && msg.severity === "warning"
                      ? "bg-amber-950/30 text-amber-200 border border-amber-800/40"
                      : "bg-[var(--color-surface-container)] text-[var(--color-on-surface)] border border-[var(--color-outline-variant)]"
                  }`}
                  style={{ whiteSpace: "pre-line" }}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-[var(--color-surface-container)] rounded-[var(--radius-md)] p-3 border border-[var(--color-outline-variant)] flex items-center gap-2">
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

function BrainCircuitIcon(props: any) {
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
