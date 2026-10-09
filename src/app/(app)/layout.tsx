import "server-only";
import type React from "react";
import { ToastProvider } from "@/components/ui/Toast";
import { AddEditSheet } from "@/features/sheets/AddEditSheet";
import { AddMenuSheet } from "@/features/sheets/AddMenuSheet";
import { ExpenseDetailSheet } from "@/features/sheets/ExpenseDetailSheet";
import { FilterSheet } from "@/features/sheets/FilterSheet";
import { LedgerDetailSheet } from "@/features/sheets/LedgerDetailSheet";
import { AppNav } from "@/features/shell/AppNav";
import { Fab } from "@/features/shell/Fab";
import { requireUser } from "@/server/auth/jwt";
import { getSitesOptions } from "@/server/queries/reference";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const { sites } = await getSitesOptions(user);
  const isAdmin = user.role === "admin";

  return (
    <ToastProvider>
      <div className="min-h-dvh bg-slate-100">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-100 focus:rounded-lg focus:bg-amber-500 focus:px-3 focus:py-2 focus:text-sm focus:font-bold"
        >
          Skip to content
        </a>

        <AppNav isAdmin={isAdmin} />

        {/* offset for the tablet rail (w-20) and laptop sidebar (w-64) */}
        <div className="md:pl-20 lg:pl-64">
          <main
            id="main"
            className="mx-auto w-full max-w-107.5 pb-28 md:max-w-3xl md:pb-12 lg:max-w-6xl 2xl:max-w-7xl"
          >
            {children}
          </main>
        </div>

        <Fab />
        <AddMenuSheet />
        <AddEditSheet sites={sites} />
        <FilterSheet sites={sites} isAdmin={isAdmin} />
        <LedgerDetailSheet />
        <ExpenseDetailSheet />
      </div>
    </ToastProvider>
  );
}
