"use client";

import clsx from "clsx";
import type React from "react";
import { useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { useUrlParams } from "@/hooks/useUrlParams";

/**
 * A filter chip backed by one URL param (e.g. ?category=3). Tapping it opens
 * a list to pick from; "All" clears the param.
 */
export const FilterChip: React.FC<{
  /** URL param this chip controls. */
  param: string;
  icon: string;
  /** Label when nothing is picked, e.g. "All categories". */
  allLabel: string;
  title: string;
  options: ReadonlyArray<{ id: number; name: string }>;
  value: number;
}> = ({ param, icon, allLabel, title, options, value }) => {
  const { update } = useUrlParams();
  const [open, setOpen] = useState(false);
  const current = value >= 0 ? options.find((o) => o.id === value) : undefined;

  const choose = (id: number) => {
    setOpen(false);
    update({ [param]: id });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`${title}: ${current?.name ?? allLabel}. Change`}
        className={clsx(
          "flex min-h-10 max-w-full shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition-colors",
          current
            ? "border-amber-500 bg-amber-500 text-slate-950"
            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
        )}
      >
        <span aria-hidden>{icon}</span>
        <span className="max-w-40 truncate">{current?.name ?? allLabel}</span>
        <span aria-hidden className="text-[10px]">
          ▼
        </span>
      </button>

      <BottomSheet isOpen={open} onClose={() => setOpen(false)} title={title}>
        <ul className="max-h-[60dvh] space-y-2 overflow-y-auto pt-1">
          {[{ id: -1, name: allLabel }, ...options].map((o) => {
            const selected = (current?.id ?? -1) === o.id;
            return (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => choose(o.id)}
                  aria-pressed={selected}
                  className={clsx(
                    "flex min-h-12 w-full cursor-pointer items-center justify-between rounded-2xl border px-4 text-left transition-colors",
                    selected
                      ? "border-amber-500 bg-amber-50"
                      : "border-slate-200 bg-white hover:bg-slate-50",
                  )}
                >
                  <span className="truncate font-semibold text-slate-900">
                    {o.name}
                  </span>
                  <span aria-hidden className="font-bold text-amber-600">
                    {selected ? "✓" : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </BottomSheet>
    </>
  );
};
