import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { Client } from "pg";

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
    await customerPage.getByRole("link", { name: /Get support/ }).click();
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
