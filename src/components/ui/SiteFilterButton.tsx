"use client";

import clsx from "clsx";
import type React from "react";
import { useSheet } from "@/hooks/useSheet";

/** Chip showing the page's site filter; opens the site picker. */
export const SiteFilterButton: React.FC<{
  sites: ReadonlyArray<{ id: number; name: string }>;
  siteId: number;
}> = ({ sites, siteId }) => {
  const { openSheet } = useSheet();
  const current = siteId >= 0 ? sites.find((s) => s.id === siteId) : undefined;

  return (
    <button
      type="button"
      onClick={() => openSheet("site")}
      aria-haspopup="dialog"
      aria-label={`Site filter: ${current?.name ?? "All sites"}. Change`}
      className={clsx(
        "flex min-h-10 max-w-full shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition-colors",
        current
          ? "border-amber-500 bg-amber-500 text-slate-950"
          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
      )}
    >
      <span aria-hidden>📍</span>
      <span className="truncate">{current?.name ?? "All sites"}</span>
      <span aria-hidden className="text-[10px]">
        ▼
      </span>
    </button>
  );
};
