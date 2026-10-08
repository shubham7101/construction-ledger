import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/jwt";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  // Database-backed check. A stale cookie (deleted/inactive user) returns
  // null here, so the form shows instead of redirecting in a loop.
  if (await getCurrentUser()) redirect("/");

  return <LoginForm />;
}
