import "server-only";
import { parseSearchParams } from "@/lib/params";
import { firstParam, type RawSearchParams } from "@/lib/search-params";
import { requireAdmin } from "@/server/auth/jwt";
import { getAdminMasterList, type MasterKind } from "@/server/queries/admin";
import { AdminCategoriesClient } from "./AdminCategoriesClient";

export default async function AdminCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  await requireAdmin();
  const raw = await searchParams;
  const { status, sort, q } = parseSearchParams(raw);
  // ?tab=types shows person types; anything else shows categories.
  const kind: MasterKind =
    firstParam(raw.tab) === "types" ? "personTypes" : "categories";
  const items = await getAdminMasterList(kind, { status, sort, q });

  return (
    <AdminCategoriesClient
      kind={kind}
      items={items}
      status={status}
      sort={sort}
      q={q}
    />
  );
}
