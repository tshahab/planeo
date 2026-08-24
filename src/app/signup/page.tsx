import { redirect } from "next/navigation";
import { SignupForm } from "@/components/signup-form";
import { getAuthContext } from "@/lib/auth";
export default async function SignupPage(){if(await getAuthContext())redirect('/');return <SignupForm/>;}
