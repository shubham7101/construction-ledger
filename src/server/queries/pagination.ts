import "server-only";
import { type SQL, sql } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";

/**
 * Keyset ("seek") pagination for the date-ordered lists. Every list is
 * ordered newest first by (date, id), so the next page is simply "rows
 * strictly before the last one we sent" — stable while entries are added,
 * unlike OFFSET, and cheap on the (…, date) indexes.
 */

export const PAGE_SIZE = 30;

export interface Page<T> {
  items: T[];
  /** Opaque token for the next page, or null when this was the last one. */
  nextCursor: string | null;
}

/**
 * Position of the last row sent: its date and id, plus its kind for the
 * mixed ledger + expense site feed ("L" sorts before "E" on the same date).
 */
export interface Cursor {
  date: string;
  kind: string;
  id: number;
}

const CURSOR_RE = /^(\d{4}-\d{2}-\d{2})~([LE]?)~(\d+)$/;

export const encodeCursor = (c: Cursor) => `${c.date}~${c.kind}~${c.id}`;

/** Anything malformed is treated as "first page" rather than an error. */
export function decodeCursor(raw: string | null | undefined): Cursor | null {
  const m = raw ? CURSOR_RE.exec(raw) : null;
  return m ? { date: m[1], kind: m[2], id: Number(m[3]) } : null;
}

/** Rows ordered (date DESC, id DESC) that come after the cursor. */
export const afterCursor = (
  date: SQLiteColumn,
  id: SQLiteColumn,
  c: Cursor | null,
): SQL | undefined =>
  c ? sql`(${date}, ${id}) < (${c.date}, ${c.id})` : undefined;

/** Same, for one side of the mixed feed, ordered (date, kind, id) DESC. */
export const afterFeedCursor = (
  date: SQLiteColumn,
  kind: "L" | "E",
  id: SQLiteColumn,
  c: Cursor | null,
): SQL | undefined =>
  c
    ? sql`(${date}, ${kind}, ${id}) < (${c.date}, ${c.kind}, ${c.id})`
    : undefined;

/**
 * Callers fetch `PAGE_SIZE + 1` rows; the extra row only tells us whether
 * another page exists and is not returned.
 */
export function toPage<T>(
  rows: T[],
  cursorOf: (row: T) => Cursor,
  limit = PAGE_SIZE,
): Page<T> {
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  return {
    items,
    nextCursor:
      rows.length > limit && last ? encodeCursor(cursorOf(last)) : null,
  };
}
