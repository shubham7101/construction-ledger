"use client";

import clsx from "clsx";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { loadReferenceOptions } from "@/lib/reference-cache";
import {
  type PersonOption,
  type ReferenceOptions,
  searchPersonsAction,
} from "@/server/actions/reference";

type OptionValue = number | string;
type Option = [OptionValue, string];

export type PickerKind = "cat" | "ptype" | "site" | "siten" | "person";

interface SearchablePickerSheetProps {
  kind: PickerKind;
  /** Currently selected value of the field this picker is attached to. */
  value: OptionValue | undefined;
  /** Called with the chosen value and its display label (for personLabel etc.). */
  onChange: (value: OptionValue, label: string) => void;
  onClose: () => void;
}

const TITLES: Record<PickerKind, string> = {
  cat: "Select category",
  ptype: "Select person type",
  site: "Select site",
  siten: "Select site",
  person: "Select person",
};

const PERSON_SEARCH_DEBOUNCE_MS = 250;

/**
 * A searchable option list that stacks on top of the form that owns it.
 * Rendered *inside* AddEditSheet, so selecting a value
 * is a plain onChange — no global picker state, no back-references to a form.
 *
 * Data policy:
 *   - sites / categories / person types: small, fetched once per session
 *     (see reference-cache) and filtered client-side.
 *   - persons: never loaded in bulk; searched on the server, 30 rows at a
 *     time, debounced, with an initial empty query for the first screen.
 */
export const SearchablePickerSheet: React.FC<SearchablePickerSheetProps> = ({
  kind,
  value,
  onChange,
  onClose,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");

  const [reference, setReference] = useState<ReferenceOptions | null>(null);
  useEffect(() => {
    if (kind === "person") return;
    let stale = false;
    loadReferenceOptions()
      .then((rows) => {
        if (!stale) setReference(rows);
      })
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [kind]);

  const [persons, setPersons] = useState<PersonOption[]>([]);
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    if (kind !== "person") return;
    let stale = false;
    const term = query.trim();
    const timer = setTimeout(
      () => {
        setSearching(true);
        searchPersonsAction(term)
          .then((rows) => {
            if (!stale) {
              setPersons(rows);
              setSearching(false);
            }
          })
          .catch(() => {
            if (!stale) setSearching(false);
          });
      },
      term ? PERSON_SEARCH_DEBOUNCE_MS : 0,
    );
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [kind, query]);

  // Auto-focus search only with a mouse/trackpad; on touch it would pop the keyboard over the list.
  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) {
      inputRef.current?.focus();
    }
  }, []);

  const options = useMemo<Option[]>(() => {
    switch (kind) {
      case "cat":
        return (reference?.categories ?? []).map(
          (c): Option => [c.name, c.name],
        );
      case "ptype":
        return (reference?.personTypes ?? []).map(
          (p): Option => [p.name, p.name],
        );
      case "site":
        return (reference?.sites ?? []).map((s): Option => [s.id, s.name]);
      case "siten":
        return [
          [-1, "No site"],
          ...(reference?.sites ?? []).map((s): Option => [s.id, s.name]),
        ];
      case "person":
        return persons.map((p): Option => [p.id, `${p.name} · ${p.mobile}`]);
      default:
        return [];
    }
  }, [kind, reference, persons]);

  // Person rows are already filtered by the server; the small lists are not.
  const visible = useMemo(() => {
    if (kind === "person") return options;
    const term = query.trim().toLowerCase();
    return term
      ? options.filter(([, label]) => label.toLowerCase().includes(term))
      : options;
  }, [kind, options, query]);

  const loadingList =
    kind === "person" ? searching : reference === null && visible.length === 0;

  return (
    <BottomSheet
      isOpen
      onClose={onClose}
      title={TITLES[kind]}
      zIndex={60}
      fixedHeight
      containerClassName="h-[80dvh] md:h-[70dvh]"
    >
      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="🔍 Search"
        aria-label="Search options"
        className="min-h-12 w-full shrink-0 rounded-2xl border border-slate-200 bg-white px-4 text-slate-900 shadow-sm outline-none focus:border-amber-500"
      />

      <ul className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto">
        {loadingList && (
          <li className="py-6 text-center text-sm text-slate-500">Loading…</li>
        )}
        {!loadingList && visible.length === 0 && (
          <li className="py-6 text-center text-sm text-slate-500">
            No matches
          </li>
        )}
        {visible.map(([optionValue, label]) => {
          const selected = value === optionValue;
          return (
            <li key={String(optionValue)}>
              <button
                type="button"
                onClick={() => onChange(optionValue, label)}
                aria-pressed={selected}
                className={clsx(
                  "flex min-h-13 w-full cursor-pointer items-center justify-between rounded-2xl border px-4 text-left transition-colors",
                  selected
                    ? "border-amber-500 bg-amber-50"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
                )}
              >
                <span className="text-sm font-semibold text-slate-900">
                  {label}
                </span>
                <span aria-hidden className="font-bold text-amber-600">
                  {selected ? "✓" : ""}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </BottomSheet>
  );
};
