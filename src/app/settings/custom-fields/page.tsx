import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { CustomFieldSettings } from "@/components/custom-field-settings";

export default async function CustomFieldsPage() { const context = await getAuthContext(); if (!context) redirect("/login"); if (context.role !== "OWNER" && context.role !== "ADMIN") redirect("/"); return <CustomFieldSettings />; }
