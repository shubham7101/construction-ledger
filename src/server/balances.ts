import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import {
  expenseBalances,
  expenses,
  ledgerBalances,
  ledgerEntries,
  personBalances,
  userBalances,
} from "@/db/schema";

/*
 * user_balances, person_balances, ledger_balances and expense_balances hold
 * running totals of ledger_entries and expenses. Every write adds its own amount to them (or takes it back off),
 * in the same db.batch() as the write itself, so nothing is ever re-summed.
 *
 * Each statement here only runs when the statement before it in the batch
 * changed a row (`WHERE changes() > 0`). The actions put them straight after
 * the entry / expense write, whose WHERE also pins the values read for the
 * delta: if a concurrent request edited or deleted the row in between, the
 * write matches nothing, every delta after it is skipped, and the action
 * reports the conflict. An amount is never applied twice or against stale
 * values.
 *
 * Deltas are upserts so the first write for a user or person creates its row.
 */

export type LedgerAmount = {
  type: "credit" | "debit";
  amount: number;
};

/** ledger_balances stores "No site" as site 0. */
export const NO_SITE = 0;

/** +1 adds an entry to the totals, -1 takes it back off. */
type Sign = 1 | -1;

function ledgerDelta({ type, amount }: LedgerAmount, sign: Sign) {
  return {
    credit: type === "credit" ? sign * amount : 0,
    debit: type === "debit" ? sign * amount : 0,
    entries: sign,
  };
}

/**
 * Add (sign 1) or remove (sign -1) one ledger entry from its creator's, its
 * person's and its (creator, person, site) totals: three statements for the
 * batch.
 */
export function applyLedger(
  entry: LedgerAmount & {
    createdBy: number;
    personId: number;
    siteId: number | null;
  },
  sign: Sign,
) {
  const d = ledgerDelta(entry, sign);
  return [
    db.run(sql`
      INSERT INTO ${userBalances} (user_id, credit, debit, entries)
      SELECT ${entry.createdBy}, ${d.credit}, ${d.debit}, ${d.entries}
      WHERE changes() > 0
      ON CONFLICT (user_id) DO UPDATE SET
        credit = credit + excluded.credit,
        debit = debit + excluded.debit,
        entries = entries + excluded.entries
    `),
    db.run(sql`
      INSERT INTO ${personBalances} (person_id, credit, debit, entries)
      SELECT ${entry.personId}, ${d.credit}, ${d.debit}, ${d.entries}
      WHERE changes() > 0
      ON CONFLICT (person_id) DO UPDATE SET
        credit = credit + excluded.credit,
        debit = debit + excluded.debit,
        entries = entries + excluded.entries
    `),
    db.run(sql`
      INSERT INTO ${ledgerBalances} (user_id, person_id, site_id, credit, debit, entries)
      SELECT ${entry.createdBy}, ${entry.personId}, ${entry.siteId ?? NO_SITE},
        ${d.credit}, ${d.debit}, ${d.entries}
      WHERE changes() > 0
      ON CONFLICT (user_id, person_id, site_id) DO UPDATE SET
        credit = credit + excluded.credit,
        debit = debit + excluded.debit,
        entries = entries + excluded.entries
    `),
  ];
}

/**
 * Add (sign 1) or remove (sign -1) one expense from its creator's and its
 * (creator, site) totals: two statements for the batch.
 */
export function applyExpense(
  expense: { createdBy: number; siteId: number; amount: number },
  sign: Sign,
) {
  const amount = sign * expense.amount;
  return [
    db.run(sql`
      INSERT INTO ${userBalances} (user_id, expense, expenses)
      SELECT ${expense.createdBy}, ${amount}, ${sign}
      WHERE changes() > 0
      ON CONFLICT (user_id) DO UPDATE SET
        expense = expense + excluded.expense,
        expenses = expenses + excluded.expenses
    `),
    db.run(sql`
      INSERT INTO ${expenseBalances} (user_id, site_id, total, count)
      SELECT ${expense.createdBy}, ${expense.siteId}, ${amount}, ${sign}
      WHERE changes() > 0
      ON CONFLICT (user_id, site_id) DO UPDATE SET
        total = total + excluded.total,
        count = count + excluded.count
    `),
  ];
}

/** Message for a write whose row changed between the read and the write. */
export const CHANGED_MEANWHILE =
  "This record was just changed by someone else — please reload and try again";

const credit = sql`COALESCE(SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END), 0)`;
const debit = sql`COALESCE(SUM(CASE WHEN type = 'debit' THEN amount ELSE 0 END), 0)`;

/**
 * Rebuild every balance table from scratch, for bulk loads that bypass the
 * actions (the demo seed). The same SQL backfills them in the migrations.
 */
export async function rebuildBalances() {
  await db.batch([
    db.delete(userBalances),
    db.delete(personBalances),
    db.delete(ledgerBalances),
    db.delete(expenseBalances),
    db.run(sql`
      INSERT INTO ${userBalances} (user_id, credit, debit, entries, expense, expenses)
      SELECT u.id,
        COALESCE(l.credit, 0), COALESCE(l.debit, 0), COALESCE(l.entries, 0),
        COALESCE(e.expense, 0), COALESCE(e.expenses, 0)
      FROM users u
      LEFT JOIN (
        SELECT created_by, ${credit} AS credit, ${debit} AS debit, COUNT(*) AS entries
        FROM ${ledgerEntries} GROUP BY created_by
      ) l ON l.created_by = u.id
      LEFT JOIN (
        SELECT created_by, SUM(amount) AS expense, COUNT(*) AS expenses
        FROM ${expenses} GROUP BY created_by
      ) e ON e.created_by = u.id
    `),
    db.run(sql`
      INSERT INTO ${personBalances} (person_id, credit, debit, entries)
      SELECT person_id, ${credit}, ${debit}, COUNT(*)
      FROM ${ledgerEntries} GROUP BY person_id
    `),
    db.run(sql`
      INSERT INTO ${ledgerBalances} (user_id, person_id, site_id, credit, debit, entries)
      SELECT created_by, person_id, COALESCE(site_id, ${NO_SITE}), ${credit}, ${debit}, COUNT(*)
      FROM ${ledgerEntries} GROUP BY created_by, person_id, COALESCE(site_id, ${NO_SITE})
    `),
    db.run(sql`
      INSERT INTO ${expenseBalances} (user_id, site_id, total, count)
      SELECT created_by, site_id, SUM(amount), COUNT(*)
      FROM ${expenses} GROUP BY created_by, site_id
    `),
  ]);
}
