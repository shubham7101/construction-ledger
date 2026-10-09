import { displayDate, fmt, SITE_STATUS_LABELS } from "@/lib/format";
import { modeLabel } from "@/lib/labels";
import type { FilterKey } from "@/types";

/*
 * Which filters each list page has, the URL params behind each, and how an
 * applied one reads as a chip. Shared by the Filters sheet (which edits them)
 * and the FilterBar (which counts and shows them), so the two never disagree.
 */

export type Section =
  | "by" // whose entries: ?all / ?by (admins)
  | "site"
  | "person"
  | "category"
  | "type"
  | "mode"
  | "date" // ?dm / ?d1 / ?d2
  | "amount" // ?amin / ?amax
  | "sort"
  | "ptype"
  | "scope" // persons: every person (?all, admins)
  | "status" // persons: inactive ones (?status, admins)
  | "stage"; // sites: project stage

const SECTIONS: Record<FilterKey, Section[]> = {
  ledgers: [
    "by",
    "site",
    "person",
    "category",
    "type",
    "mode",
    "amount",
    "date",
  ],
  exp: ["by", "site", "category", "amount", "date"],
  site: ["by", "person", "category", "type", "amount", "date"],
  pass: ["by", "amount", "date"],
  cat: ["by", "site", "date"],
  persons: ["sort", "site", "ptype", "scope", "status"],
  sites: ["stage"],
};

const ADMIN_ONLY = new Set<Section>(["by", "scope", "status"]);

const SECTION_PARAMS: Record<Section, readonly string[]> = {
  by: ["all", "by"],
  site: ["site"],
  person: ["person"],
  category: ["category"],
  type: ["type"],
  mode: ["mode"],
  date: ["dm", "d1", "d2"],
  amount: ["amin", "amax"],
  sort: ["sort"],
  ptype: ["ptype"],
  scope: ["all"],
  status: ["status"],
  stage: ["stage"],
};

/** The sections a page shows this user. */
export const sectionsFor = (fk: FilterKey, isAdmin: boolean): Section[] =>
  SECTIONS[fk].filter((s) => isAdmin || !ADMIN_ONLY.has(s));

/** Every URL param the page's filters own (what "Clear all" resets). */
export const paramsFor = (fk: FilterKey, isAdmin: boolean): string[] => [
  ...new Set(sectionsFor(fk, isAdmin).flatMap((s) => SECTION_PARAMS[s])),
];

/** Type filter choices per page; the first is the default (no filter). */
export const TYPE_OPTIONS: Partial<Record<FilterKey, Array<[string, string]>>> =
  {
    ledgers: [
      ["all", "All"],
      ["credit", "Credit"],
      ["debit", "Debit"],
    ],
    site: [
      ["All Activity", "All"],
      ["Ledgers Only", "Ledgers"],
      ["Expenses Only", "Expenses"],
    ],
  };

export const MODE_OPTIONS: Array<[string, string]> = [
  ["", "All"],
  ["cash", "Cash"],
  ["upi", "UPI"],
  ["bank_transfer", "Bank"],
  ["cheque", "Cheque"],
];

export const SORT_OPTIONS: Array<[string, string]> = [
  ["az", "Name A → Z"],
  ["za", "Name Z → A"],
  ["high", "Highest credit"],
  ["low", "Highest debit"],
];

export const STAGE_OPTIONS: Array<[string, string]> = [
  ["", "All"],
  ...(Object.entries(SITE_STATUS_LABELS) as Array<[string, string]>),
];

/** Names the chips need, looked up by id. Missing ones get a generic label. */
export interface FilterNames {
  site?: (id: number) => string | undefined;
  category?: (id: number) => string | undefined;
  user?: (id: number) => string | undefined;
  person?: string | null;
}

export interface Chip {
  key: Section;
  label: string;
  /** Params to clear to remove this filter. */
  clear: Record<string, undefined>;
}

const clearOf = (section: Section) =>
  Object.fromEntries(SECTION_PARAMS[section].map((p) => [p, undefined]));

const num = (v: string | null) => {
  const n = v === null || v === "" ? Number.NaN : Number(v);
  return Number.isInteger(n) && n >= 0 ? n : -1;
};

/** The applied filters of a page as removable chips, in section order. */
export function activeChips(
  fk: FilterKey,
  isAdmin: boolean,
  params: URLSearchParams,
  names: FilterNames,
): Chip[] {
  const chips: Chip[] = [];
  const add = (key: Section, label: string | null | undefined) => {
    if (label) chips.push({ key, label, clear: clearOf(key) });
  };

  for (const section of sectionsFor(fk, isAdmin)) {
    switch (section) {
      case "by": {
        const by = num(params.get("by"));
        if (by >= 0) add("by", `By ${names.user?.(by) ?? "one user"}`);
        else if (params.get("all") === "1") add("by", "All users");
        break;
      }
      case "site": {
        const id = num(params.get("site"));
        if (id >= 0) add("site", `📍 ${names.site?.(id) ?? "Site"}`);
        break;
      }
      case "person": {
        if (num(params.get("person")) >= 0)
          add("person", `👤 ${names.person ?? "Person"}`);
        break;
      }
      case "category": {
        const id = num(params.get("category"));
        if (id >= 0) add("category", `🏷️ ${names.category?.(id) ?? "Category"}`);
        break;
      }
      case "type": {
        const options = TYPE_OPTIONS[fk];
        const value = params.get("type");
        const match = options?.find(
          ([v], i) => i > 0 && v.toLowerCase() === value?.toLowerCase(),
        );
        add("type", match?.[1]);
        break;
      }
      case "mode": {
        const mode = params.get("mode");
        if (mode) add("mode", modeLabel(mode));
        break;
      }
      case "date": {
        const dm = params.get("dm");
        const d1 = params.get("d1") ?? "";
        const d2 = params.get("d2") ?? "";
        if (dm === "day" && d1) add("date", `📅 ${displayDate(d1)}`);
        if (dm === "range" && (d1 || d2)) {
          add(
            "date",
            d1 && d2
              ? `📅 ${displayDate(d1)} – ${displayDate(d2)}`
              : d1
                ? `📅 From ${displayDate(d1)}`
                : `📅 Until ${displayDate(d2)}`,
          );
        }
        break;
      }
      case "amount": {
        const parse = (key: string) => {
          const n = Number(params.get(key) ?? "");
          return params.get(key) && Number.isInteger(n) && n >= 0 ? n : null;
        };
        let [min, max] = [parse("amin"), parse("amax")];
        if (min !== null && max !== null && min > max) [min, max] = [max, min];
        add(
          "amount",
          min !== null && max !== null
            ? `${fmt(min)} – ${fmt(max)}`
            : min !== null
              ? `≥ ${fmt(min)}`
              : max !== null
                ? `≤ ${fmt(max)}`
                : null,
        );
        break;
      }
      case "sort": {
        const sort = params.get("sort");
        if (sort && sort !== "az")
          add("sort", SORT_OPTIONS.find(([v]) => v === sort)?.[1]);
        break;
      }
      case "ptype": {
        const ptype = params.get("ptype");
        if (ptype && ptype.toLowerCase() !== "all") add("ptype", ptype);
        break;
      }
      case "scope":
        if (params.get("all") === "1") add("scope", "All persons");
        break;
      case "status":
        if (params.get("status") === "inactive") add("status", "Inactive");
        break;
      case "stage": {
        const stage = params.get("stage");
        if (stage) add("stage", STAGE_OPTIONS.find(([v]) => v === stage)?.[1]);
        break;
      }
    }
  }
  return chips;
}
