import "server-only";
import { requireUser } from "@/server/auth/jwt";
import { getProfileCounts } from "@/server/queries/overview";
import { ProfileClient } from "./ProfileClient";

export default async function ProfilePage() {
  const user = await requireUser();
  const counts = await getProfileCounts(user);

  return (
    <ProfileClient
      user={user}
      sitesCount={counts.sites}
      personsCount={counts.persons}
      entriesCount={counts.entries}
    />
  );
}
