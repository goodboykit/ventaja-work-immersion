"use client";

import { CheckCircle, AlertTriangle, XCircle, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  toast: (type: ToastType, message: string) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

const ICONS: Record<ToastType, typeof Info> = { success: CheckCircle, error: XCircle, warning: AlertTriangle, info: Info };
const COLORS: Record<ToastType, string> = {
  success: "bg-emerald-50 text-emerald-800 border-emerald-200",
  error: "bg-rose-50 text-rose-800 border-rose-200",
  warning: "bg-amber-50 text-amber-800 border-amber-200",
  info: "bg-blue-50 text-blue-800 border-blue-200",
};

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((type: ToastType, message: string) => {
    const id = ++nextId;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
        {toasts.map((t) => {
          const Icon = ICONS[t.type];
          return (
            <div key={t.id} className={`toast-in flex items-start gap-2 rounded-lg border px-4 py-3 shadow-lg text-sm ${COLORS[t.type]}`}>
              <Icon className="h-4 w-4 mt-0.5 shrink-0" />
              <span className="flex-1">{t.message}</span>
              <button type="button" onClick={() => dismiss(t.id)} className="ml-1 shrink-0 opacity-60 hover:opacity-100">
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext>
  );
}
