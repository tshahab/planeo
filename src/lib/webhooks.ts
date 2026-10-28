import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { Prisma } from "@prisma/client";
import { enqueueChat } from "./chat-integrations";

export const WEBHOOK_EVENTS=["issue.created","issue.updated","comment.created","sprint.created","release.created","release.released","sla.risk","sla.breached","sla.succeeded"] as const;
function key(){const value=process.env.WEBHOOK_ENCRYPTION_SECRET;if(!value||value.length<32)throw new Error("WEBHOOK_ENCRYPTION_SECRET must contain at least 32 characters");return createHash("sha256").update(value).digest()}
export function encryptSecret(secret:string){const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",key(),iv),encrypted=Buffer.concat([cipher.update(secret,"utf8"),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString("base64url")}
export function decryptSecret(value:string){const bytes=Buffer.from(value,"base64url"),iv=bytes.subarray(0,12),tag=bytes.subarray(12,28),ciphertext=bytes.subarray(28),decipher=createDecipheriv("aes-256-gcm",key(),iv);decipher.setAuthTag(tag);return Buffer.concat([decipher.update(ciphertext),decipher.final()]).toString("utf8")}
export function webhookSecret(){return `whsec_${randomBytes(32).toString("base64url")}`}
export function webhookSignature(secret:string,timestamp:string,body:string){return `v1=${createHmac("sha256",secret).update(`${timestamp}.${body}`).digest("hex")}`}
export function verifyWebhookSignature(secret:string,timestamp:string,body:string,provided:string,now=Math.floor(Date.now()/1000)){if(!/^\d+$/.test(timestamp)||Math.abs(now-Number(timestamp))>300)return false;const expected=Buffer.from(webhookSignature(secret,timestamp,body)),actual=Buffer.from(provided);return expected.length===actual.length&&timingSafeEqual(expected,actual)}
export function webhookRetryDelay(attempt:number){return Math.min(3_600_000,1000*2**Math.max(0,attempt-1))}
function ipv4Number(value:string){const octets=value.split(".");if(octets.length!==4||octets.some(o=>!/^[0-9]{1,3}$/.test(o)||Number(o)>255))return null;return octets.reduce((result,octet)=>result*256+Number(octet),0)}
function ipv4InRange(value:string,start:string,end:string){const address=ipv4Number(value),lower=ipv4Number(start),upper=ipv4Number(end);return address!==null&&lower!==null&&upper!==null&&address>=lower&&address<=upper}
function ipv6Hextets(value:string){const parts=value.toLowerCase().split("::");if(parts.length>2)return null;const left=parts[0]?parts[0].split(":"):[],right=parts.length===2&&parts[1]?parts[1].split(":"):[];const expand=(part:string)=>part.includes(".")?(() => {const number=ipv4Number(part);return number===null?null:[(number>>>16).toString(16),(number&0xffff).toString(16)]})():/^[0-9a-f]{1,4}$/.test(part)?[part]:null;const groupsFor=(parts:string[])=>{const groups:string[]=[];for(const part of parts){const expanded=expand(part);if(!expanded)return null;groups.push(...expanded)}return groups};const leftGroups=groupsFor(left),rightGroups=groupsFor(right);if(!leftGroups||!rightGroups)return null;const groups=parts.length===2?[...leftGroups,...Array(8-leftGroups.length-rightGroups.length).fill("0"),...rightGroups]:[...leftGroups,...rightGroups];if(groups.length!==8||leftGroups.length+rightGroups.length>8)return null;return groups.map(value=>parseInt(value,16));}
export function isPrivateAddress(address:string):boolean{
  const normalized=address.trim().toLowerCase();
  if(isIP(normalized)===4){
    return ipv4InRange(normalized,"0.0.0.0","0.255.255.255")||ipv4InRange(normalized,"10.0.0.0","10.255.255.255")||ipv4InRange(normalized,"100.64.0.0","100.127.255.255")||ipv4InRange(normalized,"127.0.0.0","127.255.255.255")||ipv4InRange(normalized,"169.254.0.0","169.254.255.255")||ipv4InRange(normalized,"172.16.0.0","172.31.255.255")||ipv4InRange(normalized,"192.0.0.0","192.0.0.255")||ipv4InRange(normalized,"192.0.2.0","192.0.2.255")||ipv4InRange(normalized,"192.168.0.0","192.168.255.255")||ipv4InRange(normalized,"198.18.0.0","198.19.255.255")||ipv4InRange(normalized,"198.51.100.0","198.51.100.255")||ipv4InRange(normalized,"203.0.113.0","203.0.113.255")||ipv4InRange(normalized,"224.0.0.0","255.255.255.255")||ipv4InRange(normalized,"10.128.0.0","10.131.255.255")||ipv4InRange(normalized,"172.30.0.0","172.30.255.255")||ipv4InRange(normalized,"177.30.0.0","177.30.255.255");
  }
  if(isIP(normalized)!==6)return true;
  const hextets=ipv6Hextets(normalized);if(!hextets)return true;
  if(hextets.slice(0,6).every(value=>value===0)){
    const embedded=`${hextets[6]>>8}.${hextets[6]&255}.${hextets[7]>>8}.${hextets[7]&255}`;
    if(isPrivateAddress(embedded))return true;
  }
  const mapped=normalized.startsWith("::ffff:")?normalized.slice(7):null;
  return Boolean(mapped&&isPrivateAddress(mapped))||hextets[0]===0||hextets[0]===0xffff||(hextets[0]&0xfe00)===0xfc00||(hextets[0]&0xffc0)===0xfe80||(hextets[0]&0xff00)===0xff00;
}
export async function validateWebhookUrl(value:unknown){if(typeof value!=="string"||value.length>2048)return null;let url:URL;try{url=new URL(value)}catch{return null}if(url.protocol!=="https:"||url.username||url.password||url.port&&url.port!=="443"||url.hostname==="localhost")return null;const addresses=await lookup(url.hostname,{all:true}).catch(()=>[]);if(!addresses.length||addresses.some(({address})=>isPrivateAddress(address)))return null;return url.toString()}
export async function enqueueWebhook(tx:Prisma.TransactionClient,input:{workspaceId:string;projectId?:string|null;event:string;eventId:string;data:Prisma.InputJsonValue}){const subscriptions=await tx.webhookSubscription.findMany({where:{workspaceId:input.workspaceId,enabled:true,events:{has:input.event},OR:[{projectId:null},{projectId:input.projectId??undefined}]},select:{id:true}});if(subscriptions.length)await tx.webhookDelivery.createMany({data:subscriptions.map(({id})=>({subscriptionId:id,eventId:input.eventId,event:input.event,payload:{id:input.eventId,type:input.event,apiVersion:"v1",createdAt:new Date().toISOString(),data:input.data}})),skipDuplicates:true});await enqueueChat(tx,input)}
