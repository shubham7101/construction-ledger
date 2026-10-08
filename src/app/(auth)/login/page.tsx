import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/jwt";
import LoginForm from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ password?: string | string[] }>;
}) {
  // Database-backed check. A stale cookie (deleted/inactive user) returns
  // null here, so the form shows instead of redirecting in a loop.
  if (await getCurrentUser()) redirect("/");

  const { password } = await searchParams;
  const notice =
    password === "changed"
      ? "Password changed. Sign in with your new password."
      : null;

  return <LoginForm notice={notice} />;
}
