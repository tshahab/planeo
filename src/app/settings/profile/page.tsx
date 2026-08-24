import { redirect } from "next/navigation";
import { ProfileSettings } from "@/components/profile-settings";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
export default async function ProfilePage(){const context=await getAuthContext();if(!context)redirect('/login');const sessionCount=await db.session.count({where:{userId:context.user.id,revokedAt:null,expiresAt:{gt:new Date()}}});return <ProfileSettings initial={context.user} sessionCount={sessionCount}/>;}
