/** Same values as ledger_entries.type. */
export type EntryType = "credit" | "debit";

/**
 * Which page the FilterSheet is opened for; picks its sections (see
 * features/filters/config.ts). "site" = a site's details page.
 */
export type FilterKey =
  | "site"
  | "ledgers"
  | "exp"
  | "pass"
  | "cat"
  | "persons"
  | "sites";

export interface AddModalState {
  k: "ledger" | "exp" | "person";
  ed?: number; // id of the ledger entry / expense being edited
  pid?: number; // target person id for ledger entry
  personLabel?: string; // display label for pid (persons are searched, not listed)
  t?: string;
  a?: number | string;
  s?: number; // site index (-1 or null for no site in ledger)
  c?: string;
  p?: string;
  note?: string;
  date?: string; // YYYY-MM-DD; kept as-is when editing
  n?: string;
  m?: string;
  m2?: string; // second mobile (person)
  em?: string; // email (person)
  ad?: string; // address (person)
  ptId?: number; // person type id loaded when editing a person
}
