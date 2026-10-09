"use client";

import clsx from "clsx";
import type React from "react";
import { SearchInput } from "@/components/ui/SearchInput";
import { useSheet } from "@/hooks/useSheet";
import { useUrlParams } from "@/hooks/useUrlParams";
import type { FilterKey } from "@/types";
import { activeChips, paramsFor } from "./config";
import { useFilterNames } from "./useFilterNames";

/**
 * A list page's filter controls in one row, so the list starts high on a
 * phone: a search box (or a summary such as "129 entries") and a Filters
 * button that opens the page's Filters sheet. Applied filters show below as
 * removable chips, only when there are any.
 */
export const FilterBar: React.FC<{
  fk: FilterKey;
  isAdmin: boolean;
  /** Search box backed by ?q; omit on pages without search. */
  search?: { placeholder: string; ariaLabel: string };
  /** Shown left of the button when there's no search box. */
  summary?: React.ReactNode;
  /** The picked person's name, looked up by the page. */
  personName?: string | null;
}> = ({ fk, isAdmin, search, summary, personName = null }) => {
  const { searchParams, update } = useUrlParams();
  const { openSheet } = useSheet();

  const num = (key: string) => Number(searchParams.get(key) ?? -1);
  const names = useFilterNames({
    reference: num("site") >= 0 || num("category") >= 0,
    users: isAdmin && num("by") >= 0,
  });
  const chips = activeChips(fk, isAdmin, searchParams, {
    ...names,
    person: personName,
  });

  const clearAll = () =>
    update(
      Object.fromEntries(paramsFor(fk, isAdmin).map((p) => [p, undefined])),
    );

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {search ? (
          <div className="min-w-0 flex-1">
            <SearchInput
              value={searchParams.get("q") ?? ""}
              placeholder={search.placeholder}
              ariaLabel={search.ariaLabel}
            />
          </div>
        ) : (
          <div className="min-w-0 flex-1 px-1 text-xs font-semibold text-slate-500">
            {summary}
          </div>
        )}
        <button
          type="button"
          onClick={() => openSheet("filter", { fk })}
          aria-haspopup="dialog"
          aria-label={
            chips.length > 0
              ? `Filters, ${chips.length} applied. Change`
              : "Filters"
          }
          className={clsx(
            "flex shrink-0 cursor-pointer items-center gap-1.5 rounded-2xl border px-4 text-sm font-bold shadow-sm transition-colors",
            search ? "min-h-13" : "min-h-11",
            chips.length > 0
              ? "border-amber-500 bg-amber-500 text-slate-950"
              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
          )}
        >
          <span aria-hidden>⚙</span>
          Filters
          {chips.length > 0 && (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-slate-950 px-1 text-[11px] text-white">
              {chips.length}
            </span>
          )}
        </button>
      </div>

      {chips.length > 0 && (
        <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => update(chip.clear)}
              aria-label={`Remove filter: ${chip.label}`}
              className="flex min-h-8 max-w-60 shrink-0 cursor-pointer items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-3 text-xs font-semibold text-amber-900 hover:bg-amber-100"
            >
              <span className="truncate">{chip.label}</span>
              <span aria-hidden className="text-amber-700">
                ✕
              </span>
            </button>
          ))}
          {chips.length > 1 && (
            <button
              type="button"
              onClick={clearAll}
              className="min-h-8 shrink-0 cursor-pointer rounded-full px-2 text-xs font-bold text-slate-500 hover:text-slate-900"
            >
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  );
};
