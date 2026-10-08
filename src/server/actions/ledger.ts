"use server";

import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  categories,
  ledgerEntries,
  persons,
  siteMembership,
  sites,
  users,
} from "@/db/schema";
import { ledgerEntrySchema } from "@/lib/validators";
import { requireUser } from "@/server/auth/jwt";
import {
  canAccessSite,
  canEditOrDeleteRecord,
  isPersonActive,
  isSiteActive,
} from "@/server/permissions";
import {
  type ActionResult,
  rethrowIfRedirect,
  revalidateLedgerPages,
  runAction,
  SITE_ACCESS_DENIED,
  SITE_INACTIVE,
} from "./shared";

const PERSON_INACTIVE = "This person is inactive";

export interface LedgerEntryDetail {
  id: number;
  personId: number;
  personName: string;
  type: "credit" | "debit";
  amount: number;
  date: string;
  siteId: number | null;
  siteName: string | null;
  categoryId: number;
  category: string;
  mode: "cash" | "upi" | "bank_transfer" | "cheque";
  note: string;
  recordedBy: string;
  /** Admins and the entry's creator may edit or delete it. */
  canEdit: boolean;
}

async function findOwnership(id: number) {
  const [row] = await db
    .select({
      createdBy: ledgerEntries.createdBy,
      personId: ledgerEntries.personId,
      siteId: ledgerEntries.siteId,
    })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.id, id))
    .limit(1);
  return row;
}

/**
 * Brings site_membership in line with ledger_entries for one (person, site)
 * pair: a row exists exactly when the person has an entry on that site.
 * Re-deriving (instead of counting) means it can never drift. Written as
 * plain statements, with no read first, so they go in the same db.batch()
 * as the entry write: one atomic request instead of a transaction's many.
 */
function syncMembership(personId: number, siteId: number | null) {
  if (siteId === null) return []; // "No site" entries aren't tied to a site
  const hasEntry = sql`EXISTS (SELECT 1 FROM ${ledgerEntries} WHERE person_id = ${personId} AND site_id = ${siteId})`;
  return [
    db.run(
      sql`INSERT INTO ${siteMembership} (person_id, site_id) SELECT ${personId}, ${siteId} WHERE ${hasEntry} ON CONFLICT DO NOTHING`,
    ),
    db.run(
      sql`DELETE FROM ${siteMembership} WHERE person_id = ${personId} AND site_id = ${siteId} AND NOT ${hasEntry}`,
    ),
  ];
}

export async function createLedgerEntryAction(
  input: unknown,
): Promise<ActionResult> {
  return runAction("Failed to create ledger entry", async () => {
    const user = await requireUser();
    const data = ledgerEntrySchema.parse(input);

    const [canAccess, siteActive, personActive] = await Promise.all([
      canAccessSite(user, data.siteId),
      isSiteActive(data.siteId),
      isPersonActive(data.personId),
    ]);
    if (!canAccess) return { ok: false, error: SITE_ACCESS_DENIED };
    if (!siteActive) return { ok: false, error: SITE_INACTIVE };
    if (!personActive) return { ok: false, error: PERSON_INACTIVE };

    await db.batch([
      db.insert(ledgerEntries).values({ ...data, createdBy: user.id }),
      ...syncMembership(data.personId, data.siteId),
    ]);

    revalidateLedgerPages(data.personId);
    return { ok: true };
  });
}

export async function updateLedgerEntryAction(
  id: number,
  input: unknown,
): Promise<ActionResult> {
  return runAction("Failed to update ledger entry", async () => {
    const user = await requireUser();
    const data = ledgerEntrySchema.parse(input);

    // All independent lookups in one go; the checks below use what they need.
    const [existing, canAccess, siteActive, personActive] = await Promise.all([
      findOwnership(id),
      canAccessSite(user, data.siteId),
      isSiteActive(data.siteId),
      isPersonActive(data.personId),
    ]);
    if (!existing) return { ok: false, error: "Entry not found" };
    if (!canEditOrDeleteRecord(user, existing.createdBy)) {
      return { ok: false, error: "Unauthorized to edit this entry" };
    }
    if (!canAccess) return { ok: false, error: SITE_ACCESS_DENIED };
    // Moving to another site needs that site to be active; staying put is fine.
    if (data.siteId !== existing.siteId && !siteActive) {
      return { ok: false, error: SITE_INACTIVE };
    }
    if (data.personId !== existing.personId && !personActive) {
      return { ok: false, error: PERSON_INACTIVE };
    }

    await db.batch([
      db
        .update(ledgerEntries)
        .set({ ...data, updatedAt: new Date().toISOString() })
        .where(eq(ledgerEntries.id, id)),
      // The entry may have moved person or site: fix both the old and new pair.
      ...syncMembership(existing.personId, existing.siteId),
      ...syncMembership(data.personId, data.siteId),
    ]);

    revalidateLedgerPages(data.personId);
    // The entry may have moved to another person; refresh the old passbook too.
    if (existing.personId !== data.personId) {
      revalidateLedgerPages(existing.personId);
    }
    return { ok: true };
  });
}

export async function deleteLedgerEntryAction(
  id: number,
): Promise<ActionResult> {
  return runAction("Failed to delete ledger entry", async () => {
    const user = await requireUser();

    const existing = await findOwnership(id);
    if (!existing) return { ok: false, error: "Entry not found" };
    if (!canEditOrDeleteRecord(user, existing.createdBy)) {
      return { ok: false, error: "Unauthorized to delete this entry" };
    }

    await db.batch([
      db.delete(ledgerEntries).where(eq(ledgerEntries.id, id)),
      ...syncMembership(existing.personId, existing.siteId),
    ]);

    revalidateLedgerPages(existing.personId);
    return { ok: true };
  });
}

/** One row on demand for the detail sheet, instead of loading every entry up front. */
export async function getLedgerEntryAction(
  id: number,
): Promise<LedgerEntryDetail | null> {
  try {
    const user = await requireUser();

    const [row] = await db
      .select({
        id: ledgerEntries.id,
        personId: ledgerEntries.personId,
        personName: persons.name,
        type: ledgerEntries.type,
        amount: ledgerEntries.amount,
        date: ledgerEntries.date,
        siteId: ledgerEntries.siteId,
        siteName: sites.name,
        categoryId: ledgerEntries.categoryId,
        category: categories.name,
        mode: ledgerEntries.mode,
        note: ledgerEntries.note,
        recordedBy: users.name,
        createdBy: ledgerEntries.createdBy,
      })
      .from(ledgerEntries)
      .innerJoin(persons, eq(ledgerEntries.personId, persons.id))
      .innerJoin(categories, eq(ledgerEntries.categoryId, categories.id))
      .innerJoin(users, eq(ledgerEntries.createdBy, users.id))
      .leftJoin(sites, eq(ledgerEntries.siteId, sites.id))
      .where(eq(ledgerEntries.id, id))
      .limit(1);

    if (!row) return null;
    if (!(await canAccessSite(user, row.siteId))) return null;
    const { createdBy, ...detail } = row;
    return { ...detail, canEdit: canEditOrDeleteRecord(user, createdBy) };
  } catch (err: unknown) {
    rethrowIfRedirect(err);
    return null;
  }
}
