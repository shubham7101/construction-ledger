import clsx from "clsx";
import React from "react";

interface FieldButtonProps {
  label: string;
  value: string;
  onClick: () => void;
  /** Shorter (48px) variant for dense forms; values truncate instead of wrapping. */
  compact?: boolean;
}

export const FieldButton: React.FC<FieldButtonProps> = React.memo(
  ({ label, value, onClick, compact = false }) => (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "flex w-full min-w-0 cursor-pointer items-center justify-between gap-2 border border-slate-200 bg-white text-left shadow-sm transition-colors hover:border-slate-300",
        compact ? "min-h-12 rounded-xl px-3" : "min-h-14 rounded-2xl px-4",
      )}
    >
      <span className="min-w-0">
        <span className="block text-[11px] leading-tight text-slate-500">
          {label}
        </span>
        <span
          className={clsx("block truncate font-semibold", compact && "text-sm")}
        >
          {value || "Select"}
        </span>
      </span>
      <span aria-hidden className="shrink-0 text-xl text-slate-400">
        ›
      </span>
    </button>
  ),
);

FieldButton.displayName = "FieldButton";
