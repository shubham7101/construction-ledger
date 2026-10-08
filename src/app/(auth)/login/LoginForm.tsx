"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { loginAction } from "@/server/actions/auth";

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      {off && <path d="M3 3l18 18" />}
    </svg>
  );
}

const FEATURES = [
  { icon: "🏗️", text: "Track expenses site by site" },
  { icon: "📒", text: "Khata ledger for contractors and vendors" },
  { icon: "🔐", text: "Role-based access for admins and site staff" },
];

export default function LoginForm() {
  const router = useRouter();
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.SubmitEvent) => {
    e.preventDefault();
    setError(null);

    if (!/^\d{10}$/.test(mobile)) {
      setError("Enter a valid 10-digit mobile number.");
      return;
    }

    if (password.length < 8) {
      setError("Enter password of length atleast 8 character long");
      return;
    }

    startTransition(async () => {
      const res = await loginAction({ mobile, password });
      if (res.ok) {
        // The JWT lives in an httpOnly session cookie set by the server
        // action; the browser attaches it to every request automatically.
        router.replace("/");
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  };

  const inputClass =
    "w-full rounded-xl border border-slate-300 bg-white px-4 py-3.5 text-base text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-amber-500 focus:ring-4 focus:ring-amber-500/20";

  return (
    <main className="grid min-h-screen bg-slate-100 lg:grid-cols-2">
      {/* Brand panel: laptops and landscape tablets only */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-slate-900 p-12 text-white lg:flex xl:p-16">
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-amber-500/10" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-amber-500/5" />

        <div className="relative flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-amber-500 text-2xl text-slate-950 shadow-md">
            🏗️
          </div>
          <span className="text-lg font-bold tracking-tight">
            Construction Ledger
          </span>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-4xl font-extrabold leading-tight xl:text-5xl">
            Every site.
            <br />
            Every rupee.
            <br />
            <span className="text-amber-400">One khata book.</span>
          </h2>
          <ul className="mt-10 space-y-4">
            {FEATURES.map((f) => (
              <li
                key={f.text}
                className="flex items-center gap-3 text-slate-300"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white/10 text-lg">
                  {f.icon}
                </span>
                {f.text}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-sm text-slate-500">Multi-site Khata Book</p>
      </aside>

      {/* Form panel */}
      <section className="flex items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-md sm:rounded-3xl sm:border sm:border-slate-200 sm:bg-white sm:p-10 sm:shadow-xl lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
          {/* Logo: shown on phones and tablets, hidden when the brand panel is visible */}
          <div className="mb-8 text-center lg:hidden">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-amber-500 text-3xl text-slate-950 shadow-md">
              🏗️
            </div>
            <h1 className="mt-4 text-2xl font-extrabold text-slate-900">
              Construction Ledger
            </h1>
            <p className="text-sm text-slate-500">Multi-site Khata Book</p>
          </div>

          <div className="mb-8 hidden lg:block">
            <h1 className="text-3xl font-extrabold text-slate-900">
              Welcome back
            </h1>
            <p className="mt-2 text-slate-500">
              Sign in with your mobile number to continue.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {error && (
              <div
                id="login-error"
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 p-3 text-center text-sm font-medium text-red-600"
              >
                {error}
              </div>
            )}

            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <label
                  htmlFor="mobile"
                  className="text-sm font-semibold text-slate-700"
                >
                  Mobile number
                </label>
                <span
                  className={`text-xs tabular-nums ${
                    mobile.length === 10 ? "text-emerald-600" : "text-slate-400"
                  }`}
                >
                  {mobile.length}/10
                </span>
              </div>
              <input
                id="mobile"
                name="mobile"
                type="tel"
                inputMode="numeric"
                autoComplete="username"
                maxLength={10}
                value={mobile}
                onChange={(e) =>
                  setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))
                }
                placeholder="10-digit mobile number"
                required
                aria-describedby={error ? "login-error" : undefined}
                className={inputClass}
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-sm font-semibold text-slate-700"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPw ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  className={`${inputClass} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute inset-y-0 right-0 grid w-12 cursor-pointer place-items-center rounded-r-xl border-none bg-transparent text-slate-500 hover:text-slate-800"
                  aria-label={showPw ? "Hide password" : "Show password"}
                  aria-pressed={showPw}
                >
                  <EyeIcon off={showPw} />
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="w-full cursor-pointer rounded-xl border-none bg-amber-500 py-3.5 text-lg font-extrabold text-slate-950 shadow-md transition hover:bg-amber-600 focus:outline-none focus:ring-4 focus:ring-amber-500/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? "Logging in..." : "Login to Khata Book →"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
