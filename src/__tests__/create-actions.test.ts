/**
 * Integration tests for every "create" server action:
 *
 *   - createLedgerEntryAction
 *   - createExpenseAction
 *   - createPersonAction
 *   - createSiteAction
 *   - createCategoryAction
 *   - createPersonTypeAction
 *   - createUserAction
 *
 * Each action is exercised with a wide variety of payloads (valid, edge
 * case, malformed and permission-denied). The tests run against a
 * throw-away SQLite database migrated from ./drizzle and use the real
 * auth chain (jose JWT -> getCurrentUser -> requireUser / requireAdmin);
 * only `next/cache` and `next/headers` are stubbed because `bun test`
 * runs outside of a Next.js request scope.
 */
import { beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { join } from "node:path";

// --- Test environment (DATABASE_URL / JWT_SECRET) is provided by the preload
// (src/__tests__/setup.ts) so it is in place before *any* module is loaded.
// Guard against ever hitting the real development database.
if (
  !process.env.DATABASE_URL?.startsWith("file:") ||
  process.env.DATABASE_URL.includes("local.db")
) {
  throw new Error(
    `Refusing to run create-action tests against "${process.env.DATABASE_URL}" — expected a temp file database provided by src/__tests__/setup.ts`,
  );
}

// Server actions also call revalidatePath() / cookies() which require a live
// Next.js request scope, so those two modules are stubbed for this run.
// They are registered before the dynamic imports below on purpose.
mock.module("next/cache", () => ({
  revalidatePath: async () => {},
  revalidateTag: async () => {},
}));

let sessionToken: string | null = null;

mock.module("next/headers", () => ({
  cookies: async () => ({
    get: (name?: string) =>
      name === "cl_token" && sessionToken
        ? { name, value: sessionToken }
        : undefined,
    getAll: () =>
      sessionToken ? [{ name: "cl_token", value: sessionToken }] : [],
    has: () => sessionToken !== null,
    set: () => {},
    delete: () => {},
  }),
  headers: async () => new Headers(),
}));

// Dynamic imports: the module stubs above have to be registered before the
// db / auth / actions modules are evaluated.
const { db } = await import("@/db");
const schema = await import("@/db/schema");
const { migrate } = await import("drizzle-orm/libsql/migrator");
const { and, eq } = await import("drizzle-orm");
const { compareSync, hashSync } = await import("bcryptjs");
const { SignJWT } = await import("jose");
const actions = {
  ...(await import("@/server/actions/ledger")),
  ...(await import("@/server/actions/expense")),
  ...(await import("@/server/actions/person")),
  ...(await import("@/server/actions/admin")),
  ...(await import("@/server/actions/profile")),
  ...(await import("@/server/actions/auth")),
};

// --- Fixtures created once for the whole run --------------------------------
let adminId: number;
let regularId: number;
let siteAId: number;
let siteBId: number;
let categoryId: number;
let personTypeId: number;
let personId: number;

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET as string);

async function signInAs(role: "admin" | "regular") {
  const userId = role === "admin" ? adminId : regularId;
  // Same claim shape as createJwtToken(): the user id lives in `sub`.
  sessionToken = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(userId))
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(JWT_SECRET);
}

function signOut() {
  sessionToken = null;
}

async function grantSiteAccess(userId: number, siteId: number) {
  await db
    .insert(schema.userSiteAccess)
    .values({ userId, siteId })
    .onConflictDoNothing();
}

async function revokeSiteAccess(userId: number, siteId: number) {
  await db
    .delete(schema.userSiteAccess)
    .where(
      and(
        eq(schema.userSiteAccess.userId, userId),
        eq(schema.userSiteAccess.siteId, siteId),
      ),
    );
}

// --- Assertion helpers ------------------------------------------------------
type LooseResult = { ok: true; data?: unknown } | { ok: false; error: string };

async function expectOk(label: string, promise: Promise<LooseResult>) {
  const res = await promise;
  if (!res.ok) {
    throw new Error(`Expected "${label}" to succeed, but got: ${res.error}`);
  }
  expect(res.ok).toBe(true);
  return res;
}

async function expectFail(label: string, promise: Promise<LooseResult>) {
  const res = await promise;
  if (res.ok) {
    throw new Error(`Expected "${label}" to fail, but it succeeded`);
  }
  expect(typeof res.error).toBe("string");
  expect(res.error.length).toBeGreaterThan(0);
  return res;
}

/** Actions reject with a NEXT_REDIRECT error when not authorised. */
async function expectRejected(label: string, promise: Promise<unknown>) {
  const outcome = await promise.then(
    () => "resolved" as const,
    () => "rejected" as const,
  );
  if (outcome !== "rejected") {
    throw new Error(
      `Expected "${label}" to redirect (reject), but it resolved`,
    );
  }
  expect(outcome).toBe("rejected");
}

beforeAll(async () => {
  await migrate(db, {
    migrationsFolder: join(import.meta.dir, "..", "..", "drizzle"),
  });

  const [admin] = await db
    .insert(schema.users)
    .values({
      name: "Admin User",
      mobile: "9000000001",
      passwordHash: hashSync("admin-pass-123", 4),
      role: "admin",
      isActive: 1,
    })
    .returning();
  adminId = admin.id;

  const [regular] = await db
    .insert(schema.users)
    .values({
      name: "Regular User",
      mobile: "9000000002",
      passwordHash: hashSync("regular-pass-123", 4),
      role: "regular",
      isActive: 1,
    })
    .returning();
  regularId = regular.id;

  const [siteA] = await db
    .insert(schema.sites)
    .values({
      name: "Tower",
      city: "Pune",
      status: "active",
      isActive: 1,
    })
    .returning();
  siteAId = siteA.id;

  const [siteB] = await db
    .insert(schema.sites)
    .values({
      name: "Villa",
      city: "Mumbai",
      status: "active",
      isActive: 1,
    })
    .returning();
  siteBId = siteB.id;

  const [cat] = await db
    .insert(schema.categories)
    .values({ name: "Cement" })
    .returning();
  categoryId = cat.id;

  const [ptype] = await db
    .insert(schema.personTypes)
    .values({ name: "Civil" })
    .returning();
  personTypeId = ptype.id;

  const [person] = await db
    .insert(schema.persons)
    .values({
      name: "Ramesh Kumar",
      mobile: "9111111111",
      personTypeId: ptype.id,
    })
    .returning();
  personId = person.id;
});

// The temp database file itself is owned by src/__tests__/setup.ts (preload).

// Every test starts as an authenticated admin unless it says otherwise.
beforeEach(async () => {
  await signInAs("admin");
});
describe("createLedgerEntryAction", () => {
  it("creates a credit entry with a full payload", async () => {
    await expectOk(
      "full credit payload",
      actions.createLedgerEntryAction({
        personId,
        type: "credit",
        amount: 15000,
        date: "2026-09-30",
        siteId: siteAId,
        categoryId,
        mode: "upi",
        note: "LEDGER_FULL_PAYLOAD",
      }),
    );

    const rows = await db
      .select()
      .from(schema.ledgerEntries)
      .where(eq(schema.ledgerEntries.note, "LEDGER_FULL_PAYLOAD"));

    expect(rows.length).toBe(1);
    const row = rows[0];
    expect(row.amount).toBe(15000);
    expect(row.type).toBe("credit");
    expect(row.mode).toBe("upi");
    expect(row.date).toBe("2026-09-30");
    expect(row.siteId).toBe(siteAId);
    expect(row.personId).toBe(personId);
    expect(row.categoryId).toBe(categoryId);
    expect(row.createdBy).toBe(adminId);
  });

  it("creates a debit entry and converts a DD/MM/YYYY date to ISO", async () => {
    await expectOk(
      "debit payload with DD/MM/YYYY date",
      actions.createLedgerEntryAction({
        personId,
        type: "debit",
        amount: 2500,
        date: "15/08/2026",
        siteId: siteAId,
        categoryId,
        mode: "cash",
        note: "LEDGER_SLASH_DATE",
      }),
    );

    const rows = await db
      .select()
      .from(schema.ledgerEntries)
      .where(eq(schema.ledgerEntries.note, "LEDGER_SLASH_DATE"));

    expect(rows.length).toBe(1);
    expect(rows[0].date).toBe("2026-08-15");
    expect(rows[0].type).toBe("debit");
  });

  it("defaults note to '' and strips unknown extra fields", async () => {
    await expectOk(
      "payload without note plus unknown field",
      actions.createLedgerEntryAction({
        personId,
        type: "credit",
        amount: 750,
        date: "2026-10-01",
        siteId: null,
        categoryId,
        mode: "cheque",
        someUnknownField: "should-be-stripped",
      }),
    );

    const rows = await db
      .select()
      .from(schema.ledgerEntries)
      .where(eq(schema.ledgerEntries.amount, 750));

    expect(rows.length).toBe(1);
    expect(rows[0].note).toBe("");
    expect(rows[0].siteId).toBeNull();
  });

  it("accepts a regular user when siteId is null (no site scope)", async () => {
    await signInAs("regular");

    await expectOk(
      "regular user, null site",
      actions.createLedgerEntryAction({
        personId,
        type: "credit",
        amount: 100,
        date: "2026-10-02",
        siteId: null,
        categoryId,
        mode: "cash",
        note: "LEDGER_REGULAR_NULL_SITE",
      }),
    );
  });

  it("rejects a regular user without access to the site", async () => {
    await signInAs("regular");
    await revokeSiteAccess(regularId, siteBId);

    const res = await expectFail(
      "regular user without site access",
      actions.createLedgerEntryAction({
        personId,
        type: "credit",
        amount: 500,
        date: "2026-10-03",
        siteId: siteBId,
        categoryId,
        mode: "cash",
        note: "LEDGER_NO_ACCESS",
      }),
    );
    if (!res.ok) expect(res.error).toBe("You do not have access to this site");
  });

  it("allows a regular user once site access is granted", async () => {
    await signInAs("regular");
    await grantSiteAccess(regularId, siteAId);

    await expectOk(
      "regular user with granted access",
      actions.createLedgerEntryAction({
        personId,
        type: "debit",
        amount: 999,
        date: "2026-10-04",
        siteId: siteAId,
        categoryId,
        mode: "upi",
        note: "LEDGER_REGULAR_GRANTED",
      }),
    );
  });

  it("rejects a variety of invalid amounts", async () => {
    const cases: Array<[string, unknown]> = [
      ["zero", 0],
      ["negative", -500],
      ["decimal", 99.99],
      ["numeric string", "5000"],
      ["null", null],
      ["undefined", undefined],
      ["boolean", true],
    ];

    for (const [label, amount] of cases) {
      await expectFail(
        `amount=${label}`,
        actions.createLedgerEntryAction({
          personId,
          type: "credit",
          amount,
          date: "2026-09-30",
          siteId: siteAId,
          categoryId,
          mode: "cash",
        }),
      );
    }
  });

  it("rejects invalid person, type, mode, date and category payloads", async () => {
    const base = {
      personId,
      type: "credit",
      amount: 100,
      date: "2026-09-30",
      siteId: siteAId,
      categoryId,
      mode: "cash",
      note: "",
    };

    const invalidPatches: Array<[string, Record<string, unknown>]> = [
      ["missing personId", { personId: undefined }],
      ["personId zero", { personId: 0 }],
      ["personId negative", { personId: -1 }],
      ["personId as string", { personId: "2" }],
      ["type 'give'", { type: "give" }],
      ["type uppercase", { type: "CREDIT" }],
      ["missing type", { type: undefined }],
      ["mode 'card'", { mode: "card" }],
      ["missing mode", { mode: undefined }],
      ["date '30-09-2026'", { date: "30-09-2026" }],
      ["date 'not-a-date'", { date: "not-a-date" }],
      ["missing date", { date: undefined }],
      ["date as number", { date: 20260930 }],
      ["categoryId zero", { categoryId: 0 }],
      ["missing categoryId", { categoryId: undefined }],
    ];

    for (const [label, patch] of invalidPatches) {
      await expectFail(
        label,
        actions.createLedgerEntryAction({ ...base, ...patch }),
      );
    }

    await expectFail("null payload", actions.createLedgerEntryAction(null));
    await expectFail("array payload", actions.createLedgerEntryAction([]));
    await expectFail(
      "string payload",
      actions.createLedgerEntryAction("not-an-object"),
    );
  });

  it("rejects unauthenticated requests", async () => {
    signOut();
    await expectRejected(
      "createLedgerEntryAction (no session)",
      actions.createLedgerEntryAction({
        personId,
        type: "credit",
        amount: 100,
        date: "2026-09-30",
        siteId: siteAId,
        categoryId,
        mode: "cash",
      }),
    );
  });
});

describe("createExpenseAction", () => {
  it("creates an expense with a full payload", async () => {
    await expectOk(
      "full expense payload",
      actions.createExpenseAction({
        amount: 4200,
        date: "2026-09-12",
        siteId: siteAId,
        categoryId,
        note: "EXPENSE_FULL_PAYLOAD",
      }),
    );

    const rows = await db
      .select()
      .from(schema.expenses)
      .where(eq(schema.expenses.note, "EXPENSE_FULL_PAYLOAD"));

    expect(rows.length).toBe(1);
    expect(rows[0].amount).toBe(4200);
    expect(rows[0].date).toBe("2026-09-12");
    expect(rows[0].siteId).toBe(siteAId);
    expect(rows[0].categoryId).toBe(categoryId);
    expect(rows[0].createdBy).toBe(adminId);
  });

  it("converts DD/MM/YYYY dates and defaults the note to ''", async () => {
    await expectOk(
      "expense with slash date, no note, extra field",
      actions.createExpenseAction({
        amount: 1,
        date: "01/01/2026",
        siteId: siteBId,
        categoryId,
        unknownExtra: true,
      }),
    );

    const rows = await db
      .select()
      .from(schema.expenses)
      .where(eq(schema.expenses.amount, 1));

    expect(rows.length).toBe(1);
    expect(rows[0].date).toBe("2026-01-01");
    expect(rows[0].note).toBe("");
  });

  it("rejects a regular user without access to the site", async () => {
    await signInAs("regular");
    await revokeSiteAccess(regularId, siteBId);

    const res = await expectFail(
      "regular user without expense site access",
      actions.createExpenseAction({
        amount: 300,
        date: "2026-09-15",
        siteId: siteBId,
        categoryId,
        note: "EXPENSE_NO_ACCESS",
      }),
    );
    if (!res.ok) expect(res.error).toBe("You do not have access to this site");
  });

  it("allows a regular user once site access is granted", async () => {
    await signInAs("regular");
    await grantSiteAccess(regularId, siteBId);

    await expectOk(
      "regular user with expense site access",
      actions.createExpenseAction({
        amount: 300,
        date: "2026-09-15",
        siteId: siteBId,
        categoryId,
        note: "EXPENSE_REGULAR_GRANTED",
      }),
    );

    await revokeSiteAccess(regularId, siteBId);
  });

  it("rejects a variety of invalid payloads", async () => {
    const base = {
      amount: 500,
      date: "2026-09-15",
      siteId: siteAId,
      categoryId,
      note: "",
    };

    const invalidPatches: Array<[string, Record<string, unknown>]> = [
      ["amount zero", { amount: 0 }],
      ["amount negative", { amount: -999 }],
      ["amount decimal", { amount: 10.5 }],
      ["amount as string", { amount: "500" }],
      ["missing amount", { amount: undefined }],
      ["missing siteId", { siteId: undefined }],
      ["siteId zero", { siteId: 0 }],
      ["siteId negative", { siteId: -1 }],
      ["siteId as string", { siteId: "1" }],
      ["missing categoryId", { categoryId: undefined }],
      ["categoryId zero", { categoryId: 0 }],
      ["missing date", { date: undefined }],
      ["date 'not-a-date'", { date: "not-a-date" }],
      ["date '15-09-2026'", { date: "15-09-2026" }],
      ["note as number", { note: 123 }],
    ];

    for (const [label, patch] of invalidPatches) {
      await expectFail(
        label,
        actions.createExpenseAction({ ...base, ...patch }),
      );
    }

    await expectFail("null payload", actions.createExpenseAction(null));
    await expectFail(
      "number payload",
      actions.createExpenseAction(42 as unknown),
    );
  });

  it("rejects unauthenticated requests", async () => {
    signOut();
    await expectRejected(
      "createExpenseAction (no session)",
      actions.createExpenseAction({
        amount: 300,
        date: "2026-09-15",
        siteId: siteAId,
        categoryId,
      }),
    );
  });
});

describe("createPersonAction", () => {
  it("creates a person with a full payload", async () => {
    const res = await expectOk(
      "full person payload",
      actions.createPersonAction({
        name: "Suresh Patel",
        mobile: "9222222222",
        personTypeId,
      }),
    );

    const data = res.data as { id: number } | undefined;
    expect(data?.id).toBeDefined();

    const rows = await db
      .select()
      .from(schema.persons)
      .where(eq(schema.persons.id, data?.id ?? -1));

    expect(rows.length).toBe(1);
    expect(rows[0].name).toBe("Suresh Patel");
    expect(rows[0].mobile).toBe("9222222222");
    expect(rows[0].personTypeId).toBe(personTypeId);
    expect(rows[0].userId).toBeNull();
  });

  it("trims the name and strips unknown fields", async () => {
    const res = await expectOk(
      "padded person payload",
      actions.createPersonAction({
        name: "   Anita Devi   ",
        mobile: "9333333333",
        personTypeId,
        extraIgnoredField: { nested: true },
      }),
    );

    const data = res.data as { id: number } | undefined;
    const rows = await db
      .select()
      .from(schema.persons)
      .where(eq(schema.persons.id, data?.id ?? -1));

    expect(rows.length).toBe(1);
    expect(rows[0].name).toBe("Anita Devi");
  });

  it("links the person to an existing user when mobiles match", async () => {
    const res = await expectOk(
      "person mobile matching a user",
      actions.createPersonAction({
        name: "Linked Person",
        mobile: "(+91) 9000000002",
        personTypeId,
      }),
    );

    const data = res.data as { id: number } | undefined;
    const rows = await db
      .select()
      .from(schema.persons)
      .where(eq(schema.persons.id, data?.id ?? -1));

    expect(rows.length).toBe(1);
    expect(rows[0].userId).toBe(regularId);
  });

  it("allows several persons to share a mobile number", async () => {
    const payload = {
      name: "Shared Mobile",
      mobile: "9777777777",
      personTypeId,
    };
    await expectOk(
      "first shared-mobile person",
      actions.createPersonAction(payload),
    );
    await expectOk(
      "second shared-mobile person",
      actions.createPersonAction(payload),
    );

    const rows = await db
      .select()
      .from(schema.persons)
      .where(eq(schema.persons.mobile, "9777777777"));
    expect(rows.length).toBe(2);
  });

  it("does not link a user that already has a person", async () => {
    const created = await expectOk(
      "user that gets an auto-created person",
      actions.createUserAction({
        name: "Has Person",
        mobile: "9000000150",
        password: "secret-123",
      }),
    );
    const userId = (created.data as { id: number }).id;

    const res = await expectOk(
      "second person with the same mobile",
      actions.createPersonAction({
        name: "Same Mobile Person",
        mobile: "9000000150",
        personTypeId,
      }),
    );

    const rows = await db
      .select()
      .from(schema.persons)
      .where(eq(schema.persons.id, (res.data as { id: number }).id));
    expect(rows[0].userId).toBeNull();

    const linked = await db
      .select()
      .from(schema.persons)
      .where(eq(schema.persons.userId, userId));
    expect(linked.length).toBe(1);
  });

  it("allows a regular (non-admin) user to create a person", async () => {
    await signInAs("regular");

    await expectOk(
      "regular user creating person",
      actions.createPersonAction({
        name: "Regular Created Person",
        mobile: "9444444444",
        personTypeId,
      }),
    );
  });

  it("rejects a variety of invalid person payloads", async () => {
    const base = {
      name: "Valid Name",
      mobile: "9555555555",
      personTypeId,
    };

    const invalidPatches: Array<[string, Record<string, unknown>]> = [
      ["missing name", { name: undefined }],
      ["empty name", { name: "" }],
      ["whitespace-only name", { name: "     " }],
      ["name as number", { name: 12345 }],
      ["missing mobile", { mobile: undefined }],
      ["empty mobile", { mobile: "" }],
      ["short mobile", { mobile: "12" }],
      ["mobile as number", { mobile: 9876543210 }],
      ["missing personTypeId", { personTypeId: undefined }],
      ["personTypeId zero", { personTypeId: 0 }],
      ["personTypeId negative", { personTypeId: -5 }],
      ["personTypeId as string", { personTypeId: "1" }],
    ];

    for (const [label, patch] of invalidPatches) {
      await expectFail(
        label,
        actions.createPersonAction({ ...base, ...patch }),
      );
    }

    await expectFail("null payload", actions.createPersonAction(null));
    await expectFail("string payload", actions.createPersonAction("{}"));
  });

  it("rejects unauthenticated requests", async () => {
    signOut();
    await expectRejected(
      "createPersonAction (no session)",
      actions.createPersonAction({
        name: "No Session Person",
        mobile: "9666666666",
        personTypeId,
      }),
    );
  });
});

describe("createSiteAction", () => {
  it("stores the site name exactly as entered", async () => {
    await expectOk(
      "full site payload",
      actions.createSiteAction({ name: "Skyline Project", city: "Indore" }),
    );

    const rows = await db
      .select()
      .from(schema.sites)
      .where(eq(schema.sites.name, "Skyline Project"));

    expect(rows.length).toBe(1);
    expect(rows[0].city).toBe("Indore");
    expect(rows[0].status).toBe("active");
    expect(rows[0].isActive).toBe(1);
  });

  it("creates a site without a city (defaults to '')", async () => {
    await expectOk(
      "site payload without city",
      actions.createSiteAction({ name: "No City Site" }),
    );

    const rows = await db
      .select()
      .from(schema.sites)
      .where(eq(schema.sites.name, "No City Site"));

    expect(rows.length).toBe(1);
    expect(rows[0].city).toBe("");
  });

  it("rejects a variety of invalid site payloads", async () => {
    const invalidPayloads: Array<[string, unknown]> = [
      ["empty name", { name: "", city: "Pune" }],
      ["whitespace-only name", { name: "   ", city: "Pune" }],
      ["missing name", { city: "Pune" }],
      ["name as number", { name: 123, city: "Pune" }],
      ["name as null", { name: null, city: "Pune" }],
      ["city as number", { name: "Valid", city: 42 }],
    ];

    for (const [label, payload] of invalidPayloads) {
      await expectFail(label, actions.createSiteAction(payload));
    }

    await expectFail("null payload", actions.createSiteAction(null));
    await expectFail("array payload", actions.createSiteAction([]));
  });

  it("rejects non-admin users (requireAdmin redirects)", async () => {
    await signInAs("regular");
    await expectRejected(
      "createSiteAction as regular user",
      actions.createSiteAction({ name: "Regular Site", city: "Pune" }),
    );
  });

  it("rejects unauthenticated requests", async () => {
    signOut();
    await expectRejected(
      "createSiteAction (no session)",
      actions.createSiteAction({ name: "No Session Site" }),
    );
  });
});

describe("createCategoryAction", () => {
  it("creates a category", async () => {
    await expectOk(
      "valid category",
      actions.createCategoryAction({ name: "Steel" }),
    );

    const rows = await db
      .select()
      .from(schema.categories)
      .where(eq(schema.categories.name, "Steel"));

    expect(rows.length).toBe(1);
  });

  it("trims the name and strips unknown fields", async () => {
    await expectOk(
      "padded category name",
      actions.createCategoryAction({ name: "   Sand  ", foo: "bar" }),
    );

    const rows = await db
      .select()
      .from(schema.categories)
      .where(eq(schema.categories.name, "Sand"));

    expect(rows.length).toBe(1);
    expect(rows[0].name).toBe("Sand");
  });

  it("rejects a variety of invalid category payloads", async () => {
    const invalidPayloads: Array<[string, unknown]> = [
      ["empty name", { name: "" }],
      ["whitespace-only name", { name: "    " }],
      ["missing name", {}],
      ["name as number", { name: 42 }],
      ["name as null", { name: null }],
      ["name as array", { name: ["Bricks"] }],
    ];

    for (const [label, payload] of invalidPayloads) {
      await expectFail(label, actions.createCategoryAction(payload));
    }

    await expectFail("null payload", actions.createCategoryAction(null));
  });

  it("rejects duplicate names (including padded duplicates)", async () => {
    const res = await expectFail(
      "duplicate category",
      actions.createCategoryAction({ name: "Cement" }),
    );
    if (!res.ok)
      expect(res.error).toBe('A category named "Cement" already exists');

    await expectFail(
      "padded duplicate category",
      actions.createCategoryAction({ name: "  Cement  " }),
    );
    await expectFail(
      "different-case duplicate category",
      actions.createCategoryAction({ name: "cEMENT" }),
    );
  });

  it("rejects non-admin users (requireAdmin redirects)", async () => {
    await signInAs("regular");
    await expectRejected(
      "createCategoryAction as regular user",
      actions.createCategoryAction({ name: "Regular Category" }),
    );
  });

  it("rejects unauthenticated requests", async () => {
    signOut();
    await expectRejected(
      "createCategoryAction (no session)",
      actions.createCategoryAction({ name: "No Session Category" }),
    );
  });
});

describe("createPersonTypeAction", () => {
  it("creates a person type", async () => {
    await expectOk(
      "valid person type",
      actions.createPersonTypeAction({ name: "Plumber" }),
    );

    const rows = await db
      .select()
      .from(schema.personTypes)
      .where(eq(schema.personTypes.name, "Plumber"));

    expect(rows.length).toBe(1);
  });

  it("trims the name", async () => {
    await expectOk(
      "padded person type",
      actions.createPersonTypeAction({ name: "  Electrician  " }),
    );

    const rows = await db
      .select()
      .from(schema.personTypes)
      .where(eq(schema.personTypes.name, "Electrician"));

    expect(rows.length).toBe(1);
  });

  it("rejects a variety of invalid person type payloads", async () => {
    const invalidPayloads: Array<[string, unknown]> = [
      ["empty name", { name: "" }],
      ["whitespace-only name", { name: "   " }],
      ["missing name", {}],
      ["name as boolean", { name: true }],
      ["name as object", { name: { en: "Mason" } }],
    ];

    for (const [label, payload] of invalidPayloads) {
      await expectFail(label, actions.createPersonTypeAction(payload));
    }

    await expectFail("string payload", actions.createPersonTypeAction("Mason"));
  });

  it("rejects duplicate names", async () => {
    const res = await expectFail(
      "duplicate person type",
      actions.createPersonTypeAction({ name: "Civil" }),
    );
    if (!res.ok) {
      expect(res.error).toBe('A person type named "Civil" already exists');
    }
  });

  it("rejects non-admin users (requireAdmin redirects)", async () => {
    await signInAs("regular");
    await expectRejected(
      "createPersonTypeAction as regular user",
      actions.createPersonTypeAction({ name: "Regular Person Type" }),
    );
  });

  it("rejects unauthenticated requests", async () => {
    signOut();
    await expectRejected(
      "createPersonTypeAction (no session)",
      actions.createPersonTypeAction({ name: "No Session Person Type" }),
    );
  });
});

describe("createUserAction (new Add User feature)", () => {
  it("creates an admin user with a hashed password", async () => {
    const res = await expectOk(
      "admin-role user payload",
      actions.createUserAction({
        name: "New Admin",
        mobile: "9000000100",
        password: "secret-123",
        role: "admin",
      }),
    );

    const data = res.data as { id: number } | undefined;
    expect(data?.id).toBeDefined();

    const rows = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, data?.id ?? -1));

    expect(rows.length).toBe(1);
    expect(rows[0].name).toBe("New Admin");
    expect(rows[0].mobile).toBe("9000000100");
    expect(rows[0].role).toBe("admin");
    expect(rows[0].isActive).toBe(1);
    expect(rows[0].passwordHash).not.toBe("secret-123");
    expect(compareSync("secret-123", rows[0].passwordHash)).toBe(true);
    expect(compareSync("wrong-password", rows[0].passwordHash)).toBe(false);
  });

  it("creates a linked 'contractor' person in the same transaction", async () => {
    const res = await expectOk(
      "user payload for person check",
      actions.createUserAction({
        name: "  Person Owner  ",
        mobile: "9000000160",
        password: "secret-123",
      }),
    );
    const userId = (res.data as { id: number }).id;

    const rows = await db
      .select({
        name: schema.persons.name,
        mobile: schema.persons.mobile,
        type: schema.personTypes.name,
      })
      .from(schema.persons)
      .innerJoin(
        schema.personTypes,
        eq(schema.persons.personTypeId, schema.personTypes.id),
      )
      .where(eq(schema.persons.userId, userId));

    expect(rows).toEqual([
      { name: "Person Owner", mobile: "9000000160", type: "Contractor" },
    ]);
  });

  it("creates the 'contractor' person type when it is missing", async () => {
    // Earlier tests already use the type; move those persons off it first.
    const [contractor] = await db
      .select()
      .from(schema.personTypes)
      .where(eq(schema.personTypes.name, "Contractor"));
    if (contractor) {
      await db
        .update(schema.persons)
        .set({ personTypeId })
        .where(eq(schema.persons.personTypeId, contractor.id));
      await db
        .delete(schema.personTypes)
        .where(eq(schema.personTypes.id, contractor.id));
    }
    const before = await db
      .select()
      .from(schema.personTypes)
      .where(eq(schema.personTypes.name, "Contractor"));
    expect(before.length).toBe(0);

    await expectOk(
      "user payload without a contractor type",
      actions.createUserAction({
        name: "Type Creator",
        mobile: "9000000161",
        password: "secret-123",
      }),
    );

    const types = await db
      .select()
      .from(schema.personTypes)
      .where(eq(schema.personTypes.name, "Contractor"));
    expect(types.length).toBe(1);
  });

  it("defaults the role to 'regular' when omitted", async () => {
    const res = await expectOk(
      "user payload without role",
      actions.createUserAction({
        name: "New Regular",
        mobile: "9000000101",
        password: "secret-123",
      }),
    );

    const data = res.data as { id: number } | undefined;
    const rows = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, data?.id ?? -1));

    expect(rows.length).toBe(1);
    expect(rows[0].role).toBe("regular");
  });

  it("trims name/mobile and strips unknown fields", async () => {
    const res = await expectOk(
      "padded user payload",
      actions.createUserAction({
        name: "  Padded User  ",
        mobile: "  9000000102  ",
        password: "secret-123",
        role: "regular",
        isAdmin: true,
      }),
    );

    const data = res.data as { id: number } | undefined;
    const rows = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, data?.id ?? -1));

    expect(rows.length).toBe(1);
    expect(rows[0].name).toBe("Padded User");
    expect(rows[0].mobile).toBe("9000000102");
  });

  it("rejects duplicate mobile numbers (including reformatted ones)", async () => {
    const first = await expectOk(
      "first user with mobile 9000000103",
      actions.createUserAction({
        name: "Duplicate Test",
        mobile: "9000000103",
        password: "secret-123",
      }),
    );
    expect(first.ok).toBe(true);

    const res = await expectFail(
      "reformatted duplicate mobile",
      actions.createUserAction({
        name: "Duplicate Test Again",
        mobile: "+91 9000000103",
        password: "secret-123",
      }),
    );
    if (!res.ok) {
      expect(res.error).toBe("A user with this mobile number already exists");
    }

    // The rejected attempt must not leave a stray person behind.
    const people = await db
      .select()
      .from(schema.persons)
      .where(eq(schema.persons.mobile, "9000000103"));
    expect(people.length).toBe(1);

    await expectFail(
      "exact duplicate of seeded admin mobile",
      actions.createUserAction({
        name: "Another Admin Clone",
        mobile: "9000000001",
        password: "secret-123",
        role: "admin",
      }),
    );
  });

  it("rejects a variety of invalid user payloads", async () => {
    const base = {
      name: "Valid Name",
      mobile: "9000000104",
      password: "secret-123",
      role: "regular",
    };

    const invalidPatches: Array<[string, Record<string, unknown>]> = [
      ["missing name", { name: undefined }],
      ["empty name", { name: "" }],
      ["whitespace-only name", { name: "   " }],
      ["name as number", { name: 123 }],
      ["missing mobile", { mobile: undefined }],
      ["empty mobile", { mobile: "" }],
      ["short mobile", { mobile: "12" }],
      ["missing password", { password: undefined }],
      ["empty password", { password: "" }],
      ["5-character password", { password: "12345" }],
      ["7-character password", { password: "1234567" }],
      ["password as number", { password: 123456 }],
      ["invalid role", { role: "superadmin" }],
      ["uppercase role", { role: "Admin" }],
      ["role as number", { role: 1 }],
    ];

    for (const [label, patch] of invalidPatches) {
      await expectFail(label, actions.createUserAction({ ...base, ...patch }));
    }

    await expectFail("null payload", actions.createUserAction(null));
    await expectFail("array payload", actions.createUserAction([]));
    await expectFail("string payload", actions.createUserAction("user"));
  });

  it("rejects non-admin users (requireAdmin redirects)", async () => {
    await signInAs("regular");
    await expectRejected(
      "createUserAction as regular user",
      actions.createUserAction({
        name: "Sneaky User",
        mobile: "9000000105",
        password: "secret-123",
      }),
    );
  });

  it("rejects unauthenticated requests", async () => {
    signOut();
    await expectRejected(
      "createUserAction (no session)",
      actions.createUserAction({
        name: "No Session User",
        mobile: "9000000106",
        password: "secret-123",
      }),
    );
  });
});

describe("edit / delete permissions on detail records", () => {
  it("lets the creator and admins edit a ledger entry, but no one else", async () => {
    await signInAs("regular");
    await expectOk(
      "regular user's own entry",
      actions.createLedgerEntryAction({
        personId,
        type: "debit",
        amount: 4321,
        date: "2026-02-03",
        siteId: null,
        categoryId,
        mode: "cash",
      }),
    );
    const [own] = await db
      .select()
      .from(schema.ledgerEntries)
      .where(eq(schema.ledgerEntries.amount, 4321));

    expect((await actions.getLedgerEntryAction(own.id))?.canEdit).toBe(true);

    await signInAs("admin");
    expect((await actions.getLedgerEntryAction(own.id))?.canEdit).toBe(true);
    await expectOk(
      "admin creating an entry",
      actions.createLedgerEntryAction({
        personId,
        type: "credit",
        amount: 4322,
        date: "2026-02-03",
        siteId: null,
        categoryId,
        mode: "upi",
      }),
    );
    const [adminEntry] = await db
      .select()
      .from(schema.ledgerEntries)
      .where(eq(schema.ledgerEntries.amount, 4322));

    await signInAs("regular");
    expect((await actions.getLedgerEntryAction(adminEntry.id))?.canEdit).toBe(
      false,
    );
    await expectFail(
      "regular editing the admin's entry",
      actions.updateLedgerEntryAction(adminEntry.id, {
        personId,
        type: "credit",
        amount: 1,
        date: "2026-02-03",
        siteId: null,
        categoryId,
        mode: "upi",
      }),
    );
    await expectFail(
      "regular deleting the admin's entry",
      actions.deleteLedgerEntryAction(adminEntry.id),
    );
  });

  it("keeps the original date when an expense is edited", async () => {
    await expectOk(
      "expense to edit",
      actions.createExpenseAction({
        amount: 9876,
        date: "2026-01-15",
        siteId: siteAId,
        categoryId,
      }),
    );
    const [row] = await db
      .select()
      .from(schema.expenses)
      .where(eq(schema.expenses.amount, 9876));

    const detail = await actions.getExpenseAction(row.id);
    expect(detail?.canEdit).toBe(true);
    expect(detail?.categoryId).toBe(categoryId);

    await expectOk(
      "edit amount, same date",
      actions.updateExpenseAction(row.id, {
        amount: 9877,
        date: detail?.date ?? "",
        siteId: siteAId,
        categoryId,
      }),
    );
    const [updated] = await db
      .select()
      .from(schema.expenses)
      .where(eq(schema.expenses.id, row.id));
    expect(updated.amount).toBe(9877);
    expect(updated.date).toBe("2026-01-15");
  });
});

describe("site_membership stays in sync with ledger entries", () => {
  async function membershipSites(pid: number) {
    const rows = await db
      .select({ siteId: schema.siteMembership.siteId })
      .from(schema.siteMembership)
      .where(eq(schema.siteMembership.personId, pid));
    return rows.map((r) => r.siteId).sort((a, b) => a - b);
  }

  it("adds, moves and removes membership in the same transaction", async () => {
    const [person] = await db
      .insert(schema.persons)
      .values({ name: "Member Test", mobile: "9888888888", personTypeId })
      .returning();
    const entry = (amount: number, siteId: number | null) => ({
      personId: person.id,
      type: "credit" as const,
      amount,
      date: "2026-03-01",
      siteId,
      categoryId,
      mode: "cash" as const,
    });
    const idOf = async (amount: number) =>
      (
        await db
          .select()
          .from(schema.ledgerEntries)
          .where(
            and(
              eq(schema.ledgerEntries.personId, person.id),
              eq(schema.ledgerEntries.amount, amount),
            ),
          )
      )[0].id;

    // "No site" entries never create membership.
    await expectOk(
      "no-site entry",
      actions.createLedgerEntryAction(entry(11, null)),
    );
    expect(await membershipSites(person.id)).toEqual([]);

    // Two entries on site A → one membership row.
    await expectOk(
      "site A #1",
      actions.createLedgerEntryAction(entry(12, siteAId)),
    );
    await expectOk(
      "site A #2",
      actions.createLedgerEntryAction(entry(13, siteAId)),
    );
    expect(await membershipSites(person.id)).toEqual([siteAId]);

    // Deleting one of them keeps it; the other entry is still there.
    await expectOk(
      "delete site A #1",
      actions.deleteLedgerEntryAction(await idOf(12)),
    );
    expect(await membershipSites(person.id)).toEqual([siteAId]);

    // Moving the last site A entry to site B moves the membership.
    await expectOk(
      "move to site B",
      actions.updateLedgerEntryAction(await idOf(13), entry(13, siteBId)),
    );
    expect(await membershipSites(person.id)).toEqual([siteBId]);

    // Deleting the last site B entry removes it.
    await expectOk(
      "delete site B",
      actions.deleteLedgerEntryAction(await idOf(13)),
    );
    expect(await membershipSites(person.id)).toEqual([]);
  });
});

describe("category / person type name normalisation", () => {
  it("stores names trimmed, single-spaced and capitalised", async () => {
    await expectOk(
      "messy category name",
      actions.createCategoryAction({ name: "  fly   ASH " }),
    );
    const [cat] = await db
      .select()
      .from(schema.categories)
      .where(eq(schema.categories.name, "Fly Ash"));
    expect(cat).toBeDefined();

    await expectOk(
      "messy person type name",
      actions.createPersonTypeAction({ name: "tile  SETTER" }),
    );
    const [pt] = await db
      .select()
      .from(schema.personTypes)
      .where(eq(schema.personTypes.name, "Tile Setter"));
    expect(pt).toBeDefined();

    await expectOk(
      "rename is normalised too",
      actions.updatePersonTypeAction(pt.id, { name: "tile setters" }),
    );
    const [renamed] = await db
      .select()
      .from(schema.personTypes)
      .where(eq(schema.personTypes.id, pt.id));
    expect(renamed.name).toBe("Tile Setters");
  });
});

describe("admin update and soft delete", () => {
  it("updates a site and hides it from new entries when deactivated", async () => {
    await expectOk(
      "site to manage",
      actions.createSiteAction({ name: "Old Name", city: "Surat" }),
    );
    const [site] = await db
      .select()
      .from(schema.sites)
      .where(eq(schema.sites.name, "Old Name"));

    await expectOk(
      "rename site",
      actions.updateSiteAction(site.id, { name: "New Name", city: "Vadodara" }),
    );
    const [renamed] = await db
      .select()
      .from(schema.sites)
      .where(eq(schema.sites.id, site.id));
    expect(renamed.name).toBe("New Name");
    expect(renamed.city).toBe("Vadodara");

    await expectOk(
      "deactivate site",
      actions.setSiteActiveAction(site.id, false),
    );
    const res = await expectFail(
      "expense on an inactive site",
      actions.createExpenseAction({
        amount: 50,
        date: "2026-04-01",
        siteId: site.id,
        categoryId,
      }),
    );
    if (!res.ok) expect(res.error).toBe("This site is inactive");

    await expectOk(
      "reactivate site",
      actions.setSiteActiveAction(site.id, true),
    );
    await expectOk(
      "expense after reactivation",
      actions.createExpenseAction({
        amount: 50,
        date: "2026-04-01",
        siteId: site.id,
        categoryId,
      }),
    );
  });

  it("updates and soft-deletes categories and person types", async () => {
    await expectOk("category", actions.createCategoryAction({ name: "Paint" }));
    const [cat] = await db
      .select()
      .from(schema.categories)
      .where(eq(schema.categories.name, "Paint"));
    await expectOk(
      "rename category",
      actions.updateCategoryAction(cat.id, { name: "Paints" }),
    );
    await expectOk(
      "deactivate category",
      actions.setCategoryActiveAction(cat.id, false),
    );
    const [catAfter] = await db
      .select()
      .from(schema.categories)
      .where(eq(schema.categories.id, cat.id));
    expect(catAfter).toMatchObject({ name: "Paints", isActive: 0 });

    await expectOk(
      "person type",
      actions.createPersonTypeAction({ name: "Painter" }),
    );
    const [pt] = await db
      .select()
      .from(schema.personTypes)
      .where(eq(schema.personTypes.name, "Painter"));
    await expectOk(
      "rename person type",
      actions.updatePersonTypeAction(pt.id, { name: "Painters" }),
    );
    await expectOk(
      "deactivate person type",
      actions.setPersonTypeActiveAction(pt.id, false),
    );
    const [ptAfter] = await db
      .select()
      .from(schema.personTypes)
      .where(eq(schema.personTypes.id, pt.id));
    expect(ptAfter).toMatchObject({ name: "Painters", isActive: 0 });
  });

  it("updates a user and their linked person together", async () => {
    const created = await expectOk(
      "user to edit",
      actions.createUserAction({
        name: "Edit Me",
        mobile: "9000000170",
        password: "secret-123",
      }),
    );
    const userId = (created.data as { id: number }).id;

    await expectOk(
      "edit user, keep password",
      actions.updateUserAction(userId, {
        name: "Edited",
        mobile: "9000000171",
        role: "regular",
        password: "",
      }),
    );
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    expect(user).toMatchObject({ name: "Edited", mobile: "9000000171" });
    expect(compareSync("secret-123", user.passwordHash)).toBe(true);

    const [person] = await db
      .select()
      .from(schema.persons)
      .where(eq(schema.persons.userId, userId));
    expect(person).toMatchObject({ name: "Edited", mobile: "9000000171" });

    await expectFail(
      "taking another user's mobile",
      actions.updateUserAction(userId, {
        name: "Edited",
        mobile: "9000000001",
        role: "regular",
      }),
    );
  });

  it("stops an admin from locking themselves out", async () => {
    await expectFail(
      "deactivating yourself",
      actions.setUserActiveAction(adminId, false),
    );
    await expectFail(
      "demoting yourself",
      actions.updateUserAction(adminId, {
        name: "Admin",
        mobile: "9000000001",
        role: "regular",
      }),
    );
  });
});

describe("keyset pagination", () => {
  it("walks ledgers and the mixed site feed page by page without gaps or repeats", async () => {
    const { getLedgersPage, getLedgersSummary } = await import(
      "@/server/queries/entries"
    );
    const { getFeedPage } = await import("@/server/queries/sites");
    const { PAGE_SIZE } = await import("@/server/queries/pagination");

    const [person] = await db
      .insert(schema.persons)
      .values({ name: "Pager", mobile: "9777000001", personTypeId })
      .returning();
    const [site] = await db
      .insert(schema.sites)
      .values({ name: "Paging Site", city: "" })
      .returning();

    // 45 ledger entries + 20 expenses spread over a few dates, so many rows
    // share a date and the tie-breakers (kind, id) matter.
    const dates = ["2026-05-01", "2026-05-02", "2026-05-03"];
    await db.insert(schema.ledgerEntries).values(
      Array.from({ length: 45 }, (_, i) => ({
        personId: person.id,
        type: i % 2 ? ("debit" as const) : ("credit" as const),
        amount: 1000 + i,
        date: dates[i % 3],
        siteId: site.id,
        categoryId,
        mode: "cash" as const,
        createdBy: adminId,
      })),
    );
    await db.insert(schema.expenses).values(
      Array.from({ length: 20 }, (_, i) => ({
        amount: 5000 + i,
        date: dates[i % 3],
        siteId: site.id,
        categoryId,
        createdBy: adminId,
      })),
    );

    const user = {
      id: adminId,
      name: "Admin",
      mobile: "9000000001",
      role: "admin" as const,
    };

    // Ledgers for this site: two pages (30 + 15).
    const params = { siteId: site.id, allUsers: "1", user };
    const seen: number[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page = await getLedgersPage({ ...params, cursor });
      seen.push(...page.items.map((r) => r.id));
      cursor = page.nextCursor;
      pages++;
    } while (cursor);
    expect(pages).toBe(2);
    expect(seen.length).toBe(45);
    expect(new Set(seen).size).toBe(45);
    expect((await getLedgersSummary(params)).count).toBe(45);

    // Mixed feed: 65 rows, newest first, each exactly once.
    const feed: Array<{ k: string; id: number; date: string }> = [];
    cursor = null;
    do {
      const page = await getFeedPage({ ...params, cursor });
      expect(page.items.length).toBeLessThanOrEqual(PAGE_SIZE);
      feed.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor);
    expect(feed.length).toBe(65);
    expect(new Set(feed.map((r) => `${r.k}${r.id}`)).size).toBe(65);
    const sorted = [...feed].sort(
      (a, b) =>
        b.date.localeCompare(a.date) || b.k.localeCompare(a.k) || b.id - a.id,
    );
    expect(feed).toEqual(sorted);
  });
});

describe("site details totals", () => {
  it("shows the user's own credit/debit, or the whole site's with show-all", async () => {
    const { getSiteDetail } = await import("@/server/queries/sites");
    const [site] = await db
      .insert(schema.sites)
      .values({ name: "Totals Site", city: "" })
      .returning();
    const entry = (
      createdBy: number,
      type: "credit" | "debit",
      amount: number,
    ) => ({
      personId,
      type,
      amount,
      date: "2026-07-01",
      siteId: site.id,
      categoryId,
      mode: "cash" as const,
      createdBy,
    });
    await db
      .insert(schema.ledgerEntries)
      .values([
        entry(adminId, "credit", 1000),
        entry(adminId, "debit", 200),
        entry(regularId, "credit", 50),
      ]);
    await db.insert(schema.expenses).values({
      amount: 30,
      date: "2026-07-01",
      siteId: site.id,
      categoryId,
      createdBy: adminId,
    });

    const admin = {
      id: adminId,
      name: "Admin",
      mobile: "9000000001",
      role: "admin" as const,
    };
    const own = await getSiteDetail({ siteId: site.id, user: admin });
    expect(own).toMatchObject({
      credit: 1000,
      debit: 230,
      expenses: 30,
      count: 3,
    });

    const everyone = await getSiteDetail({
      siteId: site.id,
      allUsers: "1",
      user: admin,
    });
    expect(everyone).toMatchObject({ credit: 1050, debit: 230, count: 4 });

    // Inactive sites have no details page.
    await db
      .update(schema.sites)
      .set({ isActive: 0 })
      .where(eq(schema.sites.id, site.id));
    expect(await getSiteDetail({ siteId: site.id, user: admin })).toBeNull();
  });
});

/** Signs in as any user id (same token shape as signInAs). */
async function signInAsId(userId: number) {
  sessionToken = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(userId))
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(JWT_SECRET);
}

describe("profile: edit profile and change password", () => {
  it("updates your name and mobile together with your person record", async () => {
    const created = await expectOk(
      "profile owner",
      actions.createUserAction({
        name: "Profile Owner",
        mobile: "9000000180",
        password: "start-pass-1",
      }),
    );
    const userId = (created.data as { id: number }).id;
    await signInAsId(userId);

    await expectOk(
      "edit own profile",
      actions.updateMyProfileAction({ name: "Renamed", mobile: "9000000181" }),
    );
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    expect(user).toMatchObject({ name: "Renamed", mobile: "9000000181" });
    const [person] = await db
      .select()
      .from(schema.persons)
      .where(eq(schema.persons.userId, userId));
    expect(person).toMatchObject({ name: "Renamed", mobile: "9000000181" });

    await expectFail(
      "taking another user's mobile",
      actions.updateMyProfileAction({ name: "Renamed", mobile: "9000000001" }),
    );

    const wrong = await expectFail(
      "wrong current password",
      actions.changeMyPasswordAction({ current: "nope", next: "new-pass-123" }),
    );
    if (!wrong.ok) expect(wrong.error).toBe("Current password is incorrect");
    await expectFail(
      "too-short new password",
      actions.changeMyPasswordAction({
        current: "start-pass-1",
        next: "short",
      }),
    );
    await expectOk(
      "change password",
      actions.changeMyPasswordAction({
        current: "start-pass-1",
        next: "new-pass-123",
      }),
    );
    const [after] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    expect(compareSync("new-pass-123", after.passwordHash)).toBe(true);
  });

  it("records the last login time on sign-in", async () => {
    signOut();
    await expectOk(
      "login",
      actions.loginAction({
        mobile: "9000000002",
        password: "regular-pass-123",
      }),
    );
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, regularId));
    expect(user.lastLoginAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });
});

describe("persons: edit, extra fields and soft delete", () => {
  it("edits a person, validates the optional fields, and deactivates", async () => {
    const created = await expectOk(
      "person to edit",
      actions.createPersonAction({
        name: "Edit Target",
        mobile: "9333300001",
        mobile2: "+91 93333 00002",
        email: "Target@Example.com ",
        address: "  12 MG Road ",
        personTypeId,
      }),
    );
    const id = (created.data as { id: number }).id;
    const [row] = await db
      .select()
      .from(schema.persons)
      .where(eq(schema.persons.id, id));
    expect(row).toMatchObject({
      mobile2: "9333300002",
      email: "target@example.com",
      address: "12 MG Road",
      isActive: 1,
    });

    await expectFail(
      "bad email",
      actions.updatePersonAction(id, {
        name: "Edit Target",
        mobile: "9333300001",
        email: "not-an-email",
        personTypeId,
      }),
    );
    await expectFail(
      "short second mobile",
      actions.updatePersonAction(id, {
        name: "Edit Target",
        mobile: "9333300001",
        mobile2: "123",
        personTypeId,
      }),
    );
    await expectOk(
      "valid edit",
      actions.updatePersonAction(id, {
        name: "Edited Target",
        mobile: "9333300009",
        personTypeId,
      }),
    );
    const detail = await actions.getPersonAction(id);
    expect(detail).toMatchObject({
      name: "Edited Target",
      mobile: "9333300009",
      mobile2: "",
      active: true,
    });

    // Regular users can't deactivate; admins can, and then no new entries.
    await signInAs("regular");
    await expectRejected(
      "regular deactivating",
      actions.setPersonActiveAction(id, false),
    );
    await signInAs("admin");
    await expectOk("deactivate", actions.setPersonActiveAction(id, false));
    const res = await expectFail(
      "entry for inactive person",
      actions.createLedgerEntryAction({
        personId: id,
        type: "credit",
        amount: 10,
        date: "2026-08-01",
        siteId: null,
        categoryId,
        mode: "cash",
      }),
    );
    if (!res.ok) expect(res.error).toBe("This person is inactive");
  });

  it("won't change a linked person's mobile (it's that user's login)", async () => {
    const created = await expectOk(
      "linked user",
      actions.createUserAction({
        name: "Linked Login",
        mobile: "9000000190",
        password: "linked-pass-1",
      }),
    );
    const userId = (created.data as { id: number }).id;
    const [person] = await db
      .select()
      .from(schema.persons)
      .where(eq(schema.persons.userId, userId));

    await expectFail(
      "change linked mobile",
      actions.updatePersonAction(person.id, {
        name: "Linked Login",
        mobile: "9000000191",
        personTypeId: person.personTypeId,
      }),
    );
    await expectOk(
      "rename linked person",
      actions.updatePersonAction(person.id, {
        name: "Linked Renamed",
        mobile: "9000000190",
        personTypeId: person.personTypeId,
      }),
    );
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    expect(user.name).toBe("Linked Renamed");
  });
});

describe("sites: address, state and status", () => {
  it("saves the new site fields", async () => {
    await expectOk(
      "site with details",
      actions.createSiteAction({
        name: "Detailed Site",
        address: "Plot 4",
        city: "Nashik",
        state: "Maharashtra",
        status: "on_hold",
      }),
    );
    const [row] = await db
      .select()
      .from(schema.sites)
      .where(eq(schema.sites.name, "Detailed Site"));
    expect(row).toMatchObject({
      address: "Plot 4",
      state: "Maharashtra",
      status: "on_hold",
    });
    await expectFail(
      "unknown status",
      actions.createSiteAction({ name: "Bad Status", status: "done" }),
    );
  });
});

describe("categories view and filters", () => {
  it("breaks money down by category and filters feeds by category / person", async () => {
    const { getCategoryBreakdown } = await import(
      "@/server/queries/categories"
    );
    const { getFeedPage, getSitePersons } = await import(
      "@/server/queries/sites"
    );
    const { getLedgersSummary } = await import("@/server/queries/entries");

    const [site] = await db
      .insert(schema.sites)
      .values({ name: "Category Site", city: "" })
      .returning();
    const [catB] = await db
      .insert(schema.categories)
      .values({ name: "Breakdown B" })
      .returning();
    const [p2] = await db
      .insert(schema.persons)
      .values({ name: "Second Person", mobile: "9444400002", personTypeId })
      .returning();
    const entry = (
      pid: number,
      cat: number,
      type: "credit" | "debit",
      amount: number,
    ) => ({
      personId: pid,
      type,
      amount,
      date: "2026-09-01",
      siteId: site.id,
      categoryId: cat,
      mode: "cash" as const,
      createdBy: adminId,
    });
    await db
      .insert(schema.ledgerEntries)
      .values([
        entry(personId, categoryId, "credit", 600),
        entry(personId, catB.id, "debit", 100),
        entry(p2.id, catB.id, "credit", 200),
      ]);
    await db.insert(schema.expenses).values({
      amount: 100,
      date: "2026-09-01",
      siteId: site.id,
      categoryId: catB.id,
      createdBy: adminId,
    });
    await db.insert(schema.siteMembership).values([
      { personId, siteId: site.id },
      { personId: p2.id, siteId: site.id },
    ]);

    const user = {
      id: adminId,
      name: "Admin",
      mobile: "9000000001",
      role: "admin" as const,
    };
    const base = { siteId: site.id, allUsers: "1", user };

    const { grandTotal, rows } = await getCategoryBreakdown({
      ...base,
      filter: { dm: "any" },
    });
    expect(grandTotal).toBe(1000);
    const b = rows.find((r) => r.id === catB.id);
    expect(b).toMatchObject({
      credit: 200,
      debit: 100,
      expense: 100,
      total: 400,
    });
    expect(b?.share).toBeCloseTo(0.4);

    // Category filter on the ledgers list.
    const filtered = await getLedgersSummary({
      ...base,
      filter: { dm: "any", categoryId: catB.id },
    });
    expect(filtered).toMatchObject({ count: 2, credit: 200, debit: 100 });

    // Person filter on the feed: that person's ledger rows only, no expenses.
    const feed = await getFeedPage({
      ...base,
      filter: { dm: "any", personId: p2.id },
    });
    expect(feed.items.map((i) => i.k)).toEqual(["L"]);

    const people = await getSitePersons({ ...base, filter: { dm: "any" } });
    expect(people).toEqual([
      { id: personId, name: "Ramesh Kumar", net: 500 },
      { id: p2.id, name: "Second Person", net: 200 },
    ]);
  });
});
