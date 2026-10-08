import clsx from "clsx";
import type React from "react";

interface ListToolbarProps {
  isAdmin: boolean;
  showAll: boolean;
  onShowAllChange: (value: boolean) => void;
  onOpenFilter: () => void;
  activeFilters: number;
  allUsersLabel?: string;
}

export const ListToolbar: React.FC<ListToolbarProps> = ({
  isAdmin,
  showAll,
  onShowAllChange,
  onOpenFilter,
  activeFilters,
  allUsersLabel = "Show all users’ transactions",
}) => (
  <div className="flex items-stretch gap-2">
    {isAdmin && (
      <label className="flex min-h-13 min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 shadow-sm">
        <input
          type="checkbox"
          checked={showAll}
          onChange={(e) => onShowAllChange(e.target.checked)}
          className="h-5 w-5 shrink-0 cursor-pointer accent-amber-500"
        />
        <span className="text-sm font-semibold leading-tight text-slate-900">
          {allUsersLabel}
        </span>
      </label>
    )}
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
