/**
 * Fills a LOCAL database with realistic demo data for trying every feature:
 * sites in every status (and a deactivated one), admins and regular users
 * with different site access, persons with optional fields, inactive
 * masters, thousands of ledger entries and expenses spread over 18 months
 * (enough for infinite scroll, filters and category breakdowns).
 *
 *   bun run db:demo            # only into an empty database
 *   bun run db:demo --reset    # wipe ALL app data first, then fill
 *
 * The data is generated from a fixed seed, so every run is identical.
 */
import { sql } from "drizzle-orm";
import { normalizeName } from "@/lib/normalize";
import { hashPassword } from "@/server/auth/password";
import {
  categories,
  expenses,
  ledgerEntries,
  persons,
  personTypes,
  siteMembership,
  sites,
  userSiteAccess,
  users,
} from "./schema";

/* ------------------------------------------------------------------ */
/* Safety                                                              */
/* ------------------------------------------------------------------ */

const url = process.env.DATABASE_URL ?? "file:./local.db";
if (!url.startsWith("file:")) {
  console.error(
    `Refusing to run: DATABASE_URL is "${url}". Demo data is only for a local file database.`,
  );
  process.exit(1);
}
const reset = process.argv.includes("--reset");

// Loaded only after the check above: opening it already talks to the database.
const { db } = await import("./index");

const [{ entries }] = await db
  .select({
    entries: sql<number>`(SELECT COUNT(*) FROM ledger_entries) + (SELECT COUNT(*) FROM expenses)`,
  })
  .from(sql`(SELECT 1)`);
if (entries > 0 && !reset) {
  console.error(
    `This database already has ${entries} entries. Run with --reset to wipe ALL app data (users included) and load the demo data.`,
  );
  process.exit(1);
}

/* ------------------------------------------------------------------ */
/* Deterministic randomness                                            */
/* ------------------------------------------------------------------ */

let seed = 20261008;
/** mulberry32: small, fast, repeatable. */
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const int = (min: number, max: number) =>
  min + Math.floor(rand() * (max - min + 1));
const pick = <T>(list: readonly T[]): T =>
  list[Math.floor(rand() * list.length)];
const chance = (p: number) => rand() < p;
/** Weighted pick: [[value, weight], ...]. */
const weighted = <T>(items: ReadonlyArray<readonly [T, number]>): T => {
  const total = items.reduce((sum, [, w]) => sum + w, 0);
  let r = rand() * total;
  for (const [value, w] of items) {
    r -= w;
    if (r <= 0) return value;
  }
  return items[items.length - 1][0];
};

const usedMobiles = new Set<string>();
const mobile = () => {
  for (;;) {
    const m = `${pick(["9", "8", "7", "6"])}${String(int(0, 999_999_999)).padStart(9, "0")}`;
    if (!usedMobiles.has(m)) {
      usedMobiles.add(m);
      return m;
    }
  }
};

const today = new Date();
const isoDaysAgo = (days: number) => {
  const d = new Date(today);
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
/** Skewed towards recent dates, so the latest pages look busy. */
const recentDate = (maxDays = 540) =>
  isoDaysAgo(Math.floor(rand() ** 1.6 * maxDays));
const sqliteTimestamp = (daysAgo: number, hour: number) =>
  `${isoDaysAgo(daysAgo)} ${String(hour).padStart(2, "0")}:${String(int(0, 59)).padStart(2, "0")}:00`;

/** A value the script just created; missing means a bug in this script. */
function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`demo-seed: missing ${what}`);
  return value;
}

/** Insert in chunks (SQLite limits bound parameters per statement). */
async function insertChunked<T extends Record<string, unknown>>(
  // biome-ignore lint/suspicious/noExplicitAny: any drizzle table
  table: any,
  rows: T[],
  size = 100,
) {
  for (let i = 0; i < rows.length; i += size) {
    await db.insert(table).values(rows.slice(i, i + size));
  }
}

/* ------------------------------------------------------------------ */
/* Reference data                                                      */
/* ------------------------------------------------------------------ */

const FIRST = [
  "Ramesh",
  "Suresh",
  "Mahesh",
  "Rajesh",
  "Anil",
  "Sunil",
  "Vijay",
  "Sanjay",
  "Amit",
  "Rohit",
  "Deepak",
  "Manoj",
  "Prakash",
  "Arjun",
  "Kiran",
  "Harish",
  "Naresh",
  "Gopal",
  "Imran",
  "Salim",
  "Farhan",
  "Joseph",
  "Thomas",
  "Ravi",
  "Ganesh",
  "Sachin",
  "Nitin",
  "Pooja",
  "Anita",
  "Sunita",
  "Kavita",
  "Meena",
  "Lakshmi",
  "Priya",
  "Neha",
];
const LAST = [
  "Patel",
  "Shah",
  "Sharma",
  "Verma",
  "Yadav",
  "Singh",
  "Kumar",
  "Gupta",
  "Joshi",
  "Desai",
  "Mehta",
  "Reddy",
  "Naidu",
  "Pawar",
  "Jadhav",
  "Shinde",
  "Khan",
  "Shaikh",
  "Pillai",
  "Nair",
  "Iyer",
  "Chauhan",
  "Thakur",
  "Mishra",
];
const STREETS = [
  "MG Road",
  "Station Road",
  "Gandhi Nagar",
  "Shivaji Chowk",
  "Market Yard",
  "Industrial Area",
  "Nehru Colony",
  "Ring Road",
  "Old City",
  "Sector 7",
];
const fullName = () => `${pick(FIRST)} ${pick(LAST)}`;

const SITE_DEFS = [
  {
    name: "Skyline Towers",
    city: "Pune",
    state: "Maharashtra",
    status: "active",
    isActive: 1,
  },
  {
    name: "Green Valley Villas",
    city: "Nashik",
    state: "Maharashtra",
    status: "active",
    isActive: 1,
  },
  {
    name: "Riverside Apartments",
    city: "Surat",
    state: "Gujarat",
    status: "active",
    isActive: 1,
  },
  {
    name: "Metro Mall",
    city: "Ahmedabad",
    state: "Gujarat",
    status: "active",
    isActive: 1,
  },
  {
    name: "Sunrise Bungalows",
    city: "Indore",
    state: "Madhya Pradesh",
    status: "on_hold",
    isActive: 1,
  },
  {
    name: "Lakeview Residency",
    city: "Bhopal",
    state: "Madhya Pradesh",
    status: "completed",
    isActive: 1,
  },
  {
    name: "Old Warehouse Repair",
    city: "Mumbai",
    state: "Maharashtra",
    status: "completed",
    isActive: 0,
  },
] as const;

const CATEGORY_DEFS = [
  ["Cement", 18],
  ["Steel", 14],
  ["Sand", 8],
  ["Bricks", 9],
  ["Labour", 20],
  ["Transport", 7],
  ["Electrical", 6],
  ["Plumbing", 5],
  ["Paint", 4],
  ["Machinery Hire", 5],
  ["Tiles", 4],
] as const;
const INACTIVE_CATEGORY = "Old Scaffolding";

const PERSON_TYPE_DEFS = [
  "Contractor",
  "Mason",
  "Electrician",
  "Plumber",
  "Supplier",
  "Carpenter",
  "Painter",
  "Labour Contractor",
];
const INACTIVE_PERSON_TYPE = "Welder";

const EXPENSE_NOTES: Record<string, string[]> = {
  Cement: ["Cement bags", "Ready-mix delivery"],
  Steel: ["TMT bars", "Binding wire"],
  Sand: ["River sand truck", "M-sand load"],
  Bricks: ["Red bricks", "AAC blocks"],
  Labour: ["Daily wages", "Overtime payment"],
  Transport: ["Tempo hire", "Diesel for truck"],
  Electrical: ["Wiring material", "Switch boards"],
  Plumbing: ["PVC pipes", "Fittings"],
  Paint: ["Primer", "Exterior paint"],
  "Machinery Hire": ["JCB hire", "Mixer rental"],
  Tiles: ["Floor tiles", "Wall tiles"],
};

const PASSWORD = "Demo@1234";

/* ------------------------------------------------------------------ */
/* Wipe (with --reset)                                                 */
/* ------------------------------------------------------------------ */

if (reset) {
  // Children first, so foreign keys never block the deletes.
  for (const table of [
    ledgerEntries,
    expenses,
    siteMembership,
    userSiteAccess,
    persons,
    users,
    sites,
    categories,
    personTypes,
  ]) {
    await db.delete(table);
  }
  console.log("Wiped existing app data.");
}

/* ------------------------------------------------------------------ */
/* Masters                                                             */
/* ------------------------------------------------------------------ */

const siteRows = await db
  .insert(sites)
  .values(
    SITE_DEFS.map((s) => ({
      ...s,
      address: `${int(1, 250)}, ${pick(STREETS)}`,
    })),
  )
  .returning({ id: sites.id, name: sites.name, isActive: sites.isActive });
const activeSites = siteRows.filter((s) => s.isActive === 1);

const categoryRows = await db
  .insert(categories)
  .values([
    ...CATEGORY_DEFS.map(([name]) => ({ name: normalizeName(name) })),
    { name: normalizeName(INACTIVE_CATEGORY), isActive: 0 },
  ])
  .returning({ id: categories.id, name: categories.name });
const categoryWeights = CATEGORY_DEFS.map(
  ([name, w]) =>
    [
      must(
        categoryRows.find((c) => c.name === name),
        name,
      ),
      w,
    ] as const,
);
const inactiveCategory = must(
  categoryRows.find((c) => c.name === normalizeName(INACTIVE_CATEGORY)),
  INACTIVE_CATEGORY,
);

const typeRows = await db
  .insert(personTypes)
  .values([
    ...PERSON_TYPE_DEFS.map((name) => ({ name: normalizeName(name) })),
    { name: normalizeName(INACTIVE_PERSON_TYPE), isActive: 0 },
  ])
  .returning({ id: personTypes.id, name: personTypes.name });
const typeId = (name: string) =>
  must(
    typeRows.find((t) => t.name === normalizeName(name)),
    name,
  ).id;

/* ------------------------------------------------------------------ */
/* Users (each with a linked "Contractor" person, as the app does)     */
/* ------------------------------------------------------------------ */

const passwordHash = await hashPassword(PASSWORD);
const USER_DEFS = [
  {
    name: "Demo Admin",
    mobile: "9000000000",
    role: "admin",
    active: 1,
    sites: [] as number[],
  },
  {
    name: "Priya Office Admin",
    mobile: "9000000009",
    role: "admin",
    active: 1,
    sites: [],
  },
  {
    name: "Rahul Supervisor",
    mobile: "9000000001",
    role: "regular",
    active: 1,
    sites: [0, 1, 2],
  },
  {
    name: "Kiran Site Engineer",
    mobile: "9000000002",
    role: "regular",
    active: 1,
    sites: [2, 3],
  },
  {
    name: "Sanjay Munshi",
    mobile: "9000000003",
    role: "regular",
    active: 1,
    sites: [0],
  },
  {
    name: "Meena Accounts",
    mobile: "9000000004",
    role: "regular",
    active: 1,
    sites: [1, 4, 5],
  },
  {
    name: "Arjun Store Keeper",
    mobile: "9000000005",
    role: "regular",
    active: 1,
    sites: [3],
  },
  {
    name: "Old Employee",
    mobile: "9000000006",
    role: "regular",
    active: 0,
    sites: [0, 1],
  },
  {
    name: "New Joinee",
    mobile: "9000000007",
    role: "regular",
    active: 1,
    sites: [],
  },
] as const;
for (const u of USER_DEFS) usedMobiles.add(u.mobile);

const userRows = await db
  .insert(users)
  .values(
    USER_DEFS.map((u, i) => ({
      name: u.name,
      mobile: u.mobile,
      passwordHash,
      role: u.role,
      isActive: u.active,
      // A few never signed in, the rest at different times.
      lastLoginAt: i === 8 ? null : sqliteTimestamp(int(0, 20), int(3, 14)),
    })),
  )
  .returning({ id: users.id, role: users.role, isActive: users.isActive });

await insertChunked(
  userSiteAccess,
  USER_DEFS.flatMap((u, i) =>
    u.sites.map((s) => ({ userId: userRows[i].id, siteId: siteRows[s].id })),
  ),
);

await insertChunked(
  persons,
  USER_DEFS.map((u, i) => ({
    name: u.name,
    mobile: u.mobile,
    personTypeId: typeId("Contractor"),
    userId: userRows[i].id,
  })),
);

/* ------------------------------------------------------------------ */
/* Persons                                                             */
/* ------------------------------------------------------------------ */

const PERSON_COUNT = 70;
const personValues = Array.from({ length: PERSON_COUNT }, (_, i) => {
  const name = fullName();
  return {
    name,
    mobile: mobile(),
    mobile2: chance(0.35) ? mobile() : "",
    email: chance(0.45)
      ? `${name.toLowerCase().replace(/[^a-z]+/g, ".")}${int(1, 99)}@example.com`
      : "",
    address: chance(0.55)
      ? `${int(1, 400)}, ${pick(STREETS)}, ${pick(SITE_DEFS).city}`
      : "",
    personTypeId:
      i < 2 ? typeId(INACTIVE_PERSON_TYPE) : typeId(pick(PERSON_TYPE_DEFS)),
    // A few deactivated persons (they keep their history).
    isActive: i % 23 === 5 ? 0 : 1,
  };
});
// Two people sharing a mobile number (allowed for persons).
personValues[PERSON_COUNT - 1].mobile = personValues[PERSON_COUNT - 2].mobile;

const personRows = await db
  .insert(persons)
  .values(personValues)
  .returning({ id: persons.id, isActive: persons.isActive });

/* ------------------------------------------------------------------ */
/* Ledger entries and expenses                                         */
/* ------------------------------------------------------------------ */

// Who may record on which site: admins anywhere, regulars on their sites.
const recordersFor = (siteId: number | null) =>
  USER_DEFS.map((u, i) => ({ u, row: userRows[i] })).filter(({ u, row }) => {
    if (row.isActive === 0 && !chance(0.3)) return false; // old user: some history
    if (u.role === "admin") return true;
    if (siteId === null) return true;
    return u.sites.some((s) => siteRows[s].id === siteId);
  });

// Each person mostly works on 1–3 sites.
const homeSites = new Map(
  personRows.map((p) => [
    p.id,
    Array.from({ length: int(1, 3) }, () => pick(siteRows).id),
  ]),
);

const MODES = [
  ["cash", 35],
  ["upi", 35],
  ["bank_transfer", 20],
  ["cheque", 10],
] as const;
const LEDGER_NOTES = [
  "Advance",
  "Running bill",
  "Final settlement",
  "Material payment",
  "Weekly payment",
  "Balance cleared",
  "Part payment",
  "",
];

const LEDGER_COUNT = 2600;
const ledgerValues = Array.from({ length: LEDGER_COUNT }, (_, i) => {
  const person = pick(personRows);
  const siteId = chance(0.05)
    ? null
    : pick(must(homeSites.get(person.id), "home sites"));
  const recorders = recordersFor(siteId);
  const recorder = (recorders.length ? pick(recorders) : { row: userRows[0] })
    .row;
  const category = i % 211 === 7 ? inactiveCategory : weighted(categoryWeights);
  const type = chance(0.62) ? ("credit" as const) : ("debit" as const);
  const amount = weighted([
    [int(5, 50) * 100, 55],
    [int(50, 300) * 100, 35],
    [int(300, 2000) * 100, 10],
  ] as const);
  return {
    personId: person.id,
    type,
    amount,
    date: i < 25 ? isoDaysAgo(0) : recentDate(),
    siteId,
    categoryId: category.id,
    mode: weighted(MODES),
    note: chance(0.6) ? pick(LEDGER_NOTES) : "",
    createdBy: recorder.id,
  };
});
await insertChunked(ledgerEntries, ledgerValues);

const EXPENSE_COUNT = 900;
const expenseValues = Array.from({ length: EXPENSE_COUNT }, () => {
  const site = pick(siteRows);
  const recorders = recordersFor(site.id);
  const recorder = (recorders.length ? pick(recorders) : { row: userRows[0] })
    .row;
  const category = weighted(categoryWeights);
  return {
    amount: weighted([
      [int(2, 30) * 100, 70],
      [int(30, 250) * 100, 30],
    ] as const),
    date: recentDate(),
    siteId: site.id,
    categoryId: category.id,
    note: chance(0.8)
      ? pick(EXPENSE_NOTES[category.name] ?? ["Site expense"])
      : "",
    createdBy: recorder.id,
  };
});
await insertChunked(expenses, expenseValues);

// site_membership mirrors ledger_entries (the app keeps it in sync on writes).
await db.run(sql`
  INSERT OR IGNORE INTO site_membership (person_id, site_id)
  SELECT DISTINCT person_id, site_id FROM ledger_entries WHERE site_id IS NOT NULL
`);

/* ------------------------------------------------------------------ */
/* Summary                                                             */
/* ------------------------------------------------------------------ */

const [counts] = await db
  .select({
    persons: sql<number>`(SELECT COUNT(*) FROM persons)`,
    ledger: sql<number>`(SELECT COUNT(*) FROM ledger_entries)`,
    expenses: sql<number>`(SELECT COUNT(*) FROM expenses)`,
    memberships: sql<number>`(SELECT COUNT(*) FROM site_membership)`,
  })
  .from(sql`(SELECT 1)`);

console.log(`
Demo data loaded:
  ${siteRows.length} sites (${activeSites.length} active; statuses active / on hold / completed; 1 deactivated)
  ${categoryRows.length} categories (1 inactive), ${typeRows.length} person types (1 inactive)
  ${userRows.length} users, ${counts.persons} persons (${personRows.filter((p) => p.isActive === 0).length} inactive)
  ${counts.ledger} ledger entries, ${counts.expenses} expenses, ${counts.memberships} site memberships

Sign in with any of these (password for all: ${PASSWORD}):
${USER_DEFS.map(
  (u) =>
    `  ${u.mobile}  ${u.name.padEnd(22)} ${u.role.padEnd(8)}${u.active ? "" : " (inactive — can't sign in)"}${u.role === "regular" ? `  sites: ${u.sites.length ? u.sites.map((s) => SITE_DEFS[s].name).join(", ") : "none"}` : ""}`,
).join("\n")}
`);
