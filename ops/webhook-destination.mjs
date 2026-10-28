import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";

function ipv4(value) {
  const parts = value.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)) return null;
  return parts.reduce((number, part) => number * 256 + Number(part), 0);
}
function inRange(value, start, end) { const number = ipv4(value); return number !== null && number >= start && number <= end; }
export function isPrivateAddress(address) {
  const normalized = String(address).trim().toLowerCase(), mapped = normalized.startsWith("::ffff:") ? normalized.slice(7) : null;
  if (mapped && isPrivateAddress(mapped)) return true;
  if (ipv4(normalized) !== null) return inRange(normalized,0,0x00ffffff)||inRange(normalized,0x0a000000,0x0affffff)||inRange(normalized,0x64400000,0x647fffff)||inRange(normalized,0x7f000000,0x7fffffff)||inRange(normalized,0xa9fe0000,0xa9feffff)||inRange(normalized,0xac100000,0xac1fffff)||inRange(normalized,0xc0000000,0xc00000ff)||inRange(normalized,0xc0000200,0xc00002ff)||inRange(normalized,0xc0a80000,0xc0a8ffff)||inRange(normalized,0xc6120000,0xc613ffff)||inRange(normalized,0xc6336400,0xc63364ff)||inRange(normalized,0xcb007100,0xcb0071ff)||inRange(normalized,0xe0000000,0xffffffff)||inRange(normalized,0x0a800000,0x0a83ffff)||inRange(normalized,0xac1e0000,0xac1effff)||inRange(normalized,0xb11e0000,0xb11effff);
  if (isIP(normalized)!==6) return true;
  const groups = normalized.split("::");
  if (groups.length === 2 && groups[0] === "" && groups[1] && !groups[1].includes(":")) {
    const octets = groups[1].split(".").map(Number);
    if (octets.length === 4 && octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255)) {
      return isPrivateAddress(octets.join("."));
    }
  }
  return normalized==="::1"||normalized.startsWith("fc")||normalized.startsWith("fd")||normalized.startsWith("fe80")||normalized.startsWith("ff")||normalized.startsWith("0:");
}
export async function resolvePinnedHttpsTarget(rawUrl, lookup = dnsLookup) {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") || url.hostname === "localhost") throw new Error("unsafe webhook destination");
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) throw new Error("unsafe webhook destination");
  const address = addresses.find(({ address }) => isIP(address) === 4) ?? addresses[0];
  return { url, address: address.address };
}
export async function postPinnedHttps(rawUrl, options = {}) {
  const { url, address } = await resolvePinnedHttpsTarget(rawUrl, options.lookup);
  return new Promise((resolve, reject) => {
    const request = (options.request ?? httpsRequest)({ hostname: address, port: 443, method: "POST", path: `${url.pathname}${url.search}`, servername: url.hostname, headers: { ...options.headers, host: url.host }, agent: false, rejectUnauthorized: true }, (response) => { response.resume(); response.on("end", () => resolve({ status: response.statusCode ?? 0, headers: response.headers })); });
    request.once("error", reject); request.setTimeout(options.timeoutMs ?? 10000, () => request.destroy(new Error("webhook request timed out"))); request.end(options.body);
  });
}
