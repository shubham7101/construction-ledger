import "server-only";
import { notFound } from "next/navigation";
import { parseSearchParams, toFilter } from "@/lib/params";
import { firstParam, type RawSearchParams } from "@/lib/search-params";
import { requireUser } from "@/server/auth/jwt";
import { getSiteDetail, getSitePersons } from "@/server/queries/sites";
import { SiteDetailClient } from "./SiteDetailClient";

export default async function SiteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await requireUser();
  const [{ id }, raw] = await Promise.all([params, searchParams]);

  const siteId = Number.parseInt(id, 10);
  if (!Number.isInteger(siteId)) notFound();

  const parsed = parseSearchParams(raw);
  const listParams = {
    siteId,
    allUsers: firstParam(raw.all),
    filter: toFilter(parsed),
    user,
  };
  // Inactive or inaccessible sites 404 instead of showing an empty page.
  const [detail, people] = await Promise.all([
    getSiteDetail(listParams),
    getSitePersons(listParams),
  ]);
  if (!detail) notFound();

  return (
    <SiteDetailClient
      user={user}
      detail={detail}
      people={people}
      currentParams={parsed}
    />
  );
}
