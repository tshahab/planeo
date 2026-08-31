import { authenticateScim, normalizeScimEmail, scimBase, scimError, scimLog, scimResponse, scimUser, setScimActive } from "@/lib/scim";
import { db } from "@/lib/db";

async function find(organizationId: string, id: string) { return db.scimIdentity.findFirst({ where: { id, organizationId }, include: { user: true } }); }
export async function GET(request: Request, { params }: { params: Promise<{ organization: string; id: string }> }) { const { organization, id } = await params; const auth = await authenticateScim(request, organization, "users:read"); if(auth.error)return auth.error; const item=await find(auth.organizationId,id); return item?scimResponse(scimUser(item,scimBase(request,organization)),200,{etag:`W/\"${item.version}\"`}):scimError(404,"User not found."); }

async function update(request: Request, organization: string, id: string, patch: boolean) {
  const auth = await authenticateScim(request, organization, "users:write"); if(auth.error)return auth.error;
  const current = await find(auth.organizationId,id); if(!current)return scimError(404,"User not found.");
  const match=request.headers.get("if-match"); if(match&&match!==`W/\"${current.version}\"`)return scimError(412,"The supplied version is stale.","mutability");
  const body=await request.json().catch(()=>null) as Record<string,unknown>|null; if(!body)return scimError(400,"A request body is required.","invalidSyntax");
  const values:Record<string,unknown>={};
  if(patch){const operations=Array.isArray(body.Operations)?body.Operations:[];for(const operation of operations){if(!operation||typeof operation!=="object")continue;const item=operation as Record<string,unknown>;const op=String(item.op??"").toLowerCase();if(op!=="replace"&&op!=="add")continue;if(typeof item.path==="string")values[item.path]=item.value;else if(item.value&&typeof item.value==="object")Object.assign(values,item.value);}}
  else Object.assign(values,body);
  const userName=values.userName===undefined?current.userName:normalizeScimEmail(values.userName); const externalId=values.externalId===undefined?current.externalId:typeof values.externalId==="string"?values.externalId.trim().slice(0,500):null; const active=values.active===undefined?current.active:values.active===true;
  const displayName=typeof values.displayName==="string"?values.displayName.trim():typeof (values.name as Record<string,unknown>|undefined)?.formatted==="string"?String((values.name as Record<string,unknown>).formatted).trim():current.user.name;
  if(!userName||!displayName||displayName.length>100)return scimError(400,"The supplied user values are invalid.","invalidValue");
  try{await db.$transaction([db.user.update({where:{id:current.userId},data:{email:userName,name:displayName}}),db.scimIdentity.update({where:{id:current.id},data:{userName,externalId,version:{increment:1}}})]);if(active!==current.active)await setScimActive(auth.organizationId,current.id,active);const saved=await find(auth.organizationId,id);if(!saved)throw new Error("not_found");await scimLog(auth.organizationId,auth.token.id,patch?"patch":"replace","User",id,200,undefined,{active});return scimResponse(scimUser(saved,scimBase(request,organization)),200,{etag:`W/\"${saved.version}\"`});}catch{return scimError(409,"The update conflicts with another user.","uniqueness");}
}
export async function PUT(request:Request,{params}:{params:Promise<{organization:string;id:string}>}){const{organization,id}=await params;return update(request,organization,id,false)}
export async function PATCH(request:Request,{params}:{params:Promise<{organization:string;id:string}>}){const{organization,id}=await params;return update(request,organization,id,true)}
export async function DELETE(request:Request,{params}:{params:Promise<{organization:string;id:string}>}){const{organization,id}=await params;const auth=await authenticateScim(request,organization,"users:write");if(auth.error)return auth.error;const item=await setScimActive(auth.organizationId,id,false);if(!item)return scimError(404,"User not found.");await scimLog(auth.organizationId,auth.token.id,"delete","User",id,204,undefined,{deprovisioned:true});return new Response(null,{status:204})}
