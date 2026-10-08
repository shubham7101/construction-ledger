import "server-only";
import { parseSearchParams } from "@/lib/params";
import type { RawSearchParams } from "@/lib/search-params";
import { requireAdmin } from "@/server/auth/jwt";
import { getAdminUsersData } from "@/server/queries/admin";
import { AdminUsersClient } from "./AdminUsersClient";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  await requireAdmin();
  const { status, sort, q } = parseSearchParams(await searchParams);
  const users = await getAdminUsersData({ status, sort, q });

  return <AdminUsersClient users={users} status={status} sort={sort} q={q} />;
}
