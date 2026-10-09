import "server-only";
import { notFound } from "next/navigation";
import { parseSearchParams, toFilter } from "@/lib/params";
import { firstParam, type RawSearchParams } from "@/lib/search-params";
import { requireUser } from "@/server/auth/jwt";
import { getPassbookData, getPersonSites } from "@/server/queries/persons";
import { PassbookClient } from "./PassbookClient";

export default async function PersonPassbookPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await requireUser();
  const [{ id }, raw] = await Promise.all([params, searchParams]);

  const personId = Number.parseInt(id, 10);
  if (!Number.isInteger(personId)) notFound();

  const parsed = parseSearchParams(raw);

  // Only the person's own sites are offered. The app-wide selected site is
  // used when the person has entries there; otherwise the passbook shows all.
  const load = (scope: number) =>
    getPassbookData({
      personId,
      scope,
      allUsers: firstParam(raw.all),
      filter: toFilter(parsed),
      user,
    });
  // Load the passbook for the selected site alongside the site tabs instead of
  // after them: one round trip, unless the person turns out to have no entries
  // on that site and it must be reloaded for all sites.
  const [sites, selected] = await Promise.all([
    getPersonSites(personId, user),
    load(parsed.site),
  ]);
  const scope = sites.some((s) => s.id === parsed.site) ? parsed.site : -1;
  const passbook = scope === parsed.site ? selected : await load(scope);
  if (!passbook) notFound();

  return (
    <PassbookClient
      user={user}
      passbook={passbook}
      sites={sites}
      scope={scope}
      currentParams={parsed}
    />
  );
}
