import "server-only";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  categories,
  expenses,
  ledgerEntries,
  persons,
  sites,
} from "@/db/schema";
import type { CurrentUser } from "@/server/auth/jwt";
import {
  countAll,
  creditSum,
  debitSum,
  expenseScope,
  expenseTotal,
  getAllowedSites,
  ledgerScope,
  type ScopeOptions,
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
  const allowed = await getAllowedSites(user);
  const scope: ScopeOptions = {
    siteId,
    user,
    everyone: user.role === "admin",
    allowed,
  };
  // Recent activity is always the logged-in user's own entries, admins included.
  const mine: ScopeOptions = { ...scope, everyone: false };

  const ledgerWhere = ledgerScope(scope);
  const expenseWhere = expenseScope(scope);

  const [
    perPerson,
    [expenseRes],
    [entriesRes],
    [personsRes],
    myLedgers,
    myExpenses,
  ] = await Promise.all([
    // one grouped query instead of one query per person
    db
      .select({
        personId: ledgerEntries.personId,
        credit: creditSum,
        debit: debitSum,
      })
      .from(ledgerEntries)
      .where(ledgerWhere)
      .groupBy(ledgerEntries.personId),
    db
      .select({ total: expenseTotal, count: countAll })
      .from(expenses)
      .where(expenseWhere),
    db.select({ count: countAll }).from(ledgerEntries).where(ledgerWhere),
    db.select({ count: countAll }).from(persons),
    db
      .select({
        id: ledgerEntries.id,
        title: persons.name,
        type: ledgerEntries.type,
        amount: ledgerEntries.amount,
        date: ledgerEntries.date,
        siteName: sites.name,
        createdAt: ledgerEntries.createdAt,
      })
      .from(ledgerEntries)
      .innerJoin(persons, eq(ledgerEntries.personId, persons.id))
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

  // Sum of each person's net balance, split by sign: persons whose credits
  // exceed their debits count towards `credit`, the rest towards `debit`.
  // Expenses are money going out, so they count as debit too.
  const expenseSum = expenseRes?.total ?? 0;
  let credit = 0;
  let debit = expenseSum;
  for (const row of perPerson) {
    const net = row.credit - row.debit;
    if (net > 0) credit += net;
    else debit -= net;
  }

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
    credit,
    debit,
    personsCount: personsRes?.count ?? 0,
    entriesCount: entriesRes?.count ?? 0,
    expensesCount: expenseRes?.count ?? 0,
    recentActivity,
  };
}

export async function getProfileCounts(user: CurrentUser) {
  const allowed = await getAllowedSites(user);
  const ledgerWhere = ledgerScope({
    siteId: -1,
    user,
    everyone: user.role === "admin",
    allowed,
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
    db.select({ count: countAll }).from(ledgerEntries).where(ledgerWhere),
  ]);

  return {
    sites: sitesCount,
    persons: personsRes[0]?.count ?? 0,
    entries: entriesRes[0]?.count ?? 0,
  };
}
