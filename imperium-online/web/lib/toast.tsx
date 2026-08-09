"use client";

// Toast layer (Phase 8B — game feel).
//
// A tiny global notification system. The provider holds a queue of live toasts
// and exposes `push`; the <Toaster> (mounted in layout) renders them and — via
// components/Toaster.tsx — translates realtime WebSocket events into toasts so
// battles, builds, and captures *announce themselves* instead of silently
// refreshing the page. Kept dependency-free: one context, one reducer-ish state.

import { createContext, useCallback, useContext, useRef, useState } from "react";

export type ToastVariant = "victory" | "defeat" | "info" | "gold";

export type Toast = {
  id: number;
  variant: ToastVariant;
  icon: string; // emoji glyph shown in the seal
  title: string;
  body?: string;
  ttl: number; // ms before auto-dismiss
};

type ToastInput = Omit<Toast, "id" | "ttl"> & { ttl?: number };

type ToastContextValue = {
  toasts: Toast[];
  push: (t: ToastInput) => void;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((cur) => cur.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((t: ToastInput) => {
    const id = nextId.current++;
    const ttl = t.ttl ?? 6000;
    // Cap the stack at 4 so a burst of events can't bury the screen.
    setToasts((cur) => [...cur.slice(-3), { ...t, id, ttl }]);
    if (ttl > 0) setTimeout(() => dismiss(id), ttl);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ toasts, push, dismiss }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}
