"use client";

import clsx from "clsx";
import type React from "react";
import { ListSentinel } from "@/components/ui/ListSentinel";
import { type PageData, useInfiniteList } from "@/hooks/useInfiniteList";
import { useSheet } from "@/hooks/useSheet";
import { displayDate, fmt } from "@/lib/format";
import type { FeedItem } from "@/server/queries/sites";

/**
 * The mixed ledger + expense list (site details, category drill-down) with
 * infinite scroll. Rows open the entry / expense detail sheets.
 */
export const FeedList: React.FC<{
  first: PageData<FeedItem>;
  loadPage: (cursor: string) => Promise<PageData<FeedItem>>;
  /** Show who recorded each row (when viewing all users). */
  showRecorder: boolean;
  /** Show each row's site (feeds spanning several sites). */
  showSite?: boolean;
  emptyText?: string;
}> = ({
  first,
  loadPage,
  showRecorder,
  showSite = false,
  emptyText = "No entries match these filters.",
}) => {
  const { openSheet } = useSheet();
  const list = useInfiniteList(first, loadPage);

  const meta = (o: FeedItem) =>
    [
      displayDate(o.date),
      showSite ? (o.siteName ?? "No site") : null,
      o.category,
      showRecorder ? `by ${o.createdBy.split(" ")[0]}` : null,
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <>
      {list.items.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">{emptyText}</p>
      ) : (
        <ul className="space-y-2">
          {list.items.map((o) => {
            const isLedger = o.k === "L";
            const isCredit = isLedger && o.type === "credit";
            return (
              <li key={`${o.k}-${o.id}`}>
                <button
                  type="button"
                  onClick={() =>
                    openSheet(isLedger ? "entry" : "expense", { id: o.id })
                  }
                  className="flex w-full cursor-pointer items-center justify-between rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm transition-colors hover:border-slate-300"
                >
                  <span className="min-w-0 pr-2">
                    <span className="block truncate text-sm font-bold text-slate-900">
                      {isLedger ? o.personName : o.note || o.category}
                      {!isLedger && (
                        <span className="ml-1.5 rounded bg-indigo-500/15 px-1.5 py-0.5 align-middle text-[10px] text-indigo-600">
                          EXPENSE
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {meta(o)}
                    </span>
                  </span>
                  <span
                    className={clsx(
                      "shrink-0 font-extrabold",
                      !isLedger
                        ? "text-indigo-600"
                        : isCredit
                          ? "text-emerald-600"
                          : "text-red-600",
                    )}
                  >
                    {isCredit ? "+" : "−"} {fmt(o.amount)}
                  </span>
                </button>
              </li>
            );
          })}
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
