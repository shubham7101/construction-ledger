"use client";

import { useRouter } from "next/navigation";
import type React from "react";
import { ListToolbar } from "@/components/ui/ListToolbar";
import { FeedList } from "@/features/feed/FeedList";
import { useSheet } from "@/hooks/useSheet";
import { fmt } from "@/lib/format";
import type { ParsedSearchParams } from "@/lib/params";
import { loadFeedPageAction } from "@/server/actions/lists";
import type { CurrentUser } from "@/server/auth/jwt";
import type { Page } from "@/server/queries/pagination";
import type { FeedItem } from "@/server/queries/sites";

export const CategoryDetailClient: React.FC<{
  user: CurrentUser;
  summary: {
    category: { id: number; name: string };
    credit: number;
    debit: number;
    expense: number;
  };
  feed: Page<FeedItem>;
  /** -1 = all sites. */
  siteId: number;
  siteName: string | null;
  currentParams: ParsedSearchParams;
}> = ({ user, summary, feed, siteId, siteName, currentParams }) => {
  const router = useRouter();
  const { openSheet } = useSheet();

  const isAdmin = user.role === "admin";
  const showAll = isAdmin && currentParams.all;
  const { dm, d1, d2, by } = currentParams;
  const categoryId = summary.category.id;

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/95 px-3 py-2.5 backdrop-blur md:px-6">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Back"
          className="grid h-10 min-h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-full border-none bg-transparent text-xl text-slate-700 hover:bg-slate-100"
        >
          ←
        </button>
        <span
          aria-hidden
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-lg"
        >
          🏷️
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-bold leading-tight text-slate-900">
            {summary.category.name}
          </h1>
          <p className="truncate text-xs text-slate-500">
            {siteName ?? "All sites"}
          </p>
        </div>
      </header>

      <div className="space-y-3 px-4 pb-28 pt-3 md:px-6 lg:grid lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start lg:gap-6 lg:space-y-0 lg:px-8">
        <section
          aria-label="Totals"
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-20"
        >
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            {showAll ? "All users" : "Your entries"}
          </p>
          <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-emerald-50 px-2 py-2">
              <dt className="text-[11px] font-semibold text-emerald-700">
                Credit
              </dt>
              <dd className="truncate font-extrabold text-emerald-600">
                {fmt(summary.credit)}
              </dd>
            </div>
            <div className="rounded-xl bg-red-50 px-2 py-2">
              <dt className="text-[11px] font-semibold text-red-700">Debit</dt>
              <dd className="truncate font-extrabold text-red-600">
                {fmt(summary.debit)}
              </dd>
            </div>
            <div className="rounded-xl bg-indigo-50 px-2 py-2">
              <dt className="text-[11px] font-semibold text-indigo-700">
                Expenses
              </dt>
              <dd className="truncate font-extrabold text-indigo-600">
                {fmt(summary.expense)}
              </dd>
            </div>
          </dl>
        </section>

        <section aria-label="Entries" className="min-w-0 space-y-3">
          <ListToolbar
            isAdmin={isAdmin}
            showAll={showAll}
            by={currentParams.by}
            onOpenFilter={() => openSheet("filter", { fk: "cat" })}
            activeFilters={dm !== "any" ? 1 : 0}
          />
          <FeedList
            first={feed}
            showRecorder={showAll}
            showSite={siteId < 0}
            emptyText="Nothing in this category yet."
            loadPage={(cursor) =>
              loadFeedPageAction(
                siteId,
                { all: showAll, by, dm, d1, d2, category: categoryId },
                cursor,
              )
            }
          />
        </section>
      </div>
    </>
  );
};
