"use client";

import clsx from "clsx";
import type React from "react";
import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { useUrlParams } from "@/hooks/useUrlParams";
import {
  type PersonOption,
  searchPersonsToFilterAction,
} from "@/server/actions/reference";

const SEARCH_DEBOUNCE_MS = 250;

/**
 * Filter chip for ?person=<id>. Like FilterChip, but persons grow without
 * bound, so the sheet searches them on the server instead of listing all.
 */
export const PersonFilterChip: React.FC<{
  /** ?person, -1 = any. */
  value: number;
  /** The picked person's name, looked up by the page (null = none / unknown). */
  label: string | null;
}> = ({ value, label }) => {
  const { update } = useUrlParams();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PersonOption[] | null>(null);

  useEffect(() => {
    if (!open) return;
    let stale = false;
    const term = query.trim();
    const timer = setTimeout(
      () => {
        searchPersonsToFilterAction(term)
          .then((rows) => {
            if (!stale) setResults(rows);
          })
          .catch(() => {});
      },
      term ? SEARCH_DEBOUNCE_MS : 0,
    );
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [open, query]);

  const picked = value >= 0;
  const text = picked ? (label ?? "One person") : "All persons";

  const choose = (id: number) => {
    setOpen(false);
    setQuery("");
    update({ person: id });
  };

  const options = [
    { id: -1, name: "All persons", mobile: "" },
    ...(results ?? []),
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`Filter by person: ${text}. Change`}
        className={clsx(
          "flex min-h-10 max-w-full shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition-colors",
          picked
            ? "border-amber-500 bg-amber-500 text-slate-950"
            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
        )}
      >
        <span aria-hidden>👤</span>
        <span className="max-w-40 truncate">{text}</span>
        <span aria-hidden className="text-[10px]">
          ▼
        </span>
      </button>

      <BottomSheet
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Filter by person"
      >
        <div className="space-y-2 pt-1">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="🔍 Search name or mobile"
            aria-label="Search persons by name or mobile"
            className="min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-slate-900 outline-none focus:border-amber-500"
          />
          <ul className="max-h-[55dvh] space-y-2 overflow-y-auto">
            {options.map((o) => {
              const selected = (picked ? value : -1) === o.id;
              return (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => choose(o.id)}
                    aria-pressed={selected}
                    className={clsx(
                      "flex min-h-12 w-full cursor-pointer items-center justify-between gap-2 rounded-2xl border px-4 text-left transition-colors",
                      selected
                        ? "border-amber-500 bg-amber-50"
                        : "border-slate-200 bg-white hover:bg-slate-50",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-slate-900">
                        {o.name}
                      </span>
                      {o.mobile && (
                        <span className="block text-xs text-slate-500">
                          +91 {o.mobile}
                        </span>
                      )}
                    </span>
                    <span aria-hidden className="font-bold text-amber-600">
                      {selected ? "✓" : ""}
                    </span>
                  </button>
                </li>
              );
            })}
            {results === null && (
              <li className="py-3 text-center text-sm text-slate-400">
                Loading…
              </li>
            )}
            {results?.length === 0 && (
              <li className="py-3 text-center text-sm text-slate-400">
                No persons found
              </li>
            )}
          </ul>
        </div>
      </BottomSheet>
    </>
  );
};
