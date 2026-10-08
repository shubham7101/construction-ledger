import "server-only";
import { notFound } from "next/navigation";
import { parseSearchParams, toFilter } from "@/lib/params";
import { firstParam, type RawSearchParams } from "@/lib/search-params";
import { requireUser } from "@/server/auth/jwt";
import { getPassbookData, getPassbookScope } from "@/server/queries/persons";
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
  const { sites, scope } = await getPassbookScope(personId, user, parsed.site);

  const passbook = await getPassbookData({
    personId,
    scope,
    allUsers: firstParam(raw.all),
    filter: toFilter(parsed),
    user,
  });
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
