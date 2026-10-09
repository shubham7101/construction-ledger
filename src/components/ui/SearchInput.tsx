"use client";

import type React from "react";
import { useEffect, useRef, useState } from "react";
import { useUrlParams } from "@/hooks/useUrlParams";

const SEARCH_DEBOUNCE_MS = 300;

/**
 * A search box backed by one URL param (default ?q=), written after a short
 * pause in typing so each keystroke doesn't trigger a server navigation.
 */
export const SearchInput: React.FC<{
  /** The param's current value from the URL. */
  value: string;
  placeholder: string;
  ariaLabel: string;
  param?: string;
}> = ({ value, placeholder, ariaLabel, param = "q" }) => {
  const { update } = useUrlParams();
  const [q, setQ] = useState(value);
  const lastSent = useRef(value);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Sync from the URL only when it changed from outside (back/forward, clear), not from our own debounce.
  useEffect(() => {
    if (value !== lastSent.current) {
      lastSent.current = value;
      setQ(value);
    }
  }, [value]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const onSearch = (next: string) => {
    setQ(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const trimmed = next.trim();
      lastSent.current = trimmed;
      update({ [param]: trimmed || undefined });
    }, SEARCH_DEBOUNCE_MS);
  };

  return (
    <input
      type="search"
      value={q}
      onChange={(e) => onSearch(e.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className="min-h-13 w-full rounded-2xl border border-slate-200 bg-white px-4 text-slate-900 shadow-sm outline-none focus:border-amber-500"
    />
  );
};
