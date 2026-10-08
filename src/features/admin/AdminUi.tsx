"use client";

import clsx from "clsx";
import Link from "next/link";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Segmented } from "@/components/ui/Segmented";
import { useUrlParams } from "@/hooks/useUrlParams";

/** Shared pieces of the admin Sites / Users / Categories screens. */

export const INPUT_CLASS =
  "min-h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-slate-900 shadow-sm outline-none focus:border-amber-500";

export const AdminHeader: React.FC<{
  title: string;
  subtitle?: string;
  backHref?: string;
  addLabel?: string;
  onAdd?: () => void;
}> = ({ title, subtitle, backHref = "/admin", addLabel, onAdd }) => (
  <div className="flex items-center gap-2">
    <Link
      href={backHref}
      aria-label="Back"
      className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-2xl text-slate-700 no-underline hover:bg-slate-100"
    >
      ←
    </Link>
    <div className="min-w-0 flex-1">
      <h1 className="truncate text-xl font-extrabold text-slate-900">
        {title}
      </h1>
      {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
    </div>
    {onAdd && (
      <button
        type="button"
        onClick={onAdd}
        className="min-h-10 shrink-0 cursor-pointer rounded-full border-none bg-amber-500 px-4 text-sm font-bold text-slate-950 hover:bg-amber-600"
      >
        + {addLabel ?? "Add"}
      </button>
    )}
  </div>
);

const STATUS_OPTIONS = [
  ["active", "Active"],
  ["inactive", "Inactive"],
  ["all", "All"],
] as const;

const SORT_OPTIONS = [
  ["az", "Name A–Z"],
  ["za", "Name Z–A"],
  ["newest", "Newest first"],
  ["oldest", "Oldest first"],
] as const;

type Status = (typeof STATUS_OPTIONS)[number][0];

const SEARCH_DEBOUNCE_MS = 300;

/**
 * Search + status filter (default Active) + sort, all kept in the URL so the
 * server renders the filtered list and Back / reload keep the view.
 */
export const AdminListControls: React.FC<{
  status: string;
  sort: string;
  q: string;
  searchPlaceholder: string;
}> = ({ status, sort, q, searchPlaceholder }) => {
  const { update } = useUrlParams();
  const [term, setTerm] = useState(q);
  const lastSent = useRef(q);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Follow the URL when it changes from outside (Back, clear), not from our own typing.
  useEffect(() => {
    if (q !== lastSent.current) {
      lastSent.current = q;
      setTerm(q);
    }
  }, [q]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const onSearch = (value: string) => {
    setTerm(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const next = value.trim();
      lastSent.current = next;
      update({ q: next || undefined });
    }, SEARCH_DEBOUNCE_MS);
  };

  return (
    <div className="space-y-2">
      <input
        type="search"
        value={term}
        onChange={(e) => onSearch(e.target.value)}
        placeholder={`🔍 ${searchPlaceholder}`}
        aria-label={searchPlaceholder}
        className={INPUT_CLASS}
      />
      <div className="flex items-center gap-2">
        <Segmented<Status>
          ariaLabel="Status"
          options={STATUS_OPTIONS}
          value={(status as Status) || "active"}
          onChange={(s) => update({ status: s === "active" ? undefined : s })}
          className="min-w-0 flex-1"
        />
        <label className="shrink-0">
          <span className="sr-only">Sort by</span>
          <select
            value={
              sort === "za" || sort === "newest" || sort === "oldest"
                ? sort
                : "az"
            }
            onChange={(e) =>
              update({
                sort: e.target.value === "az" ? undefined : e.target.value,
              })
            }
            className="min-h-12 cursor-pointer rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm outline-none focus:border-amber-500"
          >
            {SORT_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
};

export const InactiveBadge: React.FC = () => (
  <span className="rounded bg-slate-200 px-1.5 py-px text-[10px] font-bold uppercase tracking-wider text-slate-600">
    Inactive
  </span>
);

/** One tappable list row. */
export const AdminRow: React.FC<{
  title: string;
  subtitle?: React.ReactNode;
  active: boolean;
  badge?: React.ReactNode;
  href?: string;
  onClick?: () => void;
}> = ({ title, subtitle, active, badge, href, onClick }) => {
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span
            className={clsx(
              "truncate font-bold",
              active ? "text-slate-900" : "text-slate-500",
            )}
          >
            {title}
          </span>
          {badge}
          {!active && <InactiveBadge />}
        </span>
        {subtitle && (
          <span className="mt-0.5 block truncate text-xs text-slate-500">
            {subtitle}
          </span>
        )}
      </span>
      <span aria-hidden className="text-xl text-slate-400">
        ›
      </span>
    </>
  );
  const className = clsx(
    "flex w-full cursor-pointer items-center gap-3 rounded-2xl border p-4 text-left no-underline shadow-sm transition-colors hover:border-amber-300",
    active
      ? "border-slate-200 bg-white"
      : "border-dashed border-slate-300 bg-slate-50",
  );
  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={className}>
      {body}
    </button>
  );
};

export const EmptyList: React.FC<{ status: string; noun: string }> = ({
  status,
  noun,
}) => (
  <p className="rounded-2xl border border-dashed border-slate-300 bg-white/60 py-10 text-center text-sm text-slate-500">
    {status === "inactive" ? `No inactive ${noun}` : `No ${noun} found`}
  </p>
);

/**
 * Create / edit form in a bottom sheet. When editing, a secondary button
 * deactivates (soft delete) or reactivates the record.
 */
export const AdminFormSheet: React.FC<{
  isOpen: boolean;
  title: string;
  onClose: () => void;
  onSubmit: () => void;
  isPending: boolean;
  submitLabel: string;
  /** Present when editing an existing record. */
  activeToggle?: {
    active: boolean;
    onToggle: () => void;
    /** Reason the toggle is unavailable (e.g. your own account). */
    disabledReason?: string;
  };
  children: React.ReactNode;
}> = ({
  isOpen,
  title,
  onClose,
  onSubmit,
  isPending,
  submitLabel,
  activeToggle,
  children,
}) => (
  <BottomSheet isOpen={isOpen} onClose={onClose} title={title}>
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="space-y-2.5 pt-1"
    >
      {children}
      <button
        type="submit"
        disabled={isPending}
        className="min-h-12 w-full cursor-pointer rounded-xl border-none bg-amber-500 text-base font-extrabold text-slate-950 hover:bg-amber-600 disabled:opacity-50"
      >
        {isPending ? "Saving…" : submitLabel}
      </button>
      {activeToggle &&
        (activeToggle.disabledReason ? (
          <p className="pt-1 text-center text-xs text-slate-500">
            {activeToggle.disabledReason}
          </p>
        ) : (
          <button
            type="button"
            onClick={activeToggle.onToggle}
            disabled={isPending}
            className={clsx(
              "min-h-11 w-full cursor-pointer rounded-xl border bg-white text-sm font-bold disabled:opacity-50",
              activeToggle.active
                ? "border-red-300 text-red-600 hover:bg-red-50"
                : "border-emerald-300 text-emerald-700 hover:bg-emerald-50",
            )}
          >
            {activeToggle.active ? "Deactivate" : "Reactivate"}
          </button>
        ))}
    </form>
  </BottomSheet>
);
