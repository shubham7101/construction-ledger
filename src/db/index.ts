import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

const url = process.env.DATABASE_URL ?? "file:./local.db";

const client = createClient({
  url,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

if (url.startsWith("file:")) {
  await client.execute("PRAGMA journal_mode = WAL");
  await client.execute("PRAGMA synchronous = NORMAL"); // safe with WAL, faster writes
  await client.execute("PRAGMA busy_timeout = 5000");
}

// Run on every connection type so you're not relying on defaults
await client.execute("PRAGMA foreign_keys = ON");

export const db = drizzle(client, { schema });

/** The handle passed to `db.transaction(async (tx) => ...)`. */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
