import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getAuthContext } from "@/lib/auth";

export default async function LoginPage() {
  if (await getAuthContext()) redirect("/");
  const demoMode = process.env.NODE_ENV !== "production";
  return <LoginForm demoMode={demoMode} publicSignup={demoMode || process.env.PUBLIC_SIGNUP_ENABLED === "true"} />;
}
