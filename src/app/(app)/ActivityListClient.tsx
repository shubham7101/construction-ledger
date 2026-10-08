"use client";

import clsx from "clsx";
import type React from "react";
import { memo } from "react";
import { useSheet } from "@/hooks/useSheet";
import { fmt } from "@/lib/format";

interface ActivityItem {
  /** L = ledger entry, E = expense. */
  k: "L" | "E";
  id: number;
  title: string;
  type: "credit" | "debit";
  amount: number;
  date: string;
  siteName: string;
}

const TONES = {
  credit: {
    icon: "↗️",
    badge: "border-emerald-100 bg-emerald-50 text-emerald-600",
    amount: "border-emerald-200/60 bg-emerald-50 text-emerald-700",
  },
  debit: {
    icon: "↙️",
    badge: "border-red-100 bg-red-50 text-red-600",
    amount: "border-red-200/60 bg-red-50 text-red-700",
  },
  expense: {
    icon: "🧾",
    badge: "border-indigo-100 bg-indigo-50 text-indigo-600",
    amount: "border-indigo-200/60 bg-indigo-50 text-indigo-700",
  },
} as const;

const ActivityRow = memo(function ActivityRow({
  entry,
  onOpen,
}: {
  entry: ActivityItem;
  onOpen: (entry: ActivityItem) => void;
}) {
  const isExpense = entry.k === "E";
  const tone = TONES[isExpense ? "expense" : entry.type];
  return (
    <button
      type="button"
      onClick={() => onOpen(entry)}
      className="flex w-full cursor-pointer items-center justify-between rounded-2xl border border-slate-200/80 bg-white p-3.5 text-left shadow-xs transition-all hover:border-amber-300 hover:shadow-md active:scale-[0.99]"
    >
      <span className="flex min-w-0 items-center gap-3 pr-2">
        <span
          aria-hidden
          className={clsx(
            "grid h-10 w-10 shrink-0 place-items-center rounded-xl border text-sm font-bold",
            tone.badge,
          )}
        >
          {tone.icon}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-slate-900">
            {entry.title}
          </span>
          <span className="mt-0.5 block truncate text-[11px] font-medium text-slate-500">
            {isExpense
              ? "Expense"
              : entry.type === "credit"
                ? "Credit"
                : "Debit"}{" "}
            · {entry.date} · {entry.siteName}
          </span>
        </span>
      </span>
      <span
        className={clsx(
          "inline-block shrink-0 rounded-full border px-2.5 py-1 text-sm font-extrabold",
          tone.amount,
        )}
      >
        {entry.type === "credit" ? "+" : "−"} {fmt(entry.amount)}
      </span>
    </button>
  );
});

export const ActivityListClient: React.FC<{ entries: ActivityItem[] }> = ({
  entries,
}) => {
  const { openSheet } = useSheet();

  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 py-10 text-center">
        <p className="text-2xl" aria-hidden>
          🧾
        </p>
        <p className="mt-2 text-sm font-semibold text-slate-600">
          No activity yet
        </p>
        <p className="text-xs text-slate-400">New entries will show up here.</p>
      </div>
    );
  }

  const open = (e: ActivityItem) =>
    openSheet(e.k === "E" ? "expense" : "entry", { id: e.id });

  return (
    <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
      {entries.map((e) => (
        <li key={`${e.k}${e.id}`}>
          <ActivityRow entry={e} onOpen={open} />
        </li>
      ))}
    </ul>
  );
};
