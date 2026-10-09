"use client";

import Link from "next/link";
import type React from "react";
import { FilterBar } from "@/features/filters/FilterBar";
import { useUrlParams } from "@/hooks/useUrlParams";
import { fmt } from "@/lib/format";
import type { ParsedSearchParams } from "@/lib/params";
import type { CurrentUser } from "@/server/auth/jwt";
import type { CategoryBreakdownRow } from "@/server/queries/categories";

/** Filters carried from this page into a category's drill-down. */
const CARRIED = ["site", "all", "by", "dm", "d1", "d2"] as const;

export const CategoriesClient: React.FC<{
  user: CurrentUser;
  breakdown: {
    spentTotal: number;
    receivedTotal: number;
    rows: CategoryBreakdownRow[];
  };
  currentParams: ParsedSearchParams;
}> = ({ user, breakdown, currentParams }) => {
  const { searchParams } = useUrlParams();

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
      <FilterBar fk="cat" isAdmin={isAdmin} />

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <dl className="grid grid-cols-2 gap-3">
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Spent
            </dt>
            <dd className="text-2xl font-extrabold text-red-600">
              {fmt(breakdown.spentTotal)}
            </dd>
            <dd className="text-xs text-slate-500">Debits + expenses</dd>
          </div>
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Received
            </dt>
            <dd className="text-2xl font-extrabold text-emerald-600">
              {fmt(breakdown.receivedTotal)}
            </dd>
            <dd className="text-xs text-slate-500">Credits</dd>
          </div>
        </dl>
        <p className="mt-2 text-xs text-slate-500">
          {showAll ? "All users' entries" : "Your entries"} · categories are
          ranked by spending
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
                      {fmt(r.spent)}
                    </span>
                  </span>
                  <span className="mt-2 flex items-center gap-2">
                    <span
                      className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100"
                      role="img"
                      aria-label={`${percent}% of all spending`}
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
                    {r.debit > 0 && (
                      <span className="text-red-700">Debit {fmt(r.debit)}</span>
                    )}
                    {r.expense > 0 && (
                      <span className="text-indigo-700">
                        Expenses {fmt(r.expense)}
                      </span>
                    )}
                    {r.credit > 0 && (
                      <span className="text-emerald-700">
                        Received {fmt(r.credit)}
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
