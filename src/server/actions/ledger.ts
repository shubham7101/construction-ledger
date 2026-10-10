"use server";

import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
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
import { applyLedger, CHANGED_MEANWHILE } from "@/server/balances";
import {
  canAccessSite,
  canEditOrDeleteRecord,
  getPersonForEntry,
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
const OWN_PERSON = "You can't add an entry for yourself";

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
  /**
   * Another user's entry against the viewer's own person, as the viewer's
   * passbook shows it: under the creator's person, credit and debit swapped.
   * Display only; the fields above stay as stored, for the edit form.
   */
  mirrored?: {
    personId: number;
    personName: string;
    type: "credit" | "debit";
  };
}

async function findOwnership(id: number) {
  const [row] = await db
    .select({
      createdBy: ledgerEntries.createdBy,
      personId: ledgerEntries.personId,
      siteId: ledgerEntries.siteId,
      type: ledgerEntries.type,
      amount: ledgerEntries.amount,
    })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.id, id))
    .limit(1);
  return row;
}

type ExistingEntry = NonNullable<Awaited<ReturnType<typeof findOwnership>>>;

/**
 * The entry, only while it still has the values read by findOwnership: the
 * balance deltas are worked out from them (see server/balances.ts).
 */
const unchangedSince = (id: number, e: ExistingEntry) =>
  and(
    eq(ledgerEntries.id, id),
    eq(ledgerEntries.createdBy, e.createdBy),
    eq(ledgerEntries.personId, e.personId),
    eq(ledgerEntries.type, e.type),
    eq(ledgerEntries.amount, e.amount),
    sql`${ledgerEntries.siteId} IS ${e.siteId}`, // IS: also matches "No site"
  );

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

    const [canAccess, siteActive, person] = await Promise.all([
      canAccessSite(user, data.siteId),
      isSiteActive(data.siteId),
      getPersonForEntry(data.personId),
    ]);
    if (!canAccess) return { ok: false, error: SITE_ACCESS_DENIED };
    if (!siteActive) return { ok: false, error: SITE_INACTIVE };
    if (!person?.active) return { ok: false, error: PERSON_INACTIVE };
    if (person.userId === user.id) return { ok: false, error: OWN_PERSON };

    await db.batch([
      db.insert(ledgerEntries).values({ ...data, createdBy: user.id }),
      // Straight after the insert: the deltas run only if it wrote a row.
      ...applyLedger({ ...data, createdBy: user.id }, 1),
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
    const [existing, canAccess, siteActive, person] = await Promise.all([
      findOwnership(id),
      canAccessSite(user, data.siteId),
      isSiteActive(data.siteId),
      getPersonForEntry(data.personId),
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
    // Moving to another person: that person must be active and must not be
    // the entry creator's own (the creator stays the same on an edit).
    if (data.personId !== existing.personId) {
      if (!person?.active) return { ok: false, error: PERSON_INACTIVE };
      if (person.userId === existing.createdBy) {
        return { ok: false, error: OWN_PERSON };
      }
    }

    const [written] = await db.batch([
      db
        .update(ledgerEntries)
        .set({ ...data, updatedAt: new Date().toISOString() })
        .where(unchangedSince(id, existing)),
      // Take the old values off, then add the new ones: this covers a changed
      // amount or type and a move to another person. The creator never changes.
      ...applyLedger(existing, -1),
      ...applyLedger({ ...data, createdBy: existing.createdBy }, 1),
      // The entry may have moved person or site: fix both the old and new pair.
      ...syncMembership(existing.personId, existing.siteId),
      ...syncMembership(data.personId, data.siteId),
    ]);
    if (written.rowsAffected === 0) {
      return { ok: false, error: CHANGED_MEANWHILE };
    }

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

    const [written] = await db.batch([
      db.delete(ledgerEntries).where(unchangedSince(id, existing)),
      ...applyLedger(existing, -1),
      ...syncMembership(existing.personId, existing.siteId),
    ]);
    if (written.rowsAffected === 0) {
      return { ok: false, error: CHANGED_MEANWHILE };
    }

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

    // The creator's own person: the other side of a mirrored entry.
    const creatorPerson = alias(persons, "creator_person");
    const [row] = await db
      .select({
        id: ledgerEntries.id,
        personId: ledgerEntries.personId,
        personName: persons.name,
        personUserId: persons.userId,
        creatorPersonId: creatorPerson.id,
        creatorPersonName: creatorPerson.name,
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
      .leftJoin(
        creatorPerson,
        eq(creatorPerson.userId, ledgerEntries.createdBy),
      )
      .where(eq(ledgerEntries.id, id))
      .limit(1);

    if (!row) return null;
    if (!(await canAccessSite(user, row.siteId))) return null;
    const {
      createdBy,
      personUserId,
      creatorPersonId,
      creatorPersonName,
      ...detail
    } = row;
    const canEdit = canEditOrDeleteRecord(user, createdBy);
    const mirrored: LedgerEntryDetail["mirrored"] =
      personUserId === user.id &&
      createdBy !== user.id &&
      creatorPersonId !== null &&
      creatorPersonName !== null
        ? {
            personId: creatorPersonId,
            personName: creatorPersonName,
            type: detail.type === "credit" ? "debit" : "credit",
          }
        : undefined;
    return { ...detail, canEdit, mirrored };
  } catch (err: unknown) {
    rethrowIfRedirect(err);
    return null;
  }
}
