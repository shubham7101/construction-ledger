import "server-only";
import Link from "next/link";
import { SiteStatusBadge } from "@/components/ui/SiteStatusBadge";
import { FilterBar } from "@/features/filters/FilterBar";
import { AppHeader } from "@/features/shell/AppHeader";
import { parseSearchParams } from "@/lib/params";
import type { RawSearchParams } from "@/lib/search-params";
import { requireUser } from "@/server/auth/jwt";
import { getSitesList } from "@/server/queries/sites";

/**
 * Active sites the user can access, searchable and filterable by stage;
 * each opens its details page.
 */
export default async function SitesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await requireUser();
  const parsed = parseSearchParams(await searchParams);
  const sites = await getSitesList(user, {
    query: parsed.q,
    stage: parsed.stage,
  });
  const filtered = Boolean(parsed.q.trim() || parsed.stage);

  return (
    <>
      <AppHeader user={user} title="Sites" />

      <div className="space-y-3 px-4 pb-28 pt-2 md:px-6 lg:px-8">
        <FilterBar
          fk="sites"
          isAdmin={user.role === "admin"}
          search={{
            placeholder: "🔍 Search sites",
            ariaLabel: "Search sites by name, city or address",
          }}
        />

        <p className="px-1 text-xs font-semibold text-slate-500">
          {sites.length} {sites.length === 1 ? "site" : "sites"}
        </p>

        {sites.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white/60 py-10 text-center text-sm text-slate-500">
            {filtered ? "No sites match these filters." : "No active sites."}
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
            {sites.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/sites/${s.id}`}
                  className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 no-underline shadow-sm transition-colors hover:border-amber-300"
                >
                  <span
                    aria-hidden
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-lg"
                  >
                    🏗️
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-bold text-slate-900">
                        {s.name}
                      </span>
                      <SiteStatusBadge status={s.status} />
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {[s.city, s.state].filter(Boolean).join(", ") ||
                        "No city"}
                    </span>
                  </span>
                  <span aria-hidden className="text-xl text-slate-400">
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
