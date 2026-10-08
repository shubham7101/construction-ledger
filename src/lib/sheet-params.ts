/**
 * Pure helpers for the URL-driven sheet layer (`?sheet=...` + aux params).
 * Kept free of React/Next imports so they can be unit tested directly.
 */

export type SheetKind =
  | "site" // SitePickerSheet — pick the header's site filter
  | "addmenu" // AddMenuSheet — the FAB menu
  | "add" // AddEditSheet — ?k=ledger|exp|person (+ ?ed= to edit, ?pid=&dir= presets)
  | "filter" // FilterSheet — ?fk=site|ledgers|exp|pass
  | "sort" // SortSheet
  | "entry" // LedgerDetailSheet — ?id=
  | "expense"; // ExpenseDetailSheet — ?id=

const SHEET_KINDS: readonly string[] = [
  "site",
  "addmenu",
  "add",
  "filter",
  "sort",
  "entry",
  "expense",
];

/** Every param owned by the sheet layer; cleared together (one sheet at a time). */
export const SHEET_KEYS = [
  "sheet",
  "k",
  "fk",
  "id",
  "pid",
  "dir",
  "ed",
] as const;

const SHEET_PARAM_KEYS = new Set<string>(SHEET_KEYS);

/** True if a search param belongs to the sheet layer (strip before carrying params to a link). */
export const isSheetParam = (key: string): boolean => SHEET_PARAM_KEYS.has(key);

/** Returns the sheet kind only for a known `?sheet=` value; anything else is "no sheet". */
export function parseSheetKind(value: string | null): SheetKind | null {
  return value !== null && SHEET_KINDS.includes(value)
    ? (value as SheetKind)
    : null;
}

/**
 * Builds the URL for a sheet transition: clears every sheet-layer param, then
 * applies `changes` (e.g. `{ sheet: "entry", id: 7 }`; `{}` = close).
 * Pure — pass the current href in.
 */
export function buildSheetUrl(
  href: string,
  changes: Record<string, string | number>,
): string {
  const url = new URL(href);
  for (const key of SHEET_KEYS) url.searchParams.delete(key);
  for (const [key, value] of Object.entries(changes)) {
    url.searchParams.set(key, String(value));
  }
  return `${url.pathname}${url.search}${url.hash}`;
}
