"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { CheckIcon, XIcon } from "@/components/icons";

type ToastTone = "success" | "error" | "info";

type ToastItem = {
  id: number;
  title: string;
  description?: string;
  tone: ToastTone;
};

export type ToastInput = {
  title: string;
  description?: string;
  tone?: ToastTone;
};

type ToastContextValue = {
  toast: (input: ToastInput) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION_MS = 5000;

function ToneIcon({ tone }: { tone: ToastTone }) {
  if (tone === "error") return <XIcon className="shrink-0 text-destructive" />;
  return <CheckIcon className="shrink-0 text-positive" />;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const toast = useCallback(
    ({ title, description, tone = "success" }: ToastInput) => {
      const id = ++nextId.current;
      setToasts((current) => [...current, { id, title, description, tone }]);
      window.setTimeout(() => dismiss(id), DEFAULT_DURATION_MS);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-label="Notifications"
        className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[100] flex w-full max-w-sm flex-col items-center gap-2 px-4 pointer-events-none"
      >
        {toasts.map((item) => (
          <div
            key={item.id}
            role="status"
            className="pointer-events-auto flex w-full items-start gap-2.5 rounded-xl bg-accent border border-foreground/16 shadow-lg px-4 py-3 text-foreground animate-fade-in"
          >
            <ToneIcon tone={item.tone} />
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-semibold m-0">{item.title}</p>
              {item.description && (
                <p className="text-[12.5px] opacity-70 m-0 mt-0.5 leading-relaxed">
                  {item.description}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              aria-label="Dismiss notification"
              className="shrink-0 opacity-50 hover:opacity-100 transition-opacity cursor-pointer"
            >
              <XIcon />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a <ToastProvider>");
  }
  return ctx;
}
