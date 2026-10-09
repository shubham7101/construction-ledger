"use client";

import type React from "react";
import { ListSentinel } from "@/components/ui/ListSentinel";
import { FilterBar } from "@/features/filters/FilterBar";
import { useInfiniteList } from "@/hooks/useInfiniteList";
import { useSheet } from "@/hooks/useSheet";
import { displayDate, fmt } from "@/lib/format";
import type { ParsedSearchParams } from "@/lib/params";
import { loadExpensesPageAction } from "@/server/actions/lists";
import type { CurrentUser } from "@/server/auth/jwt";
import type { ExpenseRow, Page } from "@/server/queries/entries";

interface ExpensesListClientProps {
  user: CurrentUser;
  /** First page from the server; the rest load as you scroll. */
  firstPage: Page<ExpenseRow>;
  /** Count and total over every matching expense. */
  summary: { count: number; total: number };
  currentParams: ParsedSearchParams;
}

export const ExpensesListClient: React.FC<ExpensesListClientProps> = ({
  user,
  firstPage,
  summary,
  currentParams,
}) => {
  const { openSheet } = useSheet();

  const isAdmin = user.role === "admin";
  const showAll = isAdmin && currentParams.all;
  const { dm, d1, d2, type, site, category, by, amin, amax } = currentParams;

  const list = useInfiniteList(firstPage, (cursor) =>
    loadExpensesPageAction(
      { site, category, all: showAll, by, type, amin, amax, dm, d1, d2 },
      cursor,
    ),
  );

  return (
    <>
      <FilterBar
        fk="exp"
        isAdmin={isAdmin}
        summary={
          <>
            {summary.count} {summary.count === 1 ? "expense" : "expenses"}
            <span className="block text-sm font-extrabold text-indigo-600">
              Total {fmt(summary.total)}
            </span>
          </>
        }
      />

      {list.items.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">
          No expenses match.
        </p>
      ) : (
        <ul className="space-y-2">
          {list.items.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => openSheet("expense", { id: e.id })}
                className="flex w-full cursor-pointer items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-colors hover:border-slate-300"
              >
                <span className="min-w-0 pr-2">
                  <span className="block truncate font-bold text-slate-900">
                    {e.note || e.category}
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    {e.category} · {e.siteName} · {displayDate(e.date)}
                    {showAll ? ` · by ${e.createdBy.split(" ")[0]}` : ""}
                  </span>
                </span>
                <span className="shrink-0 font-extrabold text-indigo-600">
                  {fmt(e.amount)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <ListSentinel
        sentinelRef={list.sentinelRef}
        hasMore={list.hasMore}
        loading={list.loading}
        failed={list.failed}
        onRetry={list.retry}
      />
    </>
  );
};
