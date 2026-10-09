"use client";

import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type React from "react";
import { FilterChip } from "@/components/ui/FilterChip";
import { ListToolbar } from "@/components/ui/ListToolbar";
import { SiteStatusBadge } from "@/components/ui/SiteStatusBadge";
import { FeedList } from "@/features/feed/FeedList";
import { useSheet } from "@/hooks/useSheet";
import { useUrlParams } from "@/hooks/useUrlParams";
import { fmt } from "@/lib/format";
import type { ParsedSearchParams } from "@/lib/params";
import { loadFeedPageAction } from "@/server/actions/lists";
import type { CurrentUser } from "@/server/auth/jwt";
import type { Page } from "@/server/queries/pagination";
import type { FeedItem } from "@/server/queries/sites";

interface SiteDetailClientProps {
  user: CurrentUser;
  detail: {
    site: {
      id: number;
      name: string;
      address: string;
      city: string;
      state: string;
      status: string;
    };
    credit: number;
    /** Ledger debits plus expenses. */
    debit: number;
    expenses: number;
    /** Feed entries matching the filters, across all pages. */
    count: number;
    feed: Page<FeedItem>;
  };
  /** Persons with entries on this site, with their net balance here. */
  people: Array<{ id: number; name: string; net: number }>;
  categories: ReadonlyArray<{ id: number; name: string }>;
  currentParams: ParsedSearchParams;
}

export const SiteDetailClient: React.FC<SiteDetailClientProps> = ({
  user,
  detail,
  people,
  categories,
  currentParams,
}) => {
  const router = useRouter();
  const { update } = useUrlParams();
  const { openSheet } = useSheet();
  const { site } = detail;

  const isAdmin = user.role === "admin";
  const showAll = isAdmin && currentParams.all;
  const { dm, d1, d2, type, category, person, by } = currentParams;
  const activeFilters =
    (dm !== "any" ? 1 : 0) +
    (type && type !== "all" && type !== "All Activity" ? 1 : 0);
  const filtered = category >= 0 || person >= 0;

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
          🏗️
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 font-bold leading-tight text-slate-900">
            <span className="truncate">{site.name}</span>
            <SiteStatusBadge status={site.status} />
          </h1>
          {(site.address || site.city || site.state) && (
            <p className="truncate text-xs text-slate-500">
              {[site.address, site.city, site.state].filter(Boolean).join(", ")}
            </p>
          )}
        </div>
      </header>

      <div className="space-y-3 px-4 pb-28 pt-3 md:px-6 lg:grid lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start lg:gap-6 lg:space-y-0 lg:px-8">
        <div className="space-y-3 lg:sticky lg:top-20">
          <section
            aria-label="Totals"
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              {showAll ? "All users on this site" : "Your entries on this site"}
              {filtered ? " · filtered" : ""}
            </p>
            <dl className="mt-2 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-emerald-50 px-3 py-2.5">
                <dt className="text-xs font-semibold text-emerald-700">
                  Total credit
                </dt>
                <dd className="truncate text-xl font-extrabold text-emerald-600">
                  {fmt(detail.credit)}
                </dd>
              </div>
              <div className="rounded-xl bg-red-50 px-3 py-2.5">
                <dt className="text-xs font-semibold text-red-700">
                  Total debit
                </dt>
                <dd className="truncate text-xl font-extrabold text-red-600">
                  {fmt(detail.debit)}
                </dd>
              </div>
            </dl>
            {detail.expenses > 0 && (
              <p className="mt-2 text-xs text-slate-500">
                Debit includes {fmt(detail.expenses)} of expenses.
              </p>
            )}
            <Link
              href={`/categories?site=${site.id}`}
              className="mt-3 block text-xs font-bold text-amber-600 no-underline hover:text-amber-700"
            >
              Spending by category →
            </Link>
          </section>

          <section
            aria-label="People on this site"
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              People on this site · {people.length}
            </p>
            {people.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">No entries yet.</p>
            ) : (
              <ul className="mt-2 max-h-72 divide-y divide-slate-100 overflow-y-auto">
                {people.map((p) => {
                  const selected = person === p.id;
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() =>
                          update({ person: selected ? undefined : p.id })
                        }
                        aria-pressed={selected}
                        title={
                          selected ? "Show everyone" : `Show only ${p.name}`
                        }
                        className={clsx(
                          "flex min-h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-lg border-none px-2 text-left text-sm",
                          selected
                            ? "bg-amber-50"
                            : "bg-transparent hover:bg-slate-50",
                        )}
                      >
                        <span className="truncate font-semibold text-slate-900">
                          {p.name}
                        </span>
                        <span
                          className={clsx(
                            "shrink-0 font-bold",
                            p.net >= 0 ? "text-emerald-600" : "text-red-600",
                          )}
                        >
                          {fmt(Math.abs(p.net))} {p.net >= 0 ? "Cr" : "Dr"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <section aria-label="Entries" className="min-w-0 space-y-3">
          <div className="flex flex-wrap gap-2">
            <FilterChip
              param="category"
              icon="🏷️"
              allLabel="All categories"
              title="Filter by category"
              options={categories}
              value={category}
            />
            <FilterChip
              param="person"
              icon="👤"
              allLabel="Everyone"
              title="Filter by person"
              options={people}
              value={person}
            />
          </div>

          <ListToolbar
            isAdmin={isAdmin}
            showAll={showAll}
            by={currentParams.by}
            onOpenFilter={() => openSheet("filter", { fk: "site" })}
            activeFilters={activeFilters}
          />

          <p className="px-1 text-xs font-semibold text-slate-500">
            {detail.count} {detail.count === 1 ? "entry" : "entries"}
          </p>

          <FeedList
            first={detail.feed}
            showRecorder={showAll}
            loadPage={(cursor) =>
              loadFeedPageAction(
                site.id,
                { all: showAll, by, type, dm, d1, d2, category, person },
                cursor,
              )
            }
          />
        </section>
      </div>
    </>
  );
};
