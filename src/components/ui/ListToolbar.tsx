"use client";

import clsx from "clsx";
import type React from "react";
import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { useUrlParams } from "@/hooks/useUrlParams";
import { loadUserOptions } from "@/lib/reference-cache";
import type { UserOption } from "@/server/actions/reference";

interface ListToolbarProps {
  isAdmin: boolean;
  /** ?all=1: everyone's entries. */
  showAll: boolean;
  /** ?by=<user id>: one user's entries; -1 = none picked. */
  by: number;
  onOpenFilter: () => void;
  activeFilters: number;
}

/**
 * Admins pick whose entries the list shows ("Logged by"): their own, every
 * user's, or one user's. Each choice clears the other param, so at most one
 * of ?all / ?by is set. Regular users only ever see their own.
 */
export const ListToolbar: React.FC<ListToolbarProps> = ({
  isAdmin,
  showAll,
  by,
  onOpenFilter,
  activeFilters,
}) => (
  <div className="flex items-stretch gap-2">
    {isAdmin && <LoggedByPicker showAll={showAll} by={by} />}
    <button
      type="button"
      onClick={onOpenFilter}
      className={clsx(
        "ml-auto flex min-h-13 shrink-0 cursor-pointer items-center rounded-2xl border px-4 text-sm font-semibold transition-colors",
        activeFilters > 0
          ? "border-amber-500 bg-amber-500 text-slate-950"
          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
      )}
    >
      ⚙ Filter{activeFilters > 0 ? ` · ${activeFilters}` : ""}
    </button>
  </div>
);

const LoggedByPicker: React.FC<{ showAll: boolean; by: number }> = ({
  showAll,
  by,
}) => {
  const { update } = useUrlParams();
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<UserOption[] | null>(null);

  // Fetched when first needed: to name the picked user, or to list them.
  const needUsers = open || by >= 0;
  useEffect(() => {
    if (!needUsers || users) return;
    let stale = false;
    loadUserOptions()
      .then((rows) => {
        if (!stale) setUsers(rows);
      })
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [needUsers, users]);

  const picked = by >= 0 ? users?.find((u) => u.id === by) : undefined;
  const label =
    by >= 0 ? (picked?.name ?? "One user") : showAll ? "All users" : "Only me";
  const highlighted = showAll || by >= 0;

  const choose = (next: { all?: boolean; by?: number }) => {
    setOpen(false);
    update({ all: next.all, by: next.by });
  };

  const options: Array<{
    key: string;
    name: string;
    hint?: string;
    selected: boolean;
    pick: { all?: boolean; by?: number };
  }> = [
    { key: "me", name: "Only me", selected: !highlighted, pick: {} },
    {
      key: "all",
      name: "All users",
      selected: showAll && by < 0,
      pick: { all: true },
    },
    ...(users ?? []).map((u) => ({
      key: String(u.id),
      name: u.name,
      hint: u.active ? undefined : "Inactive",
      selected: by === u.id,
      pick: { by: u.id },
    })),
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`Logged by: ${label}. Change`}
        className={clsx(
          "flex min-h-13 min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-2xl border px-4 text-left shadow-sm transition-colors",
          highlighted
            ? "border-amber-500 bg-amber-50"
            : "border-slate-200 bg-white hover:bg-slate-50",
        )}
      >
        <span aria-hidden>👤</span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Logged by
          </span>
          <span className="block truncate text-sm font-semibold text-slate-900">
            {label}
          </span>
        </span>
        <span aria-hidden className="text-[10px] text-slate-500">
          ▼
        </span>
      </button>

      <BottomSheet
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Logged by"
      >
        <ul className="max-h-[60dvh] space-y-2 overflow-y-auto pt-1">
          {options.map((o) => (
            <li key={o.key}>
              <button
                type="button"
                onClick={() => choose(o.pick)}
                aria-pressed={o.selected}
                className={clsx(
                  "flex min-h-12 w-full cursor-pointer items-center justify-between gap-2 rounded-2xl border px-4 text-left transition-colors",
                  o.selected
                    ? "border-amber-500 bg-amber-50"
                    : "border-slate-200 bg-white hover:bg-slate-50",
                )}
              >
                <span className="truncate font-semibold text-slate-900">
                  {o.name}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {o.hint && (
                    <span className="text-xs font-semibold text-slate-400">
                      {o.hint}
                    </span>
                  )}
                  <span aria-hidden className="font-bold text-amber-600">
                    {o.selected ? "✓" : ""}
                  </span>
                </span>
              </button>
            </li>
          ))}
          {users === null && (
            <li className="py-3 text-center text-sm text-slate-400">
              Loading users…
            </li>
          )}
        </ul>
      </BottomSheet>
    </>
  );
};
