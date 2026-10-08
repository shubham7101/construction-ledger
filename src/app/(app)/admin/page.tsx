import "server-only";
import Link from "next/link";
import type React from "react";
import { requireAdmin } from "@/server/auth/jwt";
import { getAdminHubCounts } from "@/server/queries/admin";

const HubCard: React.FC<{
  href: string;
  icon: string;
  title: string;
  subtitle: string;
}> = ({ href, icon, title, subtitle }) => (
  <Link
    href={href}
    className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left no-underline shadow-sm transition-colors hover:border-amber-300 hover:shadow-md"
  >
    <span
      aria-hidden
      className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-amber-50 text-2xl"
    >
      {icon}
    </span>
    <span className="min-w-0 flex-1">
      <span className="block font-bold text-slate-900">{title}</span>
      <span className="block text-xs text-slate-500">{subtitle}</span>
    </span>
    <span aria-hidden className="text-xl text-slate-400">
      ›
    </span>
  </Link>
);

export default async function AdminHubPage() {
  await requireAdmin();

  const counts = await getAdminHubCounts();

  return (
    <div className="space-y-4 px-4 pt-4 md:px-6 md:pt-6 lg:px-8">
      <h1 className="text-xl font-extrabold text-slate-900">
        Admin Control Center
      </h1>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <HubCard
          href="/admin/sites"
          icon="🏗️"
          title="Sites"
          subtitle={`${counts.sites} sites · ${counts.activeSites} active`}
        />
        <HubCard
          href="/admin/users"
          icon="👥"
          title="Users"
          subtitle={`${counts.users} accounts · ${counts.activeUsers} active`}
        />
        <HubCard
          href="/admin/categories"
          icon="🏷️"
          title="Categories Master"
          subtitle={`${counts.activeCategories} categories · ${counts.activePersonTypes} person types active`}
        />
      </div>
    </div>
  );
}
