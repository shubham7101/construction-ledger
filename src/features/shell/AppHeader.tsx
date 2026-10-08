import Link from "next/link";
import type React from "react";
import type { CurrentUser } from "@/server/auth/jwt";

interface AppHeaderProps {
  user?: CurrentUser;
  /** The page's title; rendered as its h1. */
  title: string;
}

export const AppHeader: React.FC<AppHeaderProps> = ({ user, title }) => {
  const name = user?.name || "User";
  const firstName = name.split(" ")[0];
  const initial = name[0] || "U";
  const roleLabel = user?.role === "admin" ? "Admin" : "Regular";

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-slate-200/60 bg-white/90 px-4 pb-2.5 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] shadow-xs backdrop-blur-md md:static md:border-0 md:bg-transparent md:px-6 md:pb-2 md:pt-6 md:shadow-none md:backdrop-blur-none lg:px-8">
      <div className="flex min-w-0 items-center gap-2.5">
        {/* The tablet rail / laptop sidebar already shows the brand. */}
        <span
          aria-hidden
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-500 text-lg md:hidden"
        >
          🏗️
        </span>
        <div className="min-w-0">
          <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-slate-500 md:hidden">
            Construction Ledger
          </p>
          <h1 className="truncate text-lg font-extrabold leading-tight text-slate-900 md:text-2xl">
            {title}
          </h1>
        </div>
      </div>

      <Link
        href="/profile"
        aria-label={`Profile: ${name}`}
        className="flex min-h-10 shrink-0 items-center gap-2 rounded-full border border-slate-200/80 bg-white px-3 py-1 no-underline shadow-xs transition-all hover:bg-slate-50 active:scale-95"
      >
        <span className="relative">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-linear-to-br from-amber-400 to-amber-600 text-xs font-extrabold text-slate-950 shadow-xs">
            {initial}
          </span>
          <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500" />
        </span>
        <span className="text-xs font-bold tracking-tight text-slate-800 md:text-sm">
          {firstName}
        </span>
        <span className="hidden rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-600 lg:inline">
          {roleLabel}
        </span>
      </Link>
    </header>
  );
};
