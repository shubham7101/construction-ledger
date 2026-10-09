import { describe, expect, it } from "bun:test";
import {
  buildSheetUrl,
  isSheetParam,
  parseSheetKind,
  SHEET_KEYS,
} from "@/lib/sheet-params";

const ALL_KINDS = ["addmenu", "add", "filter", "entry", "expense"] as const;

describe("parseSheetKind", () => {
  it("accepts every known sheet kind", () => {
    for (const kind of ALL_KINDS) {
      expect(parseSheetKind(kind)).toBe(kind);
    }
  });

  it("rejects null, empty and unknown values", () => {
    expect(parseSheetKind(null)).toBeNull();
    expect(parseSheetKind("")).toBeNull();
    expect(parseSheetKind("bogus")).toBeNull();
    // Param *names* must never be mistaken for kinds (regression guard).
    expect(parseSheetKind("sheet")).toBeNull();
    expect(parseSheetKind("id")).toBeNull();
  });
});

describe("isSheetParam", () => {
  it("classifies sheet-layer params", () => {
    for (const key of SHEET_KEYS) {
      expect(isSheetParam(key)).toBe(true);
    }
    expect(isSheetParam("site")).toBe(false);
    expect(isSheetParam("q")).toBe(false);
    expect(isSheetParam("sort")).toBe(false);
  });
});

describe("buildSheetUrl", () => {
  const HREF =
    "https://example.test/ledgers?site=3&q=abc&sheet=add&k=ledger&id=9";

  it("opens a sheet while preserving data params", () => {
    expect(buildSheetUrl(HREF, { sheet: "entry", id: 7 })).toBe(
      "/ledgers?site=3&q=abc&sheet=entry&id=7",
    );
  });

  it("clears every sheet-layer param when closing", () => {
    expect(buildSheetUrl(HREF, {})).toBe("/ledgers?site=3&q=abc");
  });

  it("replaces the previous sheet instead of stacking params", () => {
    const next = buildSheetUrl("https://example.test/persons?sheet=addmenu", {
      sheet: "add",
      k: "ledger",
    });
    expect(next).toBe("/persons?sheet=add&k=ledger");
  });

  it("stringifies numeric aux params", () => {
    const next = buildSheetUrl("https://example.test/", {
      sheet: "add",
      k: "ledger",
      pid: 42,
      dir: "debit",
    });
    expect(next).toBe("/?sheet=add&k=ledger&pid=42&dir=debit");
  });
});
