import { mock } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Tests must never touch the development database (local.db). The preload
// runs before any test file is evaluated, so the DATABASE_URL is guaranteed
// to be in place before `src/db` (or anything importing it) is loaded —
// regardless of which test file bun evaluates first. The file is wiped on
// every run so each test run starts from a freshly migrated schema.
const TEST_DB_PATH = join(tmpdir(), "construction-ledger-test.db");
for (const suffix of ["", "-journal", "-wal", "-shm"]) {
  const path = `${TEST_DB_PATH}${suffix}`;
  if (existsSync(path)) rmSync(path, { force: true });
}
process.env.DATABASE_URL = `file:${TEST_DB_PATH}`;
process.env.JWT_SECRET = "test-only-jwt-secret-that-is-longer-than-32-chars";

mock.module("server-only", () => ({}));
