"use client";

import type React from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { useSheet } from "@/hooks/useSheet";
import type { AddModalState } from "@/types";

interface MenuItem {
  k: AddModalState["k"];
  icon: string;
  label: string;
}

export const AddMenuSheet: React.FC = () => {
  const { sheet, openSheet, closeSheet } = useSheet();
  if (sheet !== "addmenu") return null;

  const handleOpenAdd = (k: AddModalState["k"]) => {
    // Step from the menu to the form: push keeps Back a "previous step".
    openSheet("add", { k });
  };

  const items: MenuItem[] = [
    { k: "ledger", icon: "📒", label: "Add Ledger Entry" },
    { k: "exp", icon: "🧾", label: "Add Expense" },
    { k: "person", icon: "👤", label: "Add Person" },
  ];

  return (
    <BottomSheet isOpen onClose={closeSheet} title="Add new">
      <div className="space-y-2 pt-1">
        {items.map(({ k, icon, label }) => (
          <button
            key={k}
            type="button"
            onClick={() => handleOpenAdd(k)}
            className="w-full flex items-center gap-3 px-4 rounded-2xl border border-slate-200 bg-white text-left cursor-pointer transition-colors hover:border-slate-300"
            style={{ minHeight: "56px" }}
          >
            <span className="w-9 h-9 rounded-xl bg-amber-50 grid place-items-center text-lg">
              {icon}
            </span>
            <span className="flex-1 font-semibold text-slate-900">{label}</span>
          </button>
        ))}
      </div>
    </BottomSheet>
  );
};
