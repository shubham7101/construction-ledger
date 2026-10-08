"use client";

import clsx from "clsx";
import { useRouter } from "next/navigation";
import type React from "react";
import { useState, useTransition } from "react";
import { toast } from "@/components/ui/Toast";
import { AdminFormSheet, INPUT_CLASS } from "@/features/admin/AdminUi";
import { normalizeMobile } from "@/features/admin/UserForm";
import { logoutAction } from "@/server/actions/auth";
import {
  changeMyPasswordAction,
  updateMyProfileAction,
} from "@/server/actions/profile";
import type { CurrentUser } from "@/server/auth/jwt";

interface ProfileClientProps {
  user: CurrentUser;
  sitesCount: number;
  personsCount: number;
  entriesCount: number;
}

const Stat: React.FC<{ value: number; label: string }> = ({ value, label }) => (
  <div>
    <p className="text-xl font-extrabold text-amber-600">{value}</p>
    <p className="text-xs text-slate-500">{label}</p>
  </div>
);

interface SettingsRowProps {
  icon: string;
  label: string;
  onClick: () => void;
  trailing?: React.ReactNode;
  /** Set to render the row as an on/off toggle. */
  checked?: boolean;
}

const SettingsRow: React.FC<SettingsRowProps> = ({
  icon,
  label,
  onClick,
  trailing,
  checked,
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={checked}
    className="flex min-h-14 w-full cursor-pointer items-center gap-3 border-none bg-transparent px-4 text-left transition-colors hover:bg-slate-50"
  >
    <span
      aria-hidden
      className="grid h-9 w-9 place-items-center rounded-xl bg-amber-50 text-lg"
    >
      {icon}
    </span>
    <span className="flex-1 text-sm font-semibold text-slate-900">{label}</span>
    {trailing ?? (
      <span aria-hidden className="text-slate-400">
        ›
      </span>
    )}
  </button>
);

export const ProfileClient: React.FC<ProfileClientProps> = ({
  user,
  sitesCount,
  personsCount,
  entriesCount,
}) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Page-local preference — nothing global about it.
  const [notif, setNotif] = useState(true);
  const showToast = toast;

  const [profileDraft, setProfileDraft] = useState<{
    name: string;
    mobile: string;
  } | null>(null);
  const [passwordDraft, setPasswordDraft] = useState<{
    current: string;
    next: string;
    confirm: string;
  } | null>(null);
  const [isSaving, startSaving] = useTransition();

  const saveProfile = () => {
    if (!profileDraft) return;
    const name = profileDraft.name.trim();
    const mobile = normalizeMobile(profileDraft.mobile);
    if (!name) return showToast("Please enter your name");
    if (!mobile) return showToast("Enter a valid 10-digit mobile number");
    startSaving(async () => {
      const res = await updateMyProfileAction({ name, mobile });
      if (res.ok) {
        showToast("Profile updated");
        setProfileDraft(null);
        router.refresh();
      } else {
        showToast(res.error || "Could not update profile");
      }
    });
  };

  const savePassword = () => {
    if (!passwordDraft) return;
    const { current, next, confirm } = passwordDraft;
    if (!current) return showToast("Enter your current password");
    if (next.length < 8) {
      return showToast("New password must be at least 8 characters");
    }
    if (next !== confirm) return showToast("New passwords don’t match");
    startSaving(async () => {
      const res = await changeMyPasswordAction({ current, next });
      if (res.ok) {
        // The action already cleared the session; the login page confirms.
        router.replace("/login?password=changed");
        router.refresh();
      } else {
        showToast(res.error || "Could not change password");
      }
    });
  };

  const handleLogout = () => {
    startTransition(async () => {
      await logoutAction(); // clears the httpOnly session cookie on the server
      router.push("/login");
      router.refresh();
    });
  };

  return (
    <div className="pb-8 md:px-6 md:pt-6 lg:px-8">
      <header className="flex items-center gap-2 rounded-b-3xl bg-linear-to-br from-amber-400 to-amber-600 px-3 pb-8 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] text-slate-950 shadow-md md:rounded-3xl md:px-6 md:pb-10 md:pt-6">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Back"
          className="grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-full border-none bg-transparent text-2xl text-slate-950 hover:bg-black/5"
        >
          ←
        </button>
        <span
          aria-hidden
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white text-xl font-extrabold text-amber-600 shadow md:h-14 md:w-14 md:text-2xl"
        >
          {user.name[0] || "U"}
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-extrabold leading-tight md:text-xl">
            {user.name}
          </h1>
          <p className="text-xs font-medium text-slate-900 md:text-sm">
            +91 {user.mobile} ·{" "}
            <span className="font-bold">{user.role.toUpperCase()}</span>
          </p>
        </div>
      </header>

      <div className="-mt-5 space-y-4 px-4 md:px-6 lg:grid lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start lg:gap-6 lg:space-y-0 lg:px-0">
        <div className="space-y-4">
          <section
            aria-label="Summary"
            className="grid grid-cols-3 rounded-2xl border border-slate-200 bg-white py-4 text-center shadow-md"
          >
            <Stat value={sitesCount} label="Sites" />
            <Stat value={personsCount} label="Contractors" />
            <Stat value={entriesCount} label="Entries" />
          </section>

          <button
            type="button"
            onClick={handleLogout}
            disabled={isPending}
            className="min-h-13 w-full cursor-pointer rounded-2xl border border-red-200 bg-red-50 font-extrabold text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50"
          >
            {isPending ? "Logging out..." : "Log out"}
          </button>
        </div>

        <div className="space-y-4">
          <section
            aria-label="Settings"
            className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
          >
            <SettingsRow
              icon="✏️"
              label="Edit profile"
              onClick={() =>
                setProfileDraft({ name: user.name, mobile: user.mobile })
              }
            />
            <SettingsRow
              icon="🔔"
              label="Notifications"
              onClick={() => setNotif(!notif)}
              checked={notif}
              trailing={
                <span
                  aria-hidden
                  className={clsx(
                    "relative inline-block h-7 w-12 rounded-full transition-colors",
                    notif ? "bg-emerald-500" : "bg-slate-300",
                  )}
                >
                  <span
                    className={clsx(
                      "absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-all",
                      notif ? "left-6" : "left-1",
                    )}
                  />
                </span>
              }
            />
            <SettingsRow
              icon="🌐"
              label="Language"
              onClick={() => showToast("Language selection (demo)")}
              trailing={
                <span className="text-xs text-slate-500">English ›</span>
              }
            />
            <SettingsRow
              icon="🔒"
              label="Change password"
              onClick={() =>
                setPasswordDraft({ current: "", next: "", confirm: "" })
              }
            />
            <SettingsRow
              icon="💬"
              label="Help & support"
              onClick={() => showToast("Help & support (demo)")}
            />
          </section>

          <p className="pt-2 text-center text-xs text-slate-400">
            Construction Ledger v1.0
          </p>
        </div>
      </div>

      <AdminFormSheet
        isOpen={profileDraft !== null}
        title="Edit profile"
        onClose={() => setProfileDraft(null)}
        onSubmit={saveProfile}
        isPending={isSaving}
        submitLabel="Save changes"
      >
        {profileDraft && (
          <>
            <input
              value={profileDraft.name}
              onChange={(e) =>
                setProfileDraft({ ...profileDraft, name: e.target.value })
              }
              placeholder="Full name"
              aria-label="Full name"
              autoComplete="name"
              className={INPUT_CLASS}
            />
            <input
              type="tel"
              inputMode="numeric"
              value={profileDraft.mobile}
              onChange={(e) =>
                setProfileDraft({ ...profileDraft, mobile: e.target.value })
              }
              placeholder="Mobile (10 digits)"
              aria-label="Mobile number"
              autoComplete="tel-national"
              className={INPUT_CLASS}
            />
            <p className="text-xs text-slate-500">
              Your mobile number is also what you sign in with.
            </p>
          </>
        )}
      </AdminFormSheet>

      <AdminFormSheet
        isOpen={passwordDraft !== null}
        title="Change password"
        onClose={() => setPasswordDraft(null)}
        onSubmit={savePassword}
        isPending={isSaving}
        submitLabel="Change password"
      >
        {passwordDraft && (
          <>
            <input
              type="password"
              value={passwordDraft.current}
              onChange={(e) =>
                setPasswordDraft({ ...passwordDraft, current: e.target.value })
              }
              placeholder="Current password"
              aria-label="Current password"
              autoComplete="current-password"
              className={INPUT_CLASS}
            />
            <input
              type="password"
              value={passwordDraft.next}
              onChange={(e) =>
                setPasswordDraft({ ...passwordDraft, next: e.target.value })
              }
              placeholder="New password (min 8 characters)"
              aria-label="New password"
              autoComplete="new-password"
              className={INPUT_CLASS}
            />
            <input
              type="password"
              value={passwordDraft.confirm}
              onChange={(e) =>
                setPasswordDraft({ ...passwordDraft, confirm: e.target.value })
              }
              placeholder="Confirm new password"
              aria-label="Confirm new password"
              autoComplete="new-password"
              className={INPUT_CLASS}
            />
          </>
        )}
      </AdminFormSheet>
    </div>
  );
};
