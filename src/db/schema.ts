import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    mobile: text("mobile").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    role: text("role", { enum: ["admin", "regular"] })
      .notNull()
      .default("regular"),
    isActive: integer("is_active").notNull().default(1),
    // Set on every successful sign-in; null until the first one.
    lastLoginAt: text("last_login_at"),
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => [
    check(
      "users_mobile_10_digits",
      sql`length(${table.mobile}) = 10 AND ${table.mobile} NOT GLOB '*[^0-9]*'`,
    ),
  ],
);

export const sites = sqliteTable("sites", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  address: text("address").notNull().default(""),
  city: text("city").notNull(),
  state: text("state").notNull().default(""),
  // Project stage (shown as a badge); separate from is_active (soft delete).
  status: text("status", { enum: ["active", "completed", "on_hold"] })
    .notNull()
    .default("active"),
  isActive: integer("is_active").notNull().default(1),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const userSiteAccess = sqliteTable(
  "user_site_access",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    siteId: integer("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.siteId] }),
    index("idx_usa_site").on(table.siteId),
  ],
);

export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  // Soft delete: inactive categories stay on old entries but leave the pickers.
  isActive: integer("is_active").notNull().default(1),
});

export const personTypes = sqliteTable("person_types", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  // Soft delete, as for categories.
  isActive: integer("is_active").notNull().default(1),
});

export const persons = sqliteTable(
  "persons",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    mobile: text("mobile").notNull(),
    /** Optional second number: "" or 10 digits. */
    mobile2: text("mobile_2").notNull().default(""),
    email: text("email").notNull().default(""),
    address: text("address").notNull().default(""),
    // Soft delete: inactive persons leave the lists and pickers; entries stay.
    isActive: integer("is_active").notNull().default(1),
    personTypeId: integer("person_type_id")
      .notNull()
      .references(() => personTypes.id, { onDelete: "restrict" }),
    userId: integer("user_id")
      .references(() => users.id, {
        onDelete: "set null",
      })
      .unique(),
  },
  (table) => [
    check(
      "persons_mobile_10_digits",
      sql`length(${table.mobile}) = 10 AND ${table.mobile} NOT GLOB '*[^0-9]*'`,
    ),
    check(
      "persons_mobile2_10_digits",
      sql`${table.mobile2} = '' OR (length(${table.mobile2}) = 10 AND ${table.mobile2} NOT GLOB '*[^0-9]*')`,
    ),
    index("idx_persons_mobile").on(table.mobile),
  ],
);

/**
 * Which sites a person has at least one ledger entry on. Derived from
 * ledger_entries and kept in sync inside the same transaction as every
 * ledger create / update / delete (see server/actions/ledger.ts).
 */
export const siteMembership = sqliteTable(
  "site_membership",
  {
    personId: integer("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    siteId: integer("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.personId, table.siteId] }),
    index("idx_membership_site").on(table.siteId),
  ],
);

export const ledgerEntries = sqliteTable(
  "ledger_entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    personId: integer("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "restrict" }),
    type: text("type", { enum: ["credit", "debit"] }).notNull(),
    amount: real("amount").notNull(), // Integer rupees
    date: text("date").notNull(), // YYYY-MM-DD
    siteId: integer("site_id").references(() => sites.id, {
      onDelete: "restrict",
    }),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    mode: text("mode", {
      enum: ["cash", "upi", "bank_transfer", "cheque"],
    }).notNull(),
    note: text("note").notNull().default(""),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: text("updated_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull()
      .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    check("ledger_amount_positive", sql`${table.amount} > 0`),
    check("ledger_date_valid", sql`date(${table.date}) IS ${table.date}`),
    index("idx_ledger_person_date").on(table.personId, table.date),
    index("idx_ledger_site_date").on(table.siteId, table.date),
    index("idx_ledger_by_date").on(table.createdBy, table.date),
    index("idx_ledger_category_date").on(table.categoryId, table.date),
  ],
);

export const expenses = sqliteTable(
  "expenses",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    amount: real("amount").notNull(), // Integer rupees
    date: text("date").notNull(), // YYYY-MM-DD
    siteId: integer("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "restrict" }),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    note: text("note").notNull().default(""),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: text("updated_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull()
      .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    check("ledger_amount_positive", sql`${table.amount} > 0`),
    check("ledger_date_valid", sql`date(${table.date}) IS ${table.date}`),
    index("idx_expense_site_date").on(table.siteId, table.date),
    index("idx_expense_by_date").on(table.createdBy, table.date),
    index("idx_expense_category_date").on(table.categoryId, table.date),
  ],
);

/**
 * Per-user totals over the entries and expenses that user created: the
 * overview hero and counts. Derived from ledger_entries / expenses and
 * re-derived in the same batch as every write (see server/balances.ts).
 */
export const userBalances = sqliteTable("user_balances", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  credit: real("credit").notNull().default(0),
  debit: real("debit").notNull().default(0), // ledger debits only
  entries: integer("entries").notNull().default(0),
  expense: real("expense").notNull().default(0),
  expenses: integer("expenses").notNull().default(0),
});

/**
 * Per-person totals over all their ledger entries, by every user: the
 * passbook's "Show all users" totals across all sites. Kept in sync like
 * user_balances.
 */
export const personBalances = sqliteTable("person_balances", {
  personId: integer("person_id")
    .primaryKey()
    .references(() => persons.id, { onDelete: "cascade" }),
  credit: real("credit").notNull().default(0),
  debit: real("debit").notNull().default(0),
  entries: integer("entries").notNull().default(0),
});

/**
 * Ledger totals per (creator, person, site): what the persons list, passbook,
 * site page and ledgers list sum when no date / category filter applies.
 * site_id 0 = "No site" (a NULL key column would never conflict, so upserts
 * could not find the row). Kept by server/balances.ts like the tables above;
 * a row stays at zero once its last entry is gone.
 */
export const ledgerBalances = sqliteTable(
  "ledger_balances",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    personId: integer("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    siteId: integer("site_id").notNull(),
    credit: real("credit").notNull().default(0),
    debit: real("debit").notNull().default(0),
    entries: integer("entries").notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.personId, table.siteId] }),
    index("idx_lb_person_site").on(table.personId, table.siteId),
    index("idx_lb_site").on(table.siteId),
  ],
);

/** Expense totals per (creator, site), kept like ledger_balances. */
export const expenseBalances = sqliteTable(
  "expense_balances",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    siteId: integer("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    total: real("total").notNull().default(0),
    count: integer("count").notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.siteId] }),
    index("idx_eb_site").on(table.siteId),
  ],
);
