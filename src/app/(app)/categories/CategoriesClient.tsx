"use client";

import Link from "next/link";
import type React from "react";
import { ListToolbar } from "@/components/ui/ListToolbar";
import { SiteFilterButton } from "@/components/ui/SiteFilterButton";
import { useSheet } from "@/hooks/useSheet";
import { useUrlParams } from "@/hooks/useUrlParams";
import { fmt } from "@/lib/format";
import type { ParsedSearchParams } from "@/lib/params";
import type { CurrentUser } from "@/server/auth/jwt";
import type { CategoryBreakdownRow } from "@/server/queries/categories";

/** Filters carried from this page into a category's drill-down. */
const CARRIED = ["site", "all", "dm", "d1", "d2"] as const;

export const CategoriesClient: React.FC<{
  user: CurrentUser;
  sites: ReadonlyArray<{ id: number; name: string }>;
  breakdown: { grandTotal: number; rows: CategoryBreakdownRow[] };
  currentParams: ParsedSearchParams;
}> = ({ user, sites, breakdown, currentParams }) => {
  const { searchParams, update } = useUrlParams();
  const { openSheet } = useSheet();

  const isAdmin = user.role === "admin";
  const showAll = isAdmin && currentParams.all;

  const carry = new URLSearchParams();
  for (const key of CARRIED) {
    const value = searchParams.get(key);
    if (value) carry.set(key, value);
  }
  const query = carry.toString() ? `?${carry}` : "";

  return (
    <div className="space-y-3 px-4 pb-28 pt-2 md:px-6 lg:px-8">
      <SiteFilterButton sites={sites} siteId={currentParams.site} />
      <ListToolbar
        isAdmin={isAdmin}
        showAll={showAll}
        onShowAllChange={(value) => update({ all: value })}
        onOpenFilter={() => openSheet("filter", { fk: "cat" })}
        activeFilters={currentParams.dm !== "any" ? 1 : 0}
      />

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
          Total across categories
        </p>
        <p className="text-2xl font-extrabold text-amber-600">
          {fmt(breakdown.grandTotal)}
        </p>
        <p className="text-xs text-slate-500">
          Credits, debits and expenses
          {showAll ? " · all users" : " · your entries"}
        </p>
      </section>

      {breakdown.rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white/60 py-10 text-center text-sm text-slate-500">
          No entries in this view yet.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
          {breakdown.rows.map((r) => {
            const percent = Math.round(r.share * 1000) / 10;
            return (
              <li key={r.id}>
                <Link
                  href={`/categories/${r.id}${query}`}
                  className="block rounded-2xl border border-slate-200 bg-white p-4 no-underline shadow-sm transition-colors hover:border-amber-300"
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-bold text-slate-900">
                      {r.name}
                    </span>
                    <span className="shrink-0 font-extrabold text-slate-900">
                      {fmt(r.total)}
                    </span>
                  </span>
                  <span className="mt-2 flex items-center gap-2">
                    <span
                      className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100"
                      role="img"
                      aria-label={`${percent}% of the total`}
                    >
                      <span
                        className="block h-full rounded-full bg-amber-500"
                        style={{ width: `${Math.max(percent, 1)}%` }}
                      />
                    </span>
                    <span className="w-12 shrink-0 text-right text-xs font-bold text-slate-600">
                      {percent}%
                    </span>
                  </span>
                  <span className="mt-1.5 flex flex-wrap gap-x-3 text-xs">
                    {r.credit > 0 && (
                      <span className="text-emerald-700">
                        Credit {fmt(r.credit)}
                      </span>
                    )}
                    {r.debit > 0 && (
                      <span className="text-red-700">Debit {fmt(r.debit)}</span>
                    )}
                    {r.expense > 0 && (
                      <span className="text-indigo-700">
                        Expenses {fmt(r.expense)}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
