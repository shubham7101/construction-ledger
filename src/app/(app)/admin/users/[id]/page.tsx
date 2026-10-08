import "server-only";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/server/auth/jwt";
import { getAdminUser } from "@/server/queries/admin";
import { getLinkedPerson, getSitesOptions } from "@/server/queries/reference";
import { AdminUserDetailClient } from "./AdminUserDetailClient";

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // requireAdmin() gives us the real (admin) user — same object identity the
  // layout uses, so the sites query below is deduped by cache().
  const user = await requireAdmin();
  const userId = Number.parseInt((await params).id, 10);
  if (!Number.isInteger(userId)) notFound();

  const userItem = await getAdminUser(userId);
  if (!userItem) notFound();

  const [{ sites }, linkedPerson] = await Promise.all([
    getSitesOptions(user),
    getLinkedPerson(userId),
  ]);

  return (
    <AdminUserDetailClient
      userItem={userItem}
      sites={sites}
      linkedPerson={linkedPerson}
      isSelf={userItem.id === user.id}
    />
  );
}
