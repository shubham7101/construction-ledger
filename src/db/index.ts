import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

const url = process.env.DATABASE_URL ?? "file:./local.db";

const client = createClient({
  url,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

// Local file only. Over Turso every execute() is its own HTTP stream, so a
// connection PRAGMA would not outlive its request — it would only add a
// round trip to every cold start.
if (url.startsWith("file:")) {
  await client.execute("PRAGMA journal_mode = WAL");
  await client.execute("PRAGMA synchronous = NORMAL"); // safe with WAL, faster writes
  await client.execute("PRAGMA busy_timeout = 5000");
  await client.execute("PRAGMA foreign_keys = ON");
}

export const db = drizzle(client, { schema });

/** The handle passed to `db.transaction(async (tx) => ...)`. */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
