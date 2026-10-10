"use server";

import "server-only";
import { parseSearchParams, toFilter } from "@/lib/params";
import { requireUser } from "@/server/auth/jwt";
import {
  type ExpenseRow,
  getExpensesPage,
  getLedgersPage,
  type LedgerRow,
} from "@/server/queries/entries";
import type { Page } from "@/server/queries/pagination";
import {
  getPassbookPage,
  getPassbookScope,
  type PassbookRow,
} from "@/server/queries/persons";
import {
  type FeedItem,
  getAccessibleSite,
  getFeedPage,
} from "@/server/queries/sites";

/**
 * "Load more" for the infinite-scroll lists. The client sends only its
 * filters and the cursor; who may see what is worked out here again exactly
 * as the page did (queries are always limited to the user's sites).
 */
export interface ListFilters {
  site?: number;
  category?: number;
  person?: number;
  all?: boolean;
  /** Admins: one user's entries ("logged by"). */
  by?: number;
  /** Ledgers: text search. */
  q?: string;
  /** Ledgers: payment mode. */
  mode?: string;
  /** Amount range, whole rupees. */
  amin?: number;
  amax?: number;
  type?: string;
  dm?: string;
  d1?: string;
  d2?: string;
}

/** Validates filters the same way as the page's URL params. */
function parseFilters(f: ListFilters) {
  const parsed = parseSearchParams({
    site: String(f.site ?? -1),
    category: String(f.category ?? -1),
    person: String(f.person ?? -1),
    by: String(f.by ?? -1),
    mode: f.mode ?? "",
    amin: f.amin === undefined ? "" : String(f.amin),
    amax: f.amax === undefined ? "" : String(f.amax),
    q: f.q ?? "",
    all: f.all ? "1" : "",
    type: f.type ?? "",
    dm: f.dm ?? "",
    d1: f.d1 ?? "",
    d2: f.d2 ?? "",
  });
  return {
    siteId: parsed.site,
    allUsers: parsed.all ? "1" : undefined,
    filter: toFilter(parsed),
    query: parsed.q,
  };
}

export async function loadLedgersPageAction(
  filters: ListFilters,
  cursor: string,
): Promise<Page<LedgerRow>> {
  const user = await requireUser();
  return getLedgersPage({ ...parseFilters(filters), user, cursor });
}

export async function loadExpensesPageAction(
  filters: ListFilters,
  cursor: string,
): Promise<Page<ExpenseRow>> {
  const user = await requireUser();
  return getExpensesPage({ ...parseFilters(filters), user, cursor });
}

export async function loadPassbookPageAction(
  personId: number,
  filters: ListFilters,
  cursor: string,
): Promise<Page<PassbookRow>> {
  const user = await requireUser();
  const { siteId, ...rest } = parseFilters(filters);
  const { scope } = await getPassbookScope(
    personId,
    user,
    siteId,
    rest.allUsers,
  );
  return getPassbookPage({ ...rest, personId, scope, user, cursor });
}

export async function loadFeedPageAction(
  siteId: number,
  filters: ListFilters,
  cursor: string,
): Promise<Page<FeedItem>> {
  const user = await requireUser();
  // -1 = all of the user's sites; a specific site must be active and allowed.
  if (siteId >= 0 && !(await getAccessibleSite(siteId, user))) {
    return { items: [], nextCursor: null };
  }
  const { siteId: _ignored, ...rest } = parseFilters(filters);
  return getFeedPage({ ...rest, siteId, user, cursor });
}
