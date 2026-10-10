import "server-only";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  categories,
  expenses,
  ledgerBalances,
  ledgerEntries,
  persons,
  sites,
  userBalances,
} from "@/db/schema";
import type { CurrentUser } from "@/server/auth/jwt";
import {
  balanceCredit,
  balanceDebit,
  balanceEntries,
  countAll,
  expenseScope,
  getAllowedSites,
  getListMirror,
  ledgerBalanceScope,
  ledgerScope,
  mirroredBalanceScope,
  type ScopeOptions,
  viewerPersonId,
  viewerType,
} from "./shared";

/** How many of the user's own latest entries the overview shows. */
const RECENT_LIMIT = 10;

export type ActivityItem =
  | {
      k: "L";
      id: number;
      title: string;
      type: "credit" | "debit";
      amount: number;
      date: string;
      siteName: string | null;
    }
  | {
      k: "E";
      id: number;
      title: string;
      type: "debit";
      amount: number;
      date: string;
      siteName: string;
    };

export async function getOverviewData(params: {
  siteId: number;
  user: CurrentUser;
}) {
  const { siteId, user } = params;
  const [allowed, mirror] = await Promise.all([
    getAllowedSites(user),
    getListMirror(user, false),
  ]);
  // Recent activity is always the logged-in user's own entries, admins
  // included, and other users' entries against their own person, mirrored.
  const mine: ScopeOptions = { siteId, user, everyone: false, allowed, mirror };

  const [[balance], [mirrored], [personsRes], myLedgers, myExpenses] =
    await Promise.all([
      // The hero and counts: the user's own totals, kept by server/balances.ts.
      db
        .select()
        .from(userBalances)
        .where(eq(userBalances.userId, user.id))
        .limit(1),
      // Plus other users' entries against the user's own person, swapped.
      mirror
        ? db
            .select({
              credit: balanceDebit,
              debit: balanceCredit,
              entries: balanceEntries,
            })
            .from(ledgerBalances)
            .where(mirroredBalanceScope(user, mirror.ownPersonId, allowed))
        : [undefined],
      db.select({ count: countAll }).from(persons),
      db
        .select({
          id: ledgerEntries.id,
          title: persons.name,
          // A mirrored entry reads from the viewer's side.
          type: viewerType(mine),
          amount: ledgerEntries.amount,
          date: ledgerEntries.date,
          siteName: sites.name,
          createdAt: ledgerEntries.createdAt,
        })
        .from(ledgerEntries)
        .innerJoin(persons, eq(persons.id, viewerPersonId(mine)))
        .leftJoin(sites, eq(ledgerEntries.siteId, sites.id))
        .where(ledgerScope(mine))
        .orderBy(desc(ledgerEntries.date), desc(ledgerEntries.createdAt))
        .limit(RECENT_LIMIT),
      db
        .select({
          id: expenses.id,
          note: expenses.note,
          category: categories.name,
          amount: expenses.amount,
          date: expenses.date,
          siteName: sites.name,
          createdAt: expenses.createdAt,
        })
        .from(expenses)
        .innerJoin(categories, eq(expenses.categoryId, categories.id))
        .innerJoin(sites, eq(expenses.siteId, sites.id))
        .where(expenseScope(mine))
        .orderBy(desc(expenses.date), desc(expenses.createdAt))
        .limit(RECENT_LIMIT),
    ]);

  // Dates are YYYY-MM-DD and createdAt is an SQLite timestamp, so plain
  // string comparison orders both chronologically.
  const recentActivity = [
    ...myLedgers.map((r) => ({ ...r, k: "L" as const })),
    ...myExpenses.map(({ note, category, ...r }) => ({
      ...r,
      k: "E" as const,
      type: "debit" as const,
      title: note || category,
    })),
  ]
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
    )
    .slice(0, RECENT_LIMIT)
    .map(({ createdAt: _createdAt, ...item }): ActivityItem => item);

  return {
    // Money the user took in (ledger credits) and paid out (ledger debits
    // plus their expenses).
    credit: (balance?.credit ?? 0) + (mirrored?.credit ?? 0),
    debit:
      (balance?.debit ?? 0) + (mirrored?.debit ?? 0) + (balance?.expense ?? 0),
    personsCount: personsRes?.count ?? 0,
    entriesCount: (balance?.entries ?? 0) + (mirrored?.entries ?? 0),
    expensesCount: balance?.expenses ?? 0,
    recentActivity,
  };
}

export async function getProfileCounts(user: CurrentUser) {
  const everyone = user.role === "admin";
  const [allowed, mirror] = await Promise.all([
    getAllowedSites(user),
    getListMirror(user, everyone),
  ]);
  const balanceWhere = ledgerBalanceScope({
    siteId: -1,
    user,
    everyone,
    allowed,
    mirror,
  });

  const siteCount = async () => {
    if (allowed !== null && allowed.length === 0) return 0;
    const [row] = await db
      .select({ count: countAll })
      .from(sites)
      .where(allowed === null ? undefined : inArray(sites.id, allowed));
    return row?.count ?? 0;
  };

  const [sitesCount, personsRes, entriesRes] = await Promise.all([
    siteCount(),
    db.select({ count: countAll }).from(persons),
    db
      .select({ count: balanceEntries })
      .from(ledgerBalances)
      .where(balanceWhere),
  ]);

  return {
    sites: sitesCount,
    persons: personsRes[0]?.count ?? 0,
    entries: entriesRes[0]?.count ?? 0,
  };
}
