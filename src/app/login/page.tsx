import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getAuthContext } from "@/lib/auth";

export default async function LoginPage() {
  if (await getAuthContext()) redirect("/");
  return <LoginForm demoMode={process.env.NODE_ENV !== "production"} />;
}
