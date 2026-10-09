import "server-only";
import { AppHeader } from "@/features/shell/AppHeader";
import { parseSearchParams } from "@/lib/params";
import { firstParam, type RawSearchParams } from "@/lib/search-params";
import { requireUser } from "@/server/auth/jwt";
import { getPersonsData } from "@/server/queries/persons";
import { PersonsListClient } from "./PersonsListClient";

export default async function PersonsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await requireUser();
  const raw = await searchParams;
  const parsed = parseSearchParams(raw);
  const siteId = parsed.site;

  const persons = await getPersonsData({
    siteId,
    query: parsed.q,
    ptype: parsed.ptype,
    sort: parsed.sort,
    // Only admins can look at deactivated persons.
    status: user.role === "admin" ? parsed.status : "active",
    // Every person, not just those this user has dealt with (admins only).
    allUsers: firstParam(raw.all),
    user,
  });

  return (
    <>
      <AppHeader user={user} title="Persons" />

      <div className="px-4 pb-4 pt-2 md:px-6 lg:px-8">
        <PersonsListClient persons={persons} isAdmin={user.role === "admin"} />
      </div>
    </>
  );
}
