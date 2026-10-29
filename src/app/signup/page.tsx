import { redirect } from "next/navigation";
import { SignupForm } from "@/components/signup-form";
import { getAuthContext } from "@/lib/auth";
export default async function SignupPage(){if(await getAuthContext())redirect('/');if(process.env.NODE_ENV==="production"&&process.env.PUBLIC_SIGNUP_ENABLED!=="true")redirect('/login');return <SignupForm/>;}
