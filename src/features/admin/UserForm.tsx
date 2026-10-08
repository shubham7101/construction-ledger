"use client";

import clsx from "clsx";
import type React from "react";
import { Segmented } from "@/components/ui/Segmented";
import { INPUT_CLASS } from "./AdminUi";

export type Role = "admin" | "regular";

export interface UserDraft {
  name: string;
  mobile: string;
  password: string;
  role: Role;
}

const ROLE_OPTIONS = [
  ["regular", "Regular"],
  ["admin", "Admin"],
] as const;

/** Accepts "98765 43210", "+91 98765 43210", "091-98765-43210". Returns 10 digits, or "" if invalid. */
export const normalizeMobile = (raw: string): string => {
  const digits = raw.replace(/\D/g, "");
  const national =
    digits.length === 12 && digits.startsWith("91")
      ? digits.slice(2)
      : digits.length === 11 && digits.startsWith("0")
        ? digits.slice(1)
        : digits;
  return national.length === 10 ? national : "";
};

/** Returns an error message, or null when the draft can be sent. */
export const validateUserDraft = (
  draft: UserDraft,
  { passwordRequired }: { passwordRequired: boolean },
): string | null => {
  if (!draft.name.trim()) return "Please enter a name";
  if (!normalizeMobile(draft.mobile))
    return "Enter a valid 10-digit mobile number";
  if ((passwordRequired || draft.password) && draft.password.length < 8) {
    return "Password must be at least 8 characters";
  }
  return null;
};

/** Fields shared by the Add User and Edit User sheets. */
export const UserFields: React.FC<{
  draft: UserDraft;
  onChange: (draft: UserDraft) => void;
  isEditing: boolean;
  /** Your own account can't drop its admin role. */
  lockRole?: boolean;
}> = ({ draft, onChange, isEditing, lockRole = false }) => (
  <>
    <input
      type="text"
      autoComplete="off"
      placeholder="Full name"
      aria-label="Full name"
      value={draft.name}
      onChange={(e) => onChange({ ...draft, name: e.target.value })}
      className={INPUT_CLASS}
    />
    <input
      type="tel"
      inputMode="numeric"
      autoComplete="off"
      placeholder="Mobile (10 digits, +91 optional)"
      aria-label="Mobile number"
      value={draft.mobile}
      onChange={(e) => onChange({ ...draft, mobile: e.target.value })}
      className={INPUT_CLASS}
    />
    <input
      type="password"
      autoComplete="new-password"
      placeholder={
        isEditing
          ? "New password (leave blank to keep)"
          : "Password (min 8 characters)"
      }
      aria-label={isEditing ? "New password" : "Password"}
      value={draft.password}
      onChange={(e) => onChange({ ...draft, password: e.target.value })}
      className={INPUT_CLASS}
    />
    {lockRole ? (
      <p className="text-xs text-slate-500">
        Role: Admin · you can’t remove your own admin role.
      </p>
    ) : (
      <Segmented<Role>
        ariaLabel="Role"
        options={ROLE_OPTIONS}
        value={draft.role}
        onChange={(role) => onChange({ ...draft, role })}
      />
    )}
  </>
);

export const RoleBadge: React.FC<{ role: string }> = ({ role }) => (
  <span
    className={clsx(
      "rounded px-1.5 py-px text-[10px] font-bold uppercase tracking-wider",
      role === "Admin"
        ? "bg-amber-500/20 text-amber-700"
        : "bg-slate-100 text-slate-600",
    )}
  >
    {role}
  </span>
);
