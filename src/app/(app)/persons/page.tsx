import "server-only";
import { AppHeader } from "@/features/shell/AppHeader";
import { parseSearchParams } from "@/lib/params";
import type { RawSearchParams } from "@/lib/search-params";
import { requireUser } from "@/server/auth/jwt";
import { getPersonsData } from "@/server/queries/persons";
import { getReferenceOptions } from "@/server/queries/reference";
import { PersonsListClient } from "./PersonsListClient";

export default async function PersonsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await requireUser();
  const parsed = parseSearchParams(await searchParams);
  const siteId = parsed.site;

  const [dropdowns, persons] = await Promise.all([
    // Sites + person types (both small); categories come along for free and
    // are deduped with the layout's sites query via cache().
    getReferenceOptions(user),
    getPersonsData({
      siteId,
      query: parsed.q,
      ptype: parsed.ptype,
      sort: parsed.sort,
      // Only admins can look at deactivated persons.
      status: user.role === "admin" ? parsed.status : "active",
      user,
    }),
  ]);

  return (
    <>
      <AppHeader user={user} title="Persons" />

      <div className="px-4 pb-4 pt-2 md:px-6 lg:px-8">
        <PersonsListClient
          persons={persons}
          personTypes={dropdowns.personTypes.map((pt) => pt.name)}
          sites={dropdowns.sites}
          isAdmin={user.role === "admin"}
          currentParams={parsed}
        />
      </div>
    </>
  );
}
