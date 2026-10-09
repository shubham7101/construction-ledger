import "server-only";
import { AppHeader } from "@/features/shell/AppHeader";
import { parseSearchParams } from "@/lib/params";
import { firstParam, type RawSearchParams } from "@/lib/search-params";
import { requireUser } from "@/server/auth/jwt";
import { getCategoryBreakdown } from "@/server/queries/categories";
import { CategoriesClient } from "./CategoriesClient";

/** Money per category, across all sites or one (?site=). */
export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await requireUser();
  const raw = await searchParams;
  const parsed = parseSearchParams(raw);

  const breakdown = await getCategoryBreakdown({
    siteId: parsed.site,
    allUsers: firstParam(raw.all),
    filter: {
      dm: parsed.dm,
      d1: parsed.d1,
      d2: parsed.d2,
      createdBy: parsed.by,
    },
    user,
  });

  return (
    <>
      <AppHeader user={user} title="Categories" />
      <CategoriesClient
        user={user}
        breakdown={breakdown}
        currentParams={parsed}
      />
    </>
  );
}
