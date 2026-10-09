"use client";

import clsx from "clsx";
import Link from "next/link";
import type React from "react";
import { InactiveBadge } from "@/features/admin/AdminUi";
import { FilterBar } from "@/features/filters/FilterBar";
import { isSheetParam } from "@/hooks/useSheet";
import { useUrlParams } from "@/hooks/useUrlParams";
import { fmt } from "@/lib/format";

interface PersonItem {
  id: number;
  name: string;
  type: string;
  mobile: string;
  active: boolean;
  net: number;
}

export const PersonsListClient: React.FC<{
  persons: PersonItem[];
  isAdmin: boolean;
}> = ({ persons, isAdmin }) => {
  const { searchParams } = useUrlParams();
  // Carry list filters forward, but never an open sheet's params.
  const carryParams = (() => {
    const next = new URLSearchParams(searchParams.toString());
    for (const key of [...next.keys()]) {
      if (isSheetParam(key)) next.delete(key);
    }
    return next.toString();
  })();

  return (
    <section className="space-y-4" aria-label="Persons">
      <FilterBar
        fk="persons"
        isAdmin={isAdmin}
        search={{
          placeholder: "🔍 Search persons",
          ariaLabel: "Search persons by name or mobile",
        }}
      />

      {persons.length === 0 ? (
        <p className="py-10 text-center text-slate-400">No persons found</p>
      ) : (
        <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          {persons.map((p) => {
            const positive = p.net >= 0;
            return (
              <li key={p.id}>
                <Link
                  href={
                    carryParams
                      ? `/persons/${p.id}?${carryParams}`
                      : `/persons/${p.id}`
                  }
                  prefetch={false}
                  className="flex w-full items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-3.5 text-left no-underline shadow-xs transition-all hover:border-amber-300 hover:shadow-md active:scale-[0.99]"
                >
                  <span
                    aria-hidden
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-amber-500/20 bg-amber-500/10 text-base font-extrabold text-amber-700"
                  >
                    {p.name[0]}
                  </span>
                  <span className="min-w-0 flex-1 pr-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-bold text-slate-900">
                        {p.name}
                      </span>
                      {!p.active && <InactiveBadge />}
                    </span>
                    <span className="block truncate text-xs font-medium text-slate-500">
                      +91 {p.mobile}
                    </span>
                    <span className="mt-1 inline-block rounded-md border border-slate-200/60 bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-700">
                      {p.type}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <span
                      className={clsx(
                        "block rounded-full border px-2.5 py-1 text-xs font-bold",
                        positive
                          ? "border-emerald-200/60 bg-emerald-50 text-emerald-700"
                          : "border-red-200/60 bg-red-50 text-red-700",
                      )}
                    >
                      {fmt(Math.abs(p.net))} {positive ? "Credit" : "Debit"}
                    </span>
                    <span aria-hidden className="text-lg text-slate-400">
                      ›
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
