import clsx from "clsx";
import type React from "react";
import { SITE_STATUS_LABELS } from "@/lib/format";

type SiteStatus = keyof typeof SITE_STATUS_LABELS;

/** Project stage badge; "active" shows nothing unless `showActive`. */
export const SiteStatusBadge: React.FC<{
  status: string;
  showActive?: boolean;
}> = ({ status, showActive = false }) => {
  if (status === "active" && !showActive) return null;
  const label = SITE_STATUS_LABELS[status as SiteStatus] ?? status;
  return (
    <span
      className={clsx(
        "shrink-0 rounded px-1.5 py-px text-[10px] font-bold uppercase tracking-wider",
        status === "completed" && "bg-sky-100 text-sky-700",
        status === "on_hold" && "bg-orange-100 text-orange-700",
        status === "active" && "bg-emerald-100 text-emerald-700",
      )}
    >
      {label}
    </span>
  );
};
