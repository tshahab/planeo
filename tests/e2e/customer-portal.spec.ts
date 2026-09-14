import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { signedEnvelope } from "../../ops/mail-provider-simulator.mjs";

test("customer portal sign-in is non-revealing, keyboard accessible, and mobile-ready", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/portal/login?workspace=missing-portal");
  await page.keyboard.press("Tab"); await page.keyboard.press("Tab");
  await page.getByLabel("Email").fill("unknown@example.test");
  await page.getByLabel("Password").fill("NotThePassword123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator(".login-error[role=alert]")).toHaveText("Email, password, or portal is incorrect.");
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? ""))).toEqual([]);
});

test("invited customers create private requests while agent data and unrelated customers remain isolated", async ({ page, browser }) => {
  const unique = `portal-${Date.now()}`;
  await page.goto("/signup");
  await page.getByLabel("Your name").fill("Portal owner");
  await page.getByLabel("Email").fill(`${unique}@owner.test`);
  await page.getByLabel("Password").fill("SecurePlaneo123");
  await page.getByLabel("Workspace name").fill("Customer service");
  await page.getByLabel("Workspace URL").fill(unique);
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/$/);
  const post = async (path: string, body: unknown) => page.evaluate(async ({ path, body }) => {
    const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  }, { path, body });
  expect((await post("/api/projects", { name: "Support", key: "HELP", template: "SERVICE", visibility: "PRIVATE" })).status).toBe(201);
  const created = await post("/api/projects/HELP/request-types", { name: "Get support", schema: { fields: [
    { key: "summary", kind: "summary", label: "Summary", required: true },
    { key: "description", kind: "description", label: "Details", required: true },
    { key: "files", kind: "attachment", label: "Files", required: false },
  ] } });
  expect(created.status).toBe(201);
  expect((await post(`/api/projects/HELP/request-types/${created.body.requestType.id}/publish`, {})).status).toBe(201);
  const inbox = new Client({ connectionString: process.env.DATABASE_URL }); await inbox.connect();
  const customer = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const outsider = await browser.newContext();
  try {
    async function invite(email: string) {
      expect((await post("/api/projects/HELP/portal/customers", { email, name: "Customer" })).status).toBe(201);
      // Test-only local outbox read: no external email provider or production data.
      const result = await inbox.query('SELECT "textBody" FROM "EmailDelivery" WHERE recipient = $1 AND category = $2 ORDER BY "createdAt" DESC LIMIT 1', [email, "PORTAL_INVITATION"]);
      const token = result.rows[0].textBody.match(/token=([A-Za-z0-9_-]+)/)?.[1];
      if (!token) throw new Error("Local invitation was not queued");
      return token as string;
    }
    const customerPage = await customer.newPage();
    await customerPage.goto(`/portal/activate?token=${await invite(`${unique}@customer.test`)}`);
    await customerPage.getByLabel("New password").fill("CustomerPassword123");
    await customerPage.getByRole("button", { name: "Activate account" }).click();
    await expect(customerPage).toHaveURL(new RegExp(`/portal/${unique}$`));
    await page.goto("/projects/HELP/settings/mailbox");
    await page.getByLabel("Inbound address").fill(`${unique}@inbound.test`);
    await page.getByRole("button", { name: "Save and rotate secret" }).click();
    const secretField = page.getByLabel("Signing secret"); await expect(secretField).toBeVisible();
    const secret = await secretField.inputValue();
    const mailbox = (await inbox.query('SELECT id FROM "ServiceMailbox" WHERE address = $1', [`${unique}@inbound.test`])).rows[0];
    const mailId = `${unique}@customer.test`;
    const envelope = { providerId: unique, verifiedSender: `${unique}@customer.test`, recipient: `${unique}@inbound.test`, raw: Buffer.from(`From: ${unique}@customer.test\r\nTo: ${unique}@inbound.test\r\nMessage-ID: <${mailId}>\r\nSubject: Email request\r\n\r\nEmail description`).toString("base64") };
    const adapter = await browser.newContext();
    try {
      const endpoint = `/api/service/mail/${mailbox.id}`;
      expect((await adapter.request.post(endpoint, { data: envelope })).status()).toBe(401);
      const accepted = await adapter.request.post(endpoint, signedEnvelope(secret, envelope));
      expect(accepted.status()).toBe(202); expect((await accepted.json()).status).toBe("ACCEPTED");
      const duplicate = await adapter.request.post(endpoint, signedEnvelope(secret, envelope));
      expect((await duplicate.json()).duplicate).toBe(true);
      const emailRequest = (await inbox.query('SELECT r.id, r."issueId" FROM "ServiceRequest" r JOIN "InboundMessage" m ON m."requestId" = r.id WHERE m."mailboxId" = $1', [mailbox.id])).rows[0];
      expect((await post(`/api/issues/${emailRequest.issueId}/conversation`, { mode: "PUBLIC", body: "Public agent email reply", idempotencyKey: unique })).status).toBe(200);
      await customerPage.goto(`/portal/${unique}/requests/${emailRequest.id}`);
      await expect(customerPage.getByText("Public agent email reply")).toBeVisible();
      const delivery = (await inbox.query('SELECT "dedupeKey", "mailHeaders" FROM "EmailDelivery" WHERE "issueId" = $1 AND category = $2 ORDER BY "createdAt" DESC LIMIT 1', [emailRequest.issueId, "PORTAL_CONVERSATION"])).rows[0];
      const reply = { ...envelope, providerId: `${unique}-reply`, raw: Buffer.from(`From: ${unique}@customer.test\r\nTo: ${unique}@inbound.test\r\nMessage-ID: <reply-${mailId}>\r\nIn-Reply-To: ${delivery.mailHeaders["Message-ID"]}\r\nSubject: Changed subject\r\n\r\nReply from email`).toString("base64") };
      expect((await adapter.request.post(endpoint, signedEnvelope(secret, reply))).status()).toBe(202);
      await customerPage.reload(); await expect(customerPage.getByText("Reply from email")).toBeVisible();
      expect((await adapter.request.post(`${endpoint}/bounce`, signedEnvelope(secret, { email: `${unique}@customer.test`, deliveryKey: delivery.dedupeKey, reason: "HARD_BOUNCE" }))).status()).toBe(200);
      expect((await inbox.query('SELECT status FROM "EmailDelivery" WHERE "dedupeKey" = $1', [delivery.dedupeKey])).rows[0].status).toBe("DEAD");
      expect((await customer.request.get(`/api/issues/${emailRequest.issueId}/conversation`)).status()).toBe(401);
    } finally { await adapter.close(); }
    await customerPage.goto(`/portal/${unique}`);
    await customerPage.locator(`a[href="/service/forms/${created.body.requestType.id}"]`).click();
    await customerPage.getByLabel("Summary *").fill("Private customer request");
    await customerPage.getByLabel("Details *").fill("Customer-visible description");
    await customerPage.getByLabel("Files").setInputFiles({ name: "customer.txt", mimeType: "text/plain", buffer: Buffer.from("customer attachment") });
    // Wait until upload has completed before submitting.
    await expect.poll(async () => (await inbox.query('SELECT count(*)::int AS count FROM "ServiceRequestUpload" WHERE "fileName" = $1 AND "usedAt" IS NULL', ["customer.txt"])).rows[0].count).toBeGreaterThan(0);
    await customerPage.getByLabel("Share with").selectOption("PRIVATE");
    const accessibility = await new AxeBuilder({ page: customerPage }).analyze();
    expect(accessibility.violations.filter(item => ["serious", "critical"].includes(item.impact ?? ""))).toEqual([]);
    await customerPage.getByRole("button", { name: "Send request" }).click();
    await customerPage.getByRole("link", { name: "View your request" }).click();
    await expect(customerPage.getByRole("heading", { name: "Private customer request" })).toBeVisible();
    await expect(customerPage.getByText("Customer-visible description")).toBeVisible();
    await customerPage.getByLabel("Add a comment").fill("Please help with this request.");
    await customerPage.getByRole("button", { name: "Post comment" }).click();
    await expect(customerPage.getByText("Please help with this request.")).toBeVisible();
    const id = customerPage.url().split("/").at(-1)!;
    const fileUrl = await customerPage.getByRole("link", { name: "customer.txt" }).getAttribute("href");
    expect((await customer.request.get(fileUrl!)).status()).toBe(200);
    expect((await customer.request.get("/api/issues")).status()).toBe(401);
    expect((await customer.request.get("/api/audit")).status()).toBe(401);
    expect((await customer.request.get("/api/projects/HELP/queues")).status()).toBe(401);
    expect((await customer.request.get(`/api/portal/${unique}/requests/${id}/sla`)).status()).toBe(200);
    const otherPage = await outsider.newPage();
    await otherPage.goto(`/portal/activate?token=${await invite(`${unique}@outsider.test`)}`);
    await otherPage.getByLabel("New password").fill("CustomerPassword123");
    await otherPage.getByRole("button", { name: "Activate account" }).click();
    await expect(otherPage).toHaveURL(new RegExp(`/portal/${unique}$`));
    expect((await outsider.request.get(`/api/portal/${unique}/requests/${id}`)).status()).toBe(404);
    expect((await outsider.request.get(`/api/portal/${unique}/requests/${id}/sla`)).status()).toBe(404);
    expect((await outsider.request.get(fileUrl!)).status()).toBe(404);
    const search = await outsider.request.get(`/api/portal/${unique}/requests?q=Private`);
    expect((await search.json()).requests).toEqual([]);
    const events = await outsider.request.get(`/api/portal/${unique}/realtime`);
    expect((await events.json()).events).toEqual([]);
  } finally { await inbox.end(); await customer.close(); await outsider.close(); }
});
