"use client";

import clsx from "clsx";
import type React from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { useSheet } from "@/hooks/useSheet";
import { useUrlParams } from "@/hooks/useUrlParams";

/**
 * The site filter of the page that opened it (Persons, Ledgers, Expenses,
 * a passbook): sets that page's ?site= and closes. Each page filters on its own.
 */
export const SitePickerSheet: React.FC<{
  sites?: Array<{ id: number; name: string }>;
}> = ({ sites = [] }) => {
  const { sheet, closeSheet } = useSheet();
  const { searchParams, update } = useUrlParams();

  if (sheet !== "site") return null;

  const raw = searchParams.get("site");
  const currentSiteId = raw && /^\d+$/.test(raw) ? Number(raw) : -1;

  // One navigation both applies the filter and drops ?sheet= (closing it).
  const choose = (siteId: number) => update({ site: siteId, sheet: undefined });

  const option = (id: number, label: string) => {
    const selected = currentSiteId === id;
    return (
      <button
        key={id}
        type="button"
        onClick={() => choose(id)}
        aria-pressed={selected}
        className={clsx(
          "flex min-h-13 w-full cursor-pointer items-center justify-between rounded-2xl border px-4 text-left transition-colors",
          selected
            ? "border-amber-500 bg-amber-50"
            : "border-slate-200 bg-white",
        )}
      >
        <span className="font-semibold text-slate-900">{label}</span>
        <span aria-hidden className="font-bold text-amber-600">
          {selected ? "✓" : ""}
        </span>
      </button>
    );
  };

  return (
    <BottomSheet isOpen onClose={closeSheet} title="Filter by site">
      <div className="space-y-2 pt-1">
        {option(-1, "All sites")}
        {sites.map((s) => option(s.id, s.name))}
      </div>
    </BottomSheet>
  );
};
