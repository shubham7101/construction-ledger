"use client";

import clsx from "clsx";
import type React from "react";
import { useState } from "react";
import { fmt } from "@/lib/format";

/** Shared building blocks for the ledger entry and expense detail sheets. */

const TONES = {
  credit: {
    label: "Credit",
    sign: "+",
    badge: "bg-emerald-500/15 text-emerald-700",
    text: "text-emerald-600",
  },
  debit: {
    label: "Debit",
    sign: "−",
    badge: "bg-red-500/15 text-red-700",
    text: "text-red-600",
  },
  expense: {
    label: "Expense",
    sign: "−",
    badge: "bg-indigo-500/15 text-indigo-700",
    text: "text-indigo-600",
  },
} as const;

export type RecordTone = keyof typeof TONES;

export const DetailHeader: React.FC<{
  tone: RecordTone;
  amount: number;
  title: string;
  subtitle?: React.ReactNode;
}> = ({ tone, amount, title, subtitle }) => {
  const t = TONES[tone];
  return (
    <div className="pb-3 pr-10 text-left">
      <span
        className={clsx(
          "inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider",
          t.badge,
        )}
      >
        {t.label}
      </span>
      <p className={clsx("mt-1.5 text-3xl font-extrabold", t.text)}>
        {t.sign} {fmt(amount)}
      </p>
      <p className="mt-0.5 truncate text-base font-bold text-slate-900">
        {title}
      </p>
      {subtitle}
    </div>
  );
};

export const DetailRows: React.FC<{
  rows: Array<[label: string, value: string]>;
  note?: string;
}> = ({ rows, note }) => (
  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
    <dl className="divide-y divide-slate-200">
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
        >
          <dt className="shrink-0 text-slate-500">{label}</dt>
          <dd className="min-w-0 truncate text-right font-semibold text-slate-900">
            {value}
          </dd>
        </div>
      ))}
    </dl>
    {note && (
      <p className="border-t border-slate-200 px-4 py-2.5 text-sm text-slate-700">
        <span className="block text-xs text-slate-500">Note</span>
        {note}
      </p>
    )}
  </div>
);

export const DetailSkeleton: React.FC = () => (
  <div className="animate-pulse space-y-3">
    <p className="sr-only">Loading…</p>
    <div aria-hidden className="h-5 w-20 rounded-full bg-slate-200" />
    <div aria-hidden className="h-8 w-40 rounded-lg bg-slate-200" />
    <div aria-hidden className="h-36 rounded-2xl bg-slate-100" />
  </div>
);

/**
 * Edit / Delete for the record's owner or an admin (decided on the server).
 * Delete asks for confirmation inline instead of opening another dialog.
 */
export const RecordActions: React.FC<{
  canEdit: boolean;
  noun: string;
  isPending: boolean;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ canEdit, noun, isPending, onEdit, onDelete }) => {
  const [confirming, setConfirming] = useState(false);

  if (!canEdit) {
    return (
      <p className="pt-3 text-center text-xs text-slate-500">
        Only an admin or the person who recorded this {noun} can change it.
      </p>
    );
  }

  if (confirming) {
    return (
      <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3">
        <p className="text-sm font-semibold text-red-700">
          Delete this {noun}? This can’t be undone.
        </p>
        <div className="mt-2.5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={isPending}
            className="min-h-11 cursor-pointer rounded-xl border border-slate-300 bg-white font-bold text-slate-900"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={isPending}
            className="min-h-11 cursor-pointer rounded-xl border-none bg-red-500 font-bold text-white disabled:opacity-50"
          >
            {isPending ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
      <button
        type="button"
        onClick={onEdit}
        className="min-h-12 cursor-pointer rounded-xl border-none bg-amber-500 font-extrabold text-slate-950 hover:bg-amber-600"
      >
        ✎ Edit
      </button>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label={`Delete ${noun}`}
        className="min-h-12 cursor-pointer rounded-xl border border-red-300 bg-white px-5 font-bold text-red-600 hover:bg-red-50"
      >
        🗑 Delete
      </button>
    </div>
  );
};
