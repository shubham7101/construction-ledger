import { eq, sql } from "drizzle-orm";
import { normalizeName } from "@/lib/normalize";
import { hashPassword } from "@/server/auth/password";
import { db } from "./index";
import { categories, persons, personTypes, users } from "./schema";

// ---- Edit these lists ----
const CATEGORY_NAMES = ["Cement", "Steel", "Labour", "Transport", "Electrical"];
const PERSON_TYPE_NAMES = [
  "Contractor",
  "Mason",
  "Electrician",
  "Plumber",
  "Supplier",
];
const ADMIN_NAME = "Shubham Dhameliya";
// Users get a linked person of this type (as createUserAction does).
const USER_PERSON_TYPE = "Contractor";
// --------------------------

const adminMobile = process.env.SEED_ADMIN_MOBILE;
const adminPassword = process.env.SEED_ADMIN_PASSWORD;

if (!adminMobile || !/^\d{10}$/.test(adminMobile)) {
  throw new Error("Set SEED_ADMIN_MOBILE to a 10-digit number");
}
if (!adminPassword || adminPassword.length < 8) {
  throw new Error("Set SEED_ADMIN_PASSWORD (min 8 characters)");
}

const passwordHash = await hashPassword(adminPassword);

/**
 * Bring names stored before normalisation (e.g. "cement") to the canonical
 * form ("Cement") so the inserts below don't add case-variant duplicates.
 * A row is skipped if its canonical form already exists as another row.
 */
async function normalizeExisting(
  table: typeof categories | typeof personTypes,
) {
  const rows = await db.select({ id: table.id, name: table.name }).from(table);
  const taken = new Set(rows.map((r) => r.name));
  for (const row of rows) {
    const name = normalizeName(row.name);
    if (name === row.name || taken.has(name)) continue;
    await db.update(table).set({ name }).where(eq(table.id, row.id));
    taken.add(name);
  }
}
await normalizeExisting(categories);
await normalizeExisting(personTypes);

// db.batch runs all statements atomically: all succeed or none do
await db.batch([
  db
    .insert(users)
    .values({
      name: ADMIN_NAME,
      mobile: adminMobile,
      passwordHash,
      role: "admin",
    })
    .onConflictDoNothing({ target: users.mobile }),

  db
    .insert(categories)
    .values(CATEGORY_NAMES.map((name) => ({ name: normalizeName(name) })))
    .onConflictDoNothing({ target: categories.name }),

  db
    .insert(personTypes)
    .values(PERSON_TYPE_NAMES.map((name) => ({ name: normalizeName(name) })))
    .onConflictDoNothing({ target: personTypes.name }),

  // The admin's own person, linked to the account. After the inserts above
  // so the user and person type exist; skipped if the account has one.
  db.run(sql`
    INSERT INTO ${persons} (name, mobile, person_type_id, user_id)
    SELECT u.name, u.mobile, pt.id, u.id
    FROM ${users} u, ${personTypes} pt
    WHERE u.mobile = ${adminMobile}
      AND pt.name = ${normalizeName(USER_PERSON_TYPE)}
    ON CONFLICT (user_id) DO NOTHING
  `),
]);

console.log("Seed complete");
