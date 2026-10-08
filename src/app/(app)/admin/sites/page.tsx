import "server-only";
import { parseSearchParams } from "@/lib/params";
import type { RawSearchParams } from "@/lib/search-params";
import { requireAdmin } from "@/server/auth/jwt";
import { getAdminSitesList } from "@/server/queries/admin";
import { AdminSitesClient } from "./AdminSitesClient";

export default async function AdminSitesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  await requireAdmin();
  const { status, sort, q } = parseSearchParams(await searchParams);
  const sites = await getAdminSitesList({ status, sort, q });

  return <AdminSitesClient sites={sites} status={status} sort={sort} q={q} />;
}
