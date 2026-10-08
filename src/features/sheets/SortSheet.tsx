"use client";

import clsx from "clsx";
import { usePathname, useRouter } from "next/navigation";
import type React from "react";
import { useTransition } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { useSheet } from "@/hooks/useSheet";
import type { SortOption } from "@/types";

export const SortSheet: React.FC = () => {
  const router = useRouter();
  const pathname = usePathname();
  const [_isPending, startTransition] = useTransition();

  const { sheet, searchParams, closeSheet } = useSheet();

  if (sheet !== "sort") return null;

  const currentSort = searchParams.get("sort") || "az";

  const options: Array<[SortOption, string]> = [
    ["az", "Name A → Z"],
    ["za", "Name Z → A"],
    ["high", "Highest credit (green)"],
    ["low", "Highest debit (red)"],
  ];

  const handleSelect = (key: SortOption) => {
    const nextParams = new URLSearchParams(searchParams.toString());
    if (key && key !== "az") {
      nextParams.set("sort", key);
    } else {
      nextParams.delete("sort");
    }
    // Choosing a sort order applies it and closes the sheet in one
    // server navigation (`sort` re-queries the page).
    nextParams.delete("sheet");
    startTransition(() => {
      router.replace(`${pathname}?${nextParams.toString()}`);
    });
  };

  return (
    <BottomSheet isOpen onClose={closeSheet} title="Sort by">
      <div className="space-y-2 pt-1">
        {options.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => handleSelect(key)}
            className={clsx(
              "w-full flex items-center justify-between px-4 rounded-2xl border cursor-pointer text-left transition-colors",
              currentSort === key
                ? "border-amber-500 bg-amber-50"
                : "border-slate-200 bg-white",
            )}
            style={{ minHeight: "52px" }}
          >
            <span className="font-semibold text-slate-900">{label}</span>
            <span className="text-amber-600 font-bold">
              {currentSort === key ? "✓" : ""}
            </span>
          </button>
        ))}
      </div>
    </BottomSheet>
  );
};
