"use client";

import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type React from "react";
import { useState, useTransition } from "react";
import { toast } from "@/components/ui/Toast";
import {
  AdminFormSheet,
  AdminHeader,
  InactiveBadge,
} from "@/features/admin/AdminUi";
import {
  normalizeMobile,
  RoleBadge,
  type UserDraft,
  UserFields,
  validateUserDraft,
} from "@/features/admin/UserForm";
import { formatTimestamp } from "@/lib/format";
import { invalidateUserOptions } from "@/lib/reference-cache";
import {
  setUserActiveAction,
  setUserSiteAccessAction,
  updateUserAction,
} from "@/server/actions/admin";
import type { AdminUser } from "@/server/queries/admin";

interface AdminUserDetailClientProps {
  userItem: AdminUser;
  sites: Array<{ id: number; name: string }>;
  linkedPerson: { id: number; name: string; mobile: string } | null;
  /** The signed-in admin's own account: can't be deactivated or demoted. */
  isSelf: boolean;
}

const SELF_NOTE = "This is your account, so it can’t be deactivated here.";

export const AdminUserDetailClient: React.FC<AdminUserDetailClientProps> = ({
  userItem,
  sites,
  linkedPerson,
  isSelf,
}) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState<UserDraft | null>(null);

  const done = (res: { ok: boolean; error?: string }, message: string) => {
    if (!res.ok) {
      toast(res.error || "Something went wrong");
      return false;
    }
    toast(message);
    router.refresh();
    return true;
  };

  const openEdit = () =>
    setDraft({
      name: userItem.name,
      mobile: userItem.mobile,
      password: "",
      role: userItem.role === "Admin" ? "admin" : "regular",
    });

  const save = () => {
    if (!draft) return;
    const error = validateUserDraft(draft, { passwordRequired: false });
    if (error) return toast(error);
    startTransition(async () => {
      const res = await updateUserAction(userItem.id, {
        name: draft.name.trim(),
        mobile: normalizeMobile(draft.mobile),
        password: draft.password,
        role: isSelf ? "admin" : draft.role,
      });
      if (done(res, "User updated")) {
        invalidateUserOptions(); // the "Logged by" picker caches users
        setDraft(null);
      }
    });
  };

  const toggleActive = () => {
    startTransition(async () => {
      const res = await setUserActiveAction(userItem.id, !userItem.active);
      if (
        done(res, userItem.active ? "User deactivated" : "User reactivated")
      ) {
        invalidateUserOptions();
        setDraft(null);
      }
    });
  };

  const toggleSiteAccess = (siteId: number) => {
    const granted = userItem.siteAccess.includes(siteId);
    startTransition(async () => {
      const res = await setUserSiteAccessAction(userItem.id, siteId, !granted);
      if (!res.ok) toast(res.error || "Could not update site access");
      router.refresh();
    });
  };

  return (
    <div className="space-y-3 px-4 pb-28 pt-4 md:px-6 md:pt-6 lg:px-8">
      <AdminHeader title={userItem.name} backHref="/admin/users" />

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-slate-900">{userItem.name}</span>
              <RoleBadge role={userItem.role} />
              {!userItem.active && <InactiveBadge />}
            </p>
            <p className="mt-0.5 text-sm text-slate-500">
              +91 {userItem.mobile}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {userItem.lastLoginAt
                ? `Last login ${formatTimestamp(userItem.lastLoginAt)}`
                : "Never signed in"}
            </p>
          </div>
          <button
            type="button"
            onClick={openEdit}
            className="min-h-10 shrink-0 cursor-pointer rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800 hover:bg-slate-50"
          >
            ✎ Edit
          </button>
        </div>
        {!userItem.active && (
          <p className="mt-3 rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-600">
            Inactive users can’t sign in. Their entries are kept.
          </p>
        )}
      </section>

      {linkedPerson && (
        <Link
          href={`/persons/${linkedPerson.id}`}
          className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 no-underline shadow-sm transition-colors hover:border-slate-300"
        >
          <span>
            <span className="block text-[11px] font-semibold uppercase text-slate-500">
              Passbook
            </span>
            <span className="block font-semibold text-slate-900">
              {linkedPerson.name} · +91 {linkedPerson.mobile}
            </span>
          </span>
          <span aria-hidden className="text-xl text-slate-400">
            ›
          </span>
        </Link>
      )}

      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="font-bold text-slate-900">Site access</p>
        {userItem.role === "Admin" ? (
          <p className="text-sm text-slate-500">Admins can access all sites.</p>
        ) : sites.length === 0 ? (
          <p className="text-sm text-slate-500">No active sites yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {sites.map((s) => {
              const on = userItem.siteAccess.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={on}
                  disabled={isPending}
                  onClick={() => toggleSiteAccess(s.id)}
                  className={clsx(
                    "min-h-10 cursor-pointer rounded-full border-none px-4 text-sm font-semibold transition-colors",
                    on
                      ? "bg-amber-500 text-slate-950"
                      : "bg-slate-100 text-slate-500",
                  )}
                >
                  {on ? "✓ " : ""}
                  {s.name}
                </button>
              );
            })}
          </div>
        )}
      </section>

      <AdminFormSheet
        isOpen={draft !== null}
        title="Edit user"
        onClose={() => setDraft(null)}
        onSubmit={save}
        isPending={isPending}
        submitLabel="Save changes"
        activeToggle={{
          active: userItem.active,
          onToggle: toggleActive,
          disabledReason: isSelf ? SELF_NOTE : undefined,
        }}
      >
        {draft && (
          <UserFields
            draft={draft}
            onChange={setDraft}
            isEditing
            lockRole={isSelf}
          />
        )}
      </AdminFormSheet>
    </div>
  );
};
