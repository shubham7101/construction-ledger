"use client";

import clsx from "clsx";
import type React from "react";
import { memo } from "react";
import { FilterChip } from "@/components/ui/FilterChip";
import { ListSentinel } from "@/components/ui/ListSentinel";
import { ListToolbar } from "@/components/ui/ListToolbar";
import { SiteFilterButton } from "@/components/ui/SiteFilterButton";
import { useInfiniteList } from "@/hooks/useInfiniteList";
import { useSheet } from "@/hooks/useSheet";
import { useUrlParams } from "@/hooks/useUrlParams";
import { displayDate, fmt } from "@/lib/format";
import { modeLabel } from "@/lib/labels";
import type { ParsedSearchParams } from "@/lib/params";
import { loadLedgersPageAction } from "@/server/actions/lists";
import type { CurrentUser } from "@/server/auth/jwt";
import type { LedgerRow, Page } from "@/server/queries/entries";

interface LedgersListClientProps {
  user: CurrentUser;
  /** First page from the server; the rest load as you scroll. */
  firstPage: Page<LedgerRow>;
  /** Count and totals over every matching entry, not just the loaded ones. */
  summary: { count: number; credit: number; debit: number };
  sites: ReadonlyArray<{ id: number; name: string }>;
  categories: ReadonlyArray<{ id: number; name: string }>;
  currentParams: ParsedSearchParams;
}

const firstName = (name: string) => name.split(" ")[0] ?? "";

const LedgerCard = memo(function LedgerCard({
  entry,
  onOpen,
}: {
  entry: LedgerRow;
  onOpen: (entry: LedgerRow) => void;
}) {
  const isCredit = entry.type === "credit";
  return (
    <button
      type="button"
      onClick={() => onOpen(entry)}
      className="flex w-full cursor-pointer items-center justify-between rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm transition-colors hover:border-amber-300"
    >
      <span className="min-w-0 pr-2">
        <span className="block truncate text-sm font-bold text-slate-900">
          {entry.personName}
        </span>
        <span className="block truncate text-xs text-slate-500">
          {displayDate(entry.date)} · {entry.siteName ?? "No site"}
          {entry.createdBy ? ` · ${firstName(entry.createdBy)}` : ""}
        </span>
      </span>
      <span
        className={clsx(
          "shrink-0 font-extrabold",
          isCredit ? "text-emerald-600" : "text-red-600",
        )}
      >
        {isCredit ? "+" : "−"} {fmt(entry.amount)}
      </span>
    </button>
  );
});

export const LedgersListClient: React.FC<LedgersListClientProps> = ({
  user,
  firstPage,
  summary,
  sites,
  categories,
  currentParams,
}) => {
  const { update } = useUrlParams();
  const { openSheet } = useSheet();

  const isAdmin = user.role === "admin";
  const showAll = isAdmin && currentParams.all;

  const activeFilters =
    (currentParams.dm && currentParams.dm !== "any" ? 1 : 0) +
    (currentParams.type && currentParams.type.toLowerCase() !== "all" ? 1 : 0);

  const { dm, d1, d2, type, site, category } = currentParams;
  const list = useInfiniteList(firstPage, (cursor) =>
    loadLedgersPageAction(
      { site, category, all: showAll, type, dm, d1, d2 },
      cursor,
    ),
  );
  const entries = list.items;

  const open = (e: LedgerRow) => openSheet("entry", { id: e.id });

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <SiteFilterButton sites={sites} siteId={currentParams.site} />
        <FilterChip
          param="category"
          icon="🏷️"
          allLabel="All categories"
          title="Filter by category"
          options={categories}
          value={currentParams.category}
        />
      </div>

      <ListToolbar
        isAdmin={isAdmin}
        showAll={showAll}
        onShowAllChange={(value) => update({ all: value })}
        onOpenFilter={() => openSheet("filter", { fk: "ledgers" })}
        activeFilters={activeFilters}
      />

      <p className="px-1 text-xs font-semibold text-slate-500">
        {summary.count} {summary.count === 1 ? "entry" : "entries"}
      </p>

      {entries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 py-12 text-center">
          <p className="text-2xl" aria-hidden>
            📒
          </p>
          <p className="mt-2 text-sm font-semibold text-slate-600">
            No entries
          </p>
          <p className="text-xs text-slate-400">Try clearing the filters.</p>
        </div>
      ) : (
        <>
          {/* phone + tablet: cards */}
          <ul className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:hidden">
            {entries.map((e) => (
              <li key={e.id}>
                <LedgerCard entry={e} onOpen={open} />
              </li>
            ))}
          </ul>

          {/* laptop: table */}
          <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:block">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-3 py-3">Person</th>
                  <th className="px-3 py-3">Site</th>
                  <th className="px-3 py-3">Category</th>
                  <th className="px-3 py-3">Mode</th>
                  {showAll && <th className="px-3 py-3">By</th>}
                  <th className="px-3 py-3 text-right">Credit</th>
                  <th className="px-4 py-3 text-right">Debit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entries.map((e) => {
                  const isCredit = e.type === "credit";
                  return (
                    <tr
                      key={e.id}
                      onClick={() => open(e)}
                      className="cursor-pointer transition-colors hover:bg-amber-50/60"
                    >
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            open(e);
                          }}
                          className="min-h-0 cursor-pointer border-none bg-transparent p-0 font-semibold text-slate-900"
                        >
                          {displayDate(e.date)}
                        </button>
                      </td>
                      <td className="px-3 py-3 font-semibold text-slate-900">
                        {e.personName}
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        {e.siteName ?? "No site"}
                      </td>
                      <td className="px-3 py-3 text-slate-600">{e.category}</td>
                      <td className="px-3 py-3 text-slate-600">
                        {modeLabel(e.mode)}
                      </td>
                      {showAll && (
                        <td className="px-3 py-3 text-slate-600">
                          {e.createdBy}
                        </td>
                      )}
                      <td className="px-3 py-3 text-right font-bold text-emerald-600">
                        {isCredit ? fmt(e.amount) : ""}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-red-600">
                        {isCredit ? "" : fmt(e.amount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 border-slate-200 bg-slate-50 text-sm font-extrabold">
                <tr>
                  <td
                    colSpan={showAll ? 6 : 5}
                    className="px-4 py-3 text-slate-600"
                  >
                    Total ({summary.count})
                  </td>
                  <td className="px-3 py-3 text-right text-emerald-600">
                    {fmt(summary.credit)}
                  </td>
                  <td className="px-4 py-3 text-right text-red-600">
                    {fmt(summary.debit)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <ListSentinel
            sentinelRef={list.sentinelRef}
            hasMore={list.hasMore}
            loading={list.loading}
            failed={list.failed}
            onRetry={list.retry}
          />
        </>
      )}
    </>
  );
};
