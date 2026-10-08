import "server-only";
import { notFound } from "next/navigation";
import { parseSearchParams } from "@/lib/params";
import { firstParam, type RawSearchParams } from "@/lib/search-params";
import { requireUser } from "@/server/auth/jwt";
import { getCategorySummary } from "@/server/queries/categories";
import { getSitesOptions } from "@/server/queries/reference";
import { getAccessibleSite, getFeedPage } from "@/server/queries/sites";
import { CategoryDetailClient } from "./CategoryDetailClient";

/** Everything tagged with one category, across all sites or one (?site=). */
export default async function CategoryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await requireUser();
  const [{ id }, raw] = await Promise.all([params, searchParams]);
  const categoryId = Number.parseInt(id, 10);
  if (!Number.isInteger(categoryId)) notFound();

  const parsed = parseSearchParams(raw);
  // A site the user can't see falls back to all sites.
  const siteId =
    parsed.site >= 0 && (await getAccessibleSite(parsed.site, user))
      ? parsed.site
      : -1;
  const allUsers = firstParam(raw.all);
  const dates = { dm: parsed.dm, d1: parsed.d1, d2: parsed.d2 };

  const [summary, feed, { sites }] = await Promise.all([
    getCategorySummary(categoryId, {
      siteId,
      allUsers,
      filter: dates,
      user,
    }),
    getFeedPage({
      siteId,
      allUsers,
      filter: { ...dates, categoryId },
      user,
    }),
    getSitesOptions(user),
  ]);
  if (!summary) notFound();

  return (
    <CategoryDetailClient
      user={user}
      summary={summary}
      feed={feed}
      siteId={siteId}
      siteName={sites.find((s) => s.id === siteId)?.name ?? null}
      currentParams={parsed}
    />
  );
}
