import "server-only";
import { AppHeader } from "@/features/shell/AppHeader";
import { parseSearchParams, toFilter } from "@/lib/params";
import { firstParam, type RawSearchParams } from "@/lib/search-params";
import { requireUser } from "@/server/auth/jwt";
import { getLedgersPage, getLedgersSummary } from "@/server/queries/entries";
import { getReferenceOptions } from "@/server/queries/reference";
import { LedgersListClient } from "./LedgersListClient";

export default async function LedgersPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await requireUser();
  const raw = await searchParams;
  const parsed = parseSearchParams(raw);
  const siteId = parsed.site;
  const allUsers = firstParam(raw.all);

  const listParams = { siteId, allUsers, filter: toFilter(parsed), user };
  const [dropdowns, firstPage, summary] = await Promise.all([
    getReferenceOptions(user),
    getLedgersPage(listParams),
    getLedgersSummary(listParams),
  ]);

  return (
    <>
      <AppHeader user={user} title="Ledgers" />

      <div className="space-y-3 px-4 pb-4 pt-2 md:px-6 lg:px-8">
        <LedgersListClient
          user={user}
          sites={dropdowns.sites}
          categories={dropdowns.categories}
          firstPage={firstPage}
          summary={summary}
          currentParams={parsed}
        />
      </div>
    </>
  );
}
