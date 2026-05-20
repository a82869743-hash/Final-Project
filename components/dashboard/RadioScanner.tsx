"use client";

import { useState, useEffect, useRef } from "react";
import { Radio, Volume2, VolumeX, ShieldAlert } from "lucide-react";
import { type Alert } from "@/lib/api";

export default function RadioScanner({ alerts }: { alerts: Alert[] }) {
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [logs, setLogs] = useState<{ id: string; text: string; time: string }[]>([]);
  const prevAlertsRef = useRef<Alert[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Translate severity to dispatch codes
  const get10Code = (severity: string) => {
    switch (severity) {
      case "critical": return "10-33 (Emergency)";
      case "warning": return "10-10 (Ongoing dispute/hazard)";
      default: return "10-4 (Routine info)";
    }
  };

  useEffect(() => {
    // Detect new alerts
    const newAlerts = alerts.filter(
      (a) => !prevAlertsRef.current.some((pa) => pa.id === a.id)
    );

    if (newAlerts.length > 0) {
      const newLogs = newAlerts.map(a => {
        const code = get10Code(a.severity);
        const text = `Dispatch: ${code} reported at ${a.location}. ${a.title}. Units respond immediately.`;
        
        // Handle Speech Synthesis
        if (audioEnabled && "speechSynthesis" in window) {
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.rate = 1.1;
          utterance.pitch = 0.9;
          // Try to find a synthetic/male voice for dispatch feel
          const voices = window.speechSynthesis.getVoices();
          const dispatchVoice = voices.find(v => v.name.includes("Google UK English Male") || v.name.includes("Samantha"));
          if (dispatchVoice) utterance.voice = dispatchVoice;
          window.speechSynthesis.speak(utterance);
        }

        return {
          id: `log-${Date.now()}-${a.id}`,
          text,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        };
      });

      setLogs(prev => [...prev, ...newLogs].slice(-10)); // Keep last 10
    }

    prevAlertsRef.current = alerts;
  }, [alerts, audioEnabled]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  // Initial population if empty
  useEffect(() => {
    if (logs.length === 0 && alerts.length > 0) {
       const initialLogs = alerts.slice(0, 3).map(a => ({
         id: `log-init-${a.id}`,
         text: `Dispatch: ${get10Code(a.severity)} reported at ${a.location}. ${a.title}.`,
         time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
       }));
       setLogs(initialLogs);
    }
  }, [alerts, logs.length]);

  return (
    <div className="glass rounded-[var(--radius-lg)] shadow-lg overflow-hidden border border-[var(--color-outline-variant)] flex flex-col h-full bg-[#0a0a0a]">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-800 bg-gray-900 flex justify-between items-center">
        <h3 className="text-[13px] font-[var(--font-display)] font-semibold text-gray-200 flex items-center gap-2 uppercase tracking-widest">
          <Radio className={`h-4 w-4 ${audioEnabled ? "text-red-500 animate-pulse" : "text-gray-500"}`} />
          Tactical Scanner Feed
        </h3>
        <button 
          onClick={() => {
            if (!audioEnabled && "speechSynthesis" in window) {
               // Unlock audio context on user interaction
               const u = new SpeechSynthesisUtterance("Scanner audio enabled");
               u.volume = 0;
               window.speechSynthesis.speak(u);
            }
            setAudioEnabled(!audioEnabled);
          }}
          className={`p-1.5 rounded-full transition-colors ${audioEnabled ? 'bg-red-500/20 text-red-500' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
          title={audioEnabled ? "Mute Scanner" : "Enable Live Audio"}
        >
          {audioEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
        </button>
      </div>

      {/* Ticker Feed */}
      <div 
        ref={scrollRef}
        className="flex-1 p-4 overflow-y-auto font-mono text-[11px] leading-relaxed space-y-2 max-h-[200px]"
      >
        {logs.map((log) => (
          <div key={log.id} className="flex gap-3 animate-fade-in text-cyan-400 opacity-90 border-b border-gray-800 pb-2">
            <span className="text-gray-500 shrink-0">[{log.time}]</span>
            <span className="break-words">
               {log.text.includes("10-33") && <ShieldAlert className="inline h-3 w-3 text-red-500 mr-1 mb-0.5" />}
               {log.text}
            </span>
          </div>
        ))}
        {logs.length === 0 && (
          <div className="text-gray-600 text-center italic mt-4">Waiting for dispatch signals...</div>
        )}
      </div>
    </div>
  );
}
