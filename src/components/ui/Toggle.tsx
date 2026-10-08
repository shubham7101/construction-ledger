import clsx from "clsx";
import type React from "react";

interface ToggleProps {
  checked: boolean;
  onChange: () => void;
  ariaLabel?: string;
}

export const Toggle: React.FC<ToggleProps> = ({
  checked,
  onChange,
  ariaLabel = "Toggle",
}) => (
  <button
    type="button"
    onClick={onChange}
    aria-label={ariaLabel}
    className={clsx(
      "shrink-0 w-14 h-8 rounded-full relative cursor-pointer border-none transition-colors",
      checked ? "bg-emerald-500" : "bg-slate-300",
    )}
    style={{ minHeight: "32px" }}
  >
    <span
      className={clsx(
        "absolute top-1 w-6 h-6 rounded-full bg-white transition-all shadow-sm",
        checked ? "left-7" : "left-1",
      )}
    />
  </button>
);
