import "server-only";
import { AppHeader } from "@/features/shell/AppHeader";
import { parseSearchParams, toFilter } from "@/lib/params";
import { firstParam, type RawSearchParams } from "@/lib/search-params";
import { requireUser } from "@/server/auth/jwt";
import { getExpensesPage, getExpensesSummary } from "@/server/queries/entries";
import { getReferenceOptions } from "@/server/queries/reference";
import { ExpensesListClient } from "./ExpensesListClient";

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await requireUser();
  const raw = await searchParams;
  const parsed = parseSearchParams(raw);
  const siteId = parsed.site;

  const listParams = {
    siteId,
    allUsers: firstParam(raw.all),
    filter: toFilter(parsed),
    user,
  };
  const [dropdowns, firstPage, summary] = await Promise.all([
    getReferenceOptions(user),
    getExpensesPage(listParams),
    getExpensesSummary(listParams),
  ]);

  return (
    <>
      <AppHeader user={user} title="Expenses" />
      <div className="px-4 pt-2 space-y-3">
        <ExpensesListClient
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
