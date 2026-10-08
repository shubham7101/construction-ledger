import type React from "react";
import { fmt } from "@/lib/format";

export const CreditDebitHero: React.FC<{ credit: number; debit: number }> = ({
  credit,
  debit,
}) => (
  <div className="grid grid-cols-1 gap-3 rounded-2xl min-[360px]:grid-cols-2 bg-linear-to-br from-amber-500 via-amber-600 to-amber-700 p-3.5 text-slate-950 shadow-lg shadow-amber-500/20 lg:grid-cols-1">
    <div className="rounded-xl border border-emerald-100 bg-white/95 p-3 shadow-xs">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
          CREDIT
        </span>
        <span aria-hidden className="text-xs">
          ↗️
        </span>
      </div>
      <p className="mt-1 truncate text-lg font-extrabold tabular-nums min-[400px]:text-xl text-emerald-600">
        {fmt(credit)}
      </p>
    </div>
    <div className="rounded-xl border border-red-100 bg-white/95 p-3 shadow-xs">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-red-700">
          DEBIT
        </span>
        <span aria-hidden className="text-xs">
          ↙️
        </span>
      </div>
      <p className="mt-1 truncate text-lg font-extrabold tabular-nums min-[400px]:text-xl text-red-600">
        {fmt(debit)}
      </p>
    </div>
  </div>
);

export const StatTile: React.FC<{ value: string | number; label: string }> = ({
  value,
  label,
}) => (
  <div className="rounded-2xl border border-slate-200/80 bg-white p-3 text-center shadow-xs transition-colors hover:border-slate-300">
    <p className="truncate text-base font-extrabold text-amber-600">{value}</p>
    <p className="mt-0.5 text-xs font-semibold text-slate-500">{label}</p>
  </div>
);
