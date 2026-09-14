import { createHmac } from "node:crypto";

// Local tests supply generated secrets; this adapter never contacts a real provider.
export function signedEnvelope(secret, value) {
  const data = JSON.stringify(value);
  const timestamp = String(Math.floor(Date.now() / 1000));
  return { data, headers: { "content-type": "application/json", "x-mail-timestamp": timestamp, "x-mail-signature": createHmac("sha256", secret).update(`${timestamp}.${data}`).digest("hex") } };
}
