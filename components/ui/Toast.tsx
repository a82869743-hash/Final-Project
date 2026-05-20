"use client";

import { useState, useEffect, useCallback, createContext, useContext } from "react";
import { CheckCircle, AlertTriangle, Info, X, AlertCircle } from "lucide-react";

export type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType, duration?: number) => void;
}

const ToastContext = createContext<ToastContextValue>({
  showToast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

const toastConfig: Record<ToastType, { icon: typeof CheckCircle; color: string; bg: string }> = {
  success: { icon: CheckCircle, color: "var(--color-success)", bg: "rgba(16,185,129,0.08)" },
  error: { icon: AlertCircle, color: "var(--color-error)", bg: "rgba(239,68,68,0.08)" },
  warning: { icon: AlertTriangle, color: "var(--color-warning)", bg: "rgba(245,158,11,0.08)" },
  info: { icon: Info, color: "var(--color-primary)", bg: "rgba(0,103,127,0.08)" },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = "info", duration = 3500) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    setToasts((prev) => [...prev, { id, message, type, duration }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast Container */}
      <div className="fixed bottom-5 right-5 z-[9999] flex flex-col-reverse gap-2 max-w-sm">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const cfg = toastConfig[toast.type];
  const Icon = cfg.icon;

  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), toast.duration || 3500);
    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, onDismiss]);

  return (
    <div
      className="flex items-center gap-3 rounded-[var(--radius-md)] px-4 py-3 shadow-[var(--shadow-ambient)] animate-fade-in backdrop-blur-md"
      style={{ backgroundColor: cfg.bg, border: `1px solid ${cfg.color}20` }}
    >
      <Icon className="h-4 w-4 shrink-0" style={{ color: cfg.color }} />
      <span className="flex-1 text-[12px] font-medium text-[var(--color-on-surface)]">
        {toast.message}
      </span>
      <button
        onClick={() => onDismiss(toast.id)}
        className="shrink-0 rounded-full p-0.5 transition-colors hover:bg-[var(--color-surface-container-high)]"
      >
        <X className="h-3.5 w-3.5 text-[var(--color-on-surface-muted)]" />
      </button>
    </div>
  );
}
