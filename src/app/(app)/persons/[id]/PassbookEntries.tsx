"use client";

import clsx from "clsx";
import type React from "react";
import { displayDate, fmt } from "@/lib/format";
import { modeLabel } from "@/lib/labels";

export interface PassbookEntry {
  id: number;
  type: string;
  amount: number;
  date: string;
  siteId: number | null;
  siteName: string | null;
  category: string;
  mode: string;
  note: string;
  createdBy: string;
}

interface PassbookEntriesProps {
  entries: PassbookEntry[];
  showRecorder: boolean;
  onOpen: (entryId: number) => void;
}

export const PassbookEntries: React.FC<PassbookEntriesProps> = ({
  entries,
  showRecorder,
  onOpen,
}) => {
  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 py-12 text-center">
        <p className="text-2xl" aria-hidden>
          📒
        </p>
        <p className="mt-2 text-sm font-semibold text-slate-600">
          No entries here
        </p>
        <p className="text-xs text-slate-400">
          Try another site or clear the filters.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* phone + tablet: chat-style bubbles */}
      <ul className="space-y-3 lg:hidden">
        {entries.map((x) => {
          const isCredit = x.type === "credit";
          return (
            <li
              key={x.id}
              className={clsx(
                "flex",
                isCredit ? "justify-start" : "justify-end",
              )}
            >
              <button
                type="button"
                onClick={() => onOpen(x.id)}
                className={clsx(
                  "block min-w-[55%] max-w-[80%] cursor-pointer rounded-2xl border p-3 text-left transition-transform active:scale-[0.98] md:max-w-[60%]",
                  isCredit
                    ? "border-emerald-500/30 bg-emerald-500/10"
                    : "border-red-500/30 bg-red-500/10",
                )}
              >
                <span
                  className={clsx(
                    "block text-xl font-extrabold",
                    isCredit ? "text-emerald-600" : "text-red-600",
                  )}
                >
                  {isCredit ? "+" : "−"} {fmt(x.amount)}
                </span>
                <span className="mt-1 block text-[11px] text-slate-500">
                  {displayDate(x.date)} · {x.siteName ?? "No site"}
                  {showRecorder ? ` · by ${x.createdBy}` : ""}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* laptop: table */}
      <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:block">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-3 py-3">Site</th>
              <th className="px-3 py-3">Category</th>
              <th className="px-3 py-3">Mode</th>
              <th className="px-3 py-3">Note</th>
              {showRecorder && <th className="px-3 py-3">By</th>}
              <th className="px-3 py-3 text-right">Credit</th>
              <th className="px-4 py-3 text-right">Debit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {entries.map((x) => {
              const isCredit = x.type === "credit";
              return (
                <tr
                  key={x.id}
                  onClick={() => onOpen(x.id)}
                  className="cursor-pointer transition-colors hover:bg-amber-50/60"
                >
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpen(x.id);
                      }}
                      className="min-h-0 cursor-pointer border-none bg-transparent p-0 font-semibold text-slate-900"
                    >
                      {displayDate(x.date)}
                    </button>
                  </td>
                  <td className="px-3 py-3 text-slate-600">
                    {x.siteName ?? "No site"}
                  </td>
                  <td className="px-3 py-3 text-slate-600">{x.category}</td>
                  <td className="px-3 py-3 text-slate-600">
                    {modeLabel(x.mode)}
                  </td>
                  <td className="max-w-56 truncate px-3 py-3 text-slate-500">
                    {x.note || "—"}
                  </td>
                  {showRecorder && (
                    <td className="px-3 py-3 text-slate-600">{x.createdBy}</td>
                  )}
                  <td className="px-3 py-3 text-right font-bold text-emerald-600">
                    {isCredit ? fmt(x.amount) : ""}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-red-600">
                    {isCredit ? "" : fmt(x.amount)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
};
