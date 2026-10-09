"use client";

import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type React from "react";
import { useTransition } from "react";
import { ListSentinel } from "@/components/ui/ListSentinel";
import { Pill } from "@/components/ui/Pill";
import { toast } from "@/components/ui/Toast";
import { FilterBar } from "@/features/filters/FilterBar";
import { useInfiniteList } from "@/hooks/useInfiniteList";
import { useSheet } from "@/hooks/useSheet";
import { useUrlParams } from "@/hooks/useUrlParams";
import { fmt } from "@/lib/format";
import type { ParsedSearchParams } from "@/lib/params";
import { loadPassbookPageAction } from "@/server/actions/lists";
import { setPersonActiveAction } from "@/server/actions/person";
import type { CurrentUser } from "@/server/auth/jwt";
import type { Page } from "@/server/queries/pagination";
import type { PassbookRow } from "@/server/queries/persons";
import type { EntryType } from "@/types";
import { PassbookEntries } from "./PassbookEntries";

interface PassbookClientProps {
  user: CurrentUser;
  passbook: {
    person: {
      id: number;
      name: string;
      type: string;
      mobile: string;
      mobile2: string;
      email: string;
      address: string;
      active: boolean;
      userId: number | null;
    };
    credit: number;
    debit: number;
    net: number;
    /** Matching entries across all pages. */
    count: number;
    /** First page; the rest load as you scroll. */
    entries: Page<PassbookRow>;
  };
  /** Only the sites this person has entries on. */
  sites: Array<{ id: number; name: string }>;
  /** Site tab in view (?site=, if the person has entries there), else -1. */
  scope: number;
  currentParams: ParsedSearchParams;
}

export const PassbookClient: React.FC<PassbookClientProps> = ({
  user,
  passbook,
  sites,
  scope,
  currentParams,
}) => {
  const router = useRouter();
  const { update } = useUrlParams();
  const { openSheet } = useSheet();
  const [isToggling, startToggle] = useTransition();

  const toggleActive = () => {
    startToggle(async () => {
      const res = await setPersonActiveAction(person.id, !person.active);
      if (res.ok) {
        toast(person.active ? "Person deactivated" : "Person reactivated");
        router.refresh();
      } else {
        toast(res.error || "Could not update person");
      }
    });
  };

  const { person, net } = passbook;
  const isAdmin = user.role === "admin";
  const showAll = isAdmin && currentParams.all;
  const isCreditBalance = net >= 0;
  const { dm, d1, d2, type, by, amin, amax } = currentParams;
  const list = useInfiniteList(passbook.entries, (cursor) =>
    loadPassbookPageAction(
      person.id,
      { site: scope, all: showAll, by, type, amin, amax, dm, d1, d2 },
      cursor,
    ),
  );
  const scopeLabel =
    scope < 0 ? "All sites" : (sites.find((s) => s.id === scope)?.name ?? "");

  // Same Add Ledger form as everywhere else, with person + direction preset
  // (the site in view comes from ?scope).
  const addEntry = (dir: EntryType) =>
    openSheet("add", { k: "ledger", pid: person.id, dir });

  const shareText = `Hi ${person.name}, your ledger balance${
    scope < 0 ? "" : ` for ${scopeLabel}`
  } is ${fmt(net)} (${isCreditBalance ? "credit" : "debit"} balance).`;

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
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-amber-500/20 bg-amber-500/10 font-extrabold text-amber-700"
        >
          {person.name[0]}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-bold leading-tight text-slate-900">
            {person.name}
          </h1>
          <p className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className="rounded bg-slate-100 px-1.5 py-px text-[10px] font-bold uppercase tracking-wider text-slate-600">
              {person.type}
            </span>
            <a
              href={`tel:+91${person.mobile}`}
              className="truncate text-slate-500 no-underline hover:text-slate-700"
            >
              +91 {person.mobile}
            </a>
          </p>
        </div>
        {isAdmin && person.userId && (
          <Link
            href={`/admin/users/${person.userId}`}
            aria-label="Open user account"
            title="User account"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-slate-200 bg-white text-sm no-underline hover:bg-slate-50"
          >
            🔑
          </Link>
        )}
        <a
          href={`https://wa.me/91${person.mobile}?text=${encodeURIComponent(shareText)}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Share balance on WhatsApp"
          title="Share on WhatsApp"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-500 text-sm no-underline hover:bg-emerald-600"
        >
          💬
        </a>
      </header>

      <div className="space-y-3 px-4 pb-28 pt-3 md:px-6 md:pb-12 lg:grid lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start lg:gap-6 lg:space-y-0 lg:px-8">
        <div className="space-y-3 lg:sticky lg:top-20">
          {!person.active && (
            <p className="rounded-2xl border border-slate-300 bg-slate-100 px-4 py-3 text-sm text-slate-700">
              <span className="font-bold">Inactive.</span> This person is hidden
              from lists and can’t get new entries. Past entries are kept.
            </p>
          )}

          <section
            aria-label="Contact"
            className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-sm"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Contact
              </p>
              <div className="flex gap-2">
                {isAdmin && (
                  <button
                    type="button"
                    onClick={toggleActive}
                    disabled={isToggling}
                    className={clsx(
                      "min-h-9 cursor-pointer rounded-lg border bg-white px-3 text-xs font-bold disabled:opacity-50",
                      person.active
                        ? "border-red-200 text-red-600 hover:bg-red-50"
                        : "border-emerald-300 text-emerald-700 hover:bg-emerald-50",
                    )}
                  >
                    {person.active ? "Deactivate" : "Reactivate"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    openSheet("add", { k: "person", ed: person.id })
                  }
                  className="min-h-9 cursor-pointer rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 hover:bg-slate-50"
                >
                  ✎ Edit
                </button>
              </div>
            </div>
            <dl className="space-y-1.5">
              {[
                ["Mobile", `+91 ${person.mobile}`],
                ["2nd mobile", person.mobile2 ? `+91 ${person.mobile2}` : ""],
                ["Email", person.email],
                ["Address", person.address],
              ]
                .filter(([, value]) => value)
                .map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-3">
                    <dt className="shrink-0 text-slate-500">{label}</dt>
                    <dd className="min-w-0 text-right font-semibold break-words text-slate-900">
                      {value}
                    </dd>
                  </div>
                ))}
            </dl>
          </section>

          <section
            aria-label="Balance"
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Net balance
              </p>
              <p className="truncate pl-2 text-xs font-semibold text-slate-500">
                {scopeLabel}
              </p>
            </div>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
              <p
                className={clsx(
                  "text-3xl font-extrabold",
                  isCreditBalance ? "text-emerald-600" : "text-red-600",
                )}
              >
                {fmt(net)}
              </p>
              <span
                className={clsx(
                  "rounded-full px-2 py-0.5 text-[11px] font-bold",
                  isCreditBalance
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-red-50 text-red-700",
                )}
              >
                {isCreditBalance ? "Credit balance" : "Debit balance"}
              </span>
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl bg-emerald-50 px-3 py-2">
                <dt className="text-emerald-700">Total credit</dt>
                <dd className="font-bold text-emerald-700">
                  {fmt(passbook.credit)}
                </dd>
              </div>
              <div className="rounded-xl bg-red-50 px-3 py-2">
                <dt className="text-red-700">Total debit</dt>
                <dd className="font-bold text-red-700">
                  {fmt(passbook.debit)}
                </dd>
              </div>
            </dl>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => addEntry("credit")}
                disabled={!person.active}
                className="min-h-10 cursor-pointer rounded-xl border-none bg-emerald-500 text-sm font-bold text-slate-950 hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                + Credit
              </button>
              <button
                type="button"
                onClick={() => addEntry("debit")}
                disabled={!person.active}
                className="min-h-10 cursor-pointer rounded-xl border-none bg-red-500 text-sm font-bold text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                − Debit
              </button>
            </div>
          </section>
        </div>

        <section aria-label="Entries" className="min-w-0 space-y-3">
          {sites.length > 0 && (
            <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible">
              <Pill
                label="All sites"
                active={scope < 0}
                onClick={() => update({ site: undefined })}
              />
              {sites.map((s) => (
                <Pill
                  key={s.id}
                  label={s.name}
                  active={scope === s.id}
                  onClick={() => update({ site: s.id })}
                />
              ))}
            </div>
          )}

          <FilterBar
            fk="pass"
            isAdmin={isAdmin}
            summary={`${passbook.count} ${passbook.count === 1 ? "entry" : "entries"}`}
          />

          <PassbookEntries
            entries={list.items}
            showRecorder={showAll}
            onOpen={(id) => openSheet("entry", { id })}
          />
          <ListSentinel
            sentinelRef={list.sentinelRef}
            hasMore={list.hasMore}
            loading={list.loading}
            failed={list.failed}
            onRetry={list.retry}
          />
        </section>
      </div>
    </>
  );
};
