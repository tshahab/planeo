import { getAuthContext } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function Home() {
  const context = await getAuthContext();
  if (!context) redirect("/login");
  redirect("/projects/WEB");
}
