"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type React from "react";

type NavItem = {
  key: string;
  href: string;
  icon: string;
  label: string;
  adminOnly?: boolean;
  /** Tablet rail / laptop sidebar only; the phone bar has no room for it. */
  wideOnly?: boolean;
};

const NAV_ITEMS: readonly NavItem[] = [
  { key: "home", href: "/", icon: "🏠", label: "Overview" },
  { key: "persons", href: "/persons", icon: "👥", label: "Persons" },
  { key: "sites", href: "/sites", icon: "👷", label: "Sites" },
  { key: "ledgers", href: "/ledgers", icon: "📒", label: "Ledgers" },
  { key: "exp", href: "/expenses", icon: "🧾", label: "Expenses" },
  {
    key: "cats",
    href: "/categories",
    icon: "🏷️",
    label: "Categories",
    wideOnly: true,
  },
  { key: "admin", href: "/admin", icon: "🛡️", label: "Admin", adminOnly: true },
];

const isActive = (pathname: string, href: string) =>
  href === "/"
    ? pathname === "/"
    : pathname === href || pathname.startsWith(`${href}/`);

export const AppNav: React.FC<{ isAdmin: boolean }> = ({ isAdmin }) => {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);

  return (
    <nav
      aria-label="Main"
      style={{
        gridTemplateColumns: `repeat(${items.filter((i) => !i.wideOnly).length}, 1fr)`,
      }}
      className={clsx(
        // phone: bottom bar
        "fixed inset-x-0 bottom-0 z-40 grid border-t border-slate-200/80 bg-white/90 pb-[env(safe-area-inset-bottom)] shadow-lg backdrop-blur-md",
        // tablet: icon rail
        "md:inset-y-0 md:right-auto md:flex md:w-20 md:flex-col md:gap-1 md:border-r md:border-t-0 md:bg-white md:px-2 md:py-4 md:pb-4 md:shadow-none md:backdrop-blur-none",
        // laptop: full sidebar
        "lg:w-64 lg:px-3",
      )}
    >
      {/* brand: tablet + laptop only */}
      <div className="mb-2 hidden items-center gap-3 border-b border-slate-100 px-1 pb-4 md:flex md:justify-center lg:justify-start lg:px-2">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-500 text-xl">
          🏗️
        </span>
        <span className="hidden leading-tight lg:block">
          <span className="block text-sm font-extrabold text-slate-900">
            Construction Ledger
          </span>
          <span className="block text-[11px] text-slate-500">
            Multi-site Khata Book
          </span>
        </span>
      </div>

      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "relative min-h-14 flex-col items-center justify-center gap-0.5 py-1 no-underline transition-colors active:scale-95",
              item.wideOnly ? "hidden md:flex" : "flex",
              "md:min-h-12 md:rounded-xl lg:flex-row lg:justify-start lg:gap-3 lg:px-3",
              active
                ? "font-bold text-amber-600 md:bg-amber-50 md:text-amber-700"
                : "font-medium text-slate-400 hover:text-slate-600 md:hover:bg-slate-50",
            )}
          >
            <span
              aria-hidden
              className={clsx(
                "text-lg leading-none lg:text-xl",
                active && "scale-110 lg:scale-100",
              )}
            >
              {item.icon}
            </span>
            <span className="text-[10px] font-semibold tracking-tight lg:text-sm">
              {item.label}
            </span>
            {active && (
              <span
                aria-hidden
                className="mt-0.5 h-1.5 w-1.5 rounded-full bg-amber-500 md:hidden"
              />
            )}
            {active && (
              <span
                aria-hidden
                className="absolute left-0 hidden h-6 w-1 rounded-r bg-amber-500 md:block"
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
};
