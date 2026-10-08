"use client";

import { usePathname } from "next/navigation";
import type React from "react";
import { useSheet } from "@/hooks/useSheet";

const HIDDEN_ON = ["/profile", "/login"] as const;

export const Fab: React.FC = () => {
  const pathname = usePathname();
  const { openSheet } = useSheet();

  if (HIDDEN_ON.some((p) => pathname === p || pathname.startsWith(`${p}/`)))
    return null;

  return (
    <button
      type="button"
      onClick={() => openSheet("addmenu")}
      aria-label="Add new"
      className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 z-40 flex h-14 min-w-14 cursor-pointer items-center justify-center gap-2 rounded-full border-none bg-linear-to-tr from-amber-500 to-amber-400 text-slate-950 shadow-xl shadow-amber-500/30 transition-transform hover:scale-105 active:scale-95 md:bottom-8 md:right-8 lg:px-5"
    >
      <span aria-hidden className="text-3xl font-black leading-none">
        +
      </span>
      <span className="hidden text-sm font-bold lg:inline">Add new</span>
    </button>
  );
};
