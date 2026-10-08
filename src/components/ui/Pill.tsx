import clsx from "clsx";
import React from "react";

interface PillProps {
  label: string;
  active: boolean;
  onClick: () => void;
  className?: string;
  style?: React.CSSProperties;
}

export const Pill: React.FC<PillProps> = React.memo(function Pill({
  label,
  active,
  onClick,
  className,
  style,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        "min-h-10 shrink-0 cursor-pointer whitespace-nowrap rounded-full px-4 text-sm font-semibold transition-colors",
        active
          ? "bg-amber-500 text-slate-950"
          : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50",
        className,
      )}
      style={style}
    >
      {label}
    </button>
  );
});
