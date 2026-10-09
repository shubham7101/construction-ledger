import { describe, expect, it, mock } from "bun:test";

mock.module("server-only", () => ({}));

import { displayDate, fmt, iso } from "@/lib/format";
import { normalizeName } from "@/lib/normalize";
import { parseSearchParams } from "@/lib/params";
import { canEditOrDeleteRecord, isShowAllUsers } from "@/server/permissions";

describe("Permissions Unit Tests", () => {
  const adminUser = {
    id: 1,
    name: "Rajesh",
    mobile: "9876543210",
    role: "admin" as const,
  };
  const regularUser = {
    id: 2,
    name: "Amit",
    mobile: "9876543211",
    role: "regular" as const,
  };

  it("should allow admin to edit or delete any record", () => {
    expect(canEditOrDeleteRecord(adminUser, 2)).toBe(true);
    expect(canEditOrDeleteRecord(adminUser, 1)).toBe(true);
  });

  it("should only allow regular user to edit or delete their own record", () => {
    expect(canEditOrDeleteRecord(regularUser, 2)).toBe(true);
    expect(canEditOrDeleteRecord(regularUser, 1)).toBe(false);
  });

  it("should evaluate isShowAllUsers correctly", () => {
    expect(isShowAllUsers(adminUser, "1")).toBe(true);
    expect(isShowAllUsers(adminUser, "true")).toBe(true);
    expect(isShowAllUsers(adminUser, "0")).toBe(false);
    expect(isShowAllUsers(regularUser, "1")).toBe(false);
  });
});

describe("Date and Currency Format Unit Tests", () => {
  it("should convert ISO date to display format DD/MM/YYYY", () => {
    expect(displayDate("2026-09-30")).toBe("30/09/2026");
  });

  it("should convert DD/MM/YYYY to ISO date", () => {
    expect(iso("30/09/2026")).toBe("2026-09-30");
  });

  it("should format currency properly", () => {
    expect(fmt(15000)).toBe("₹15,000");
  });
});

describe("Search Params Parser Unit Tests", () => {
  it("should parse valid search params with defaults", () => {
    const parsed = parseSearchParams({
      all: "1",
      type: "credit",
      dm: "range",
      d1: "2026-09-01",
      d2: "2026-09-30",
    });

    expect(parsed.all).toBe(true);
    expect(parsed.type).toBe("credit");
    expect(parsed.dm).toBe("range");
    expect(parsed.d1).toBe("2026-09-01");
    expect(parsed.d2).toBe("2026-09-30");
  });

  it('treats a missing or "all" person type as no filter', () => {
    expect(parseSearchParams({}).ptype).toBe("");
    expect(parseSearchParams({ ptype: "All" }).ptype).toBe("");
    expect(parseSearchParams({ ptype: "all" }).ptype).toBe("");
    expect(parseSearchParams({ ptype: "mason" }).ptype).toBe("mason");
  });
});

describe("normalizeName", () => {
  it("trims, collapses spaces and capitalises each word", () => {
    expect(normalizeName("  fly   ASH ")).toBe("Fly Ash");
    expect(normalizeName("cement")).toBe("Cement");
    expect(normalizeName("pvc-pipe")).toBe("Pvc-Pipe");
    expect(normalizeName("Electrician")).toBe("Electrician");
  });
});
