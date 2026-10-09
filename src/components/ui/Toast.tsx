"use client";

import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

const TOAST_EVENT = "khata:toast";
const DURATION_MS = 2800;

/** Show a toast from anywhere; routed through the provider so only one toast UI exists. */
export const toast = (message: string) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<string>(TOAST_EVENT, { detail: message }),
  );
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const showToast = useCallback((next: string) => {
    clearTimeout(timer.current);
    setMessage(next);
    timer.current = setTimeout(() => setMessage(null), DURATION_MS);
  }, []);

  useEffect(() => {
    const onToast = (e: Event) => showToast((e as CustomEvent<string>).detail);
    window.addEventListener(TOAST_EVENT, onToast);
    return () => {
      window.removeEventListener(TOAST_EVENT, onToast);
      clearTimeout(timer.current);
    };
  }, [showToast]);

  return (
    <>
      {children}
      {message && (
        <output
          aria-live="polite"
          className="toast fixed bottom-24 left-1/2 z-100 max-w-[90vw] -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg md:bottom-8"
        >
          {message}
        </output>
      )}
    </>
  );
};
