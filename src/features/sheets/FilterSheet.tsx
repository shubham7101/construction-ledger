"use client";

import type React from "react";
import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Segmented } from "@/components/ui/Segmented";
import { useSheet } from "@/hooks/useSheet";
import { useUrlParams } from "@/hooks/useUrlParams";
import { isoToParts, partsToIso } from "@/lib/format";
import type { FilterKey } from "@/types";

type DateMode = "any" | "day" | "range";
type DateParts = [string, string, string];

const EMPTY_PARTS: DateParts = ["", "", ""];

const DAYS = Array.from({ length: 31 }, (_, i) => {
  const v = String(i + 1).padStart(2, "0");
  return [v, v] as [string, string];
});

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const MONTHS = MONTH_NAMES.map(
  (name, i) => [String(i + 1).padStart(2, "0"), name] as [string, string],
);

const YEARS = [2024, 2025, 2026, 2027].map(
  (y) => [String(y), String(y)] as [string, string],
);

const TYPE_OPTIONS: Record<
  string,
  { fallback: string; options: Array<[string, string]> }
> = {
  site: {
    fallback: "All Activity",
    options: [
      ["All Activity", "All Activity"],
      ["Ledgers Only", "Ledgers Only"],
      ["Expenses Only", "Expenses Only"],
    ],
  },
  ledgers: {
    fallback: "all",
    options: [
      ["all", "All"],
      ["credit", "Credit"],
      ["debit", "Debit"],
    ],
  },
};

const DATE_SELECTS = [
  { options: DAYS, placeholder: "DD", label: "Day", index: 0 },
  { options: MONTHS, placeholder: "MM", label: "Month", index: 1 },
  { options: YEARS, placeholder: "YYYY", label: "Year", index: 2 },
] as const;

export const FilterSheet: React.FC = () => {
  const { update } = useUrlParams();
  const { sheet, searchParams, closeSheet } = useSheet();

  // Which list's filters we're editing lives in the URL next to `sheet`.
  const fk: FilterKey | null =
    sheet === "filter"
      ? ((searchParams.get("fk") as FilterKey | null) ?? null)
      : null;

  const typeConfig = fk ? TYPE_OPTIONS[fk] : undefined;

  const [typeVal, setTypeVal] = useState("all");
  const [dm, setDm] = useState<DateMode>("any");
  const [d1, setD1] = useState<DateParts>(EMPTY_PARTS);
  const [d2, setD2] = useState<DateParts>(EMPTY_PARTS);

  // Load the current URL state into the form each time the sheet opens.
  useEffect(() => {
    if (!fk) return;
    setTypeVal(searchParams.get("type") || TYPE_OPTIONS[fk]?.fallback || "all");
    setDm((searchParams.get("dm") as DateMode) || "any");
    setD1(isoToParts(searchParams.get("d1") || ""));
    setD2(isoToParts(searchParams.get("d2") || ""));
  }, [fk, searchParams]);

  if (!fk) return null;

  const close = closeSheet;

  const apply = () => {
    let iso1 = dm === "any" ? "" : partsToIso(d1[0], d1[1], d1[2]);
    let iso2 = dm === "range" ? partsToIso(d2[0], d2[1], d2[2]) : "";
    if (iso1 && iso2 && iso1 > iso2) [iso1, iso2] = [iso2, iso1]; // ISO strings sort chronologically

    update({
      ...(typeConfig
        ? { type: typeVal === typeConfig.fallback ? undefined : typeVal }
        : {}),
      dm: dm === "any" ? undefined : dm,
      d1: iso1 || undefined,
      d2: iso2 || undefined,
      // Applying closes the sheet in the same server navigation.
      sheet: undefined,
      fk: undefined,
    });
    close();
  };

  const clear = () => {
    update({
      type: undefined,
      dm: undefined,
      d1: undefined,
      d2: undefined,
      sheet: undefined,
      fk: undefined,
    });
    close();
  };

  const setPart = (
    setter: React.Dispatch<React.SetStateAction<DateParts>>,
    index: number,
    value: string,
  ) =>
    setter((prev) => {
      const next = [...prev] as DateParts;
      next[index] = value;
      return next;
    });

  const renderDate = (
    label: string,
    parts: DateParts,
    setter: React.Dispatch<React.SetStateAction<DateParts>>,
  ) => (
    <fieldset className="border-none p-0">
      <legend className="text-[11px] font-semibold text-slate-500">
        {label}
      </legend>
      <div className="mt-1 grid grid-cols-3 gap-2">
        {DATE_SELECTS.map(
          ({ options, placeholder, label: partLabel, index }) => (
            <select
              key={placeholder}
              value={parts[index] || ""}
              onChange={(e) => setPart(setter, index, e.target.value)}
              aria-label={`${label} – ${partLabel}`}
              className="min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-2 text-sm text-slate-900 shadow-sm outline-none focus:border-amber-500"
            >
              <option value="">{placeholder}</option>
              {options.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          ),
        )}
      </div>
    </fieldset>
  );

  return (
    <BottomSheet isOpen onClose={close} title="Filters">
      <div className="space-y-4 pt-1">
        {typeConfig && (
          <div className="space-y-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Type
            </p>
            <Segmented
              options={typeConfig.options}
              value={typeVal}
              onChange={setTypeVal}
            />
          </div>
        )}

        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Date
          </p>
          <Segmented
            options={[
              ["any", "Any date"],
              ["day", "Exact date"],
              ["range", "Date range"],
            ]}
            value={dm}
            onChange={(v) => setDm(v as DateMode)}
          />
          {dm === "day" && renderDate("Date", d1, setD1)}
          {dm === "range" && (
            <div className="space-y-2">
              {renderDate("From date", d1, setD1)}
              {renderDate("To date", d2, setD2)}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            onClick={clear}
            className="min-h-13 cursor-pointer rounded-2xl border border-slate-300 bg-white font-bold text-slate-900 hover:bg-slate-50"
          >
            Clear all
          </button>
          <button
            type="button"
            onClick={apply}
            className="min-h-13 cursor-pointer rounded-2xl border-none bg-amber-500 font-extrabold text-slate-950 hover:bg-amber-600"
          >
            Done
          </button>
        </div>
      </div>
    </BottomSheet>
  );
};
