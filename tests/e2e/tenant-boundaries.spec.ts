import { expect, test, type Browser, type Page } from "@playwright/test";

async function signUp(browser: Browser, prefix: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const unique = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await page.goto("/signup");
  await page.getByLabel("Your name").fill(`${prefix} Owner`);
  await page.getByLabel("Email").fill(`${unique}@example.test`);
  await page.getByLabel("Password").fill("SecurePlaneo123");
  await page.getByLabel("Workspace name").fill(`${prefix} Workspace`);
  await page.getByLabel("Workspace URL").fill(unique.toLowerCase());
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/$/);
  return { context, page };
}

type ApiInit = { method?: string; headers?: Record<string, string>; body?: string };

async function api(page: Page, path: string, init?: ApiInit) {
  return page.evaluate(
    async ({ requestPath, requestInit }) => {
      const response = await fetch(requestPath, requestInit);
      const text = await response.text();
      return { status: response.status, body: text ? JSON.parse(text) : null };
    },
    { requestPath: path, requestInit: init },
  );
}

test("workspace boundaries protect reads, writes, attachments, search, notifications, and dashboards", async ({ browser }) => {
  const alpha = await signUp(browser, "Alpha");
  const beta = await signUp(browser, "Beta");

  const created = await api(alpha.page, "/api/issues", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectKey: "FIRST", title: "alpha-tenant-secret" }),
  });
  expect(created.status).toBe(201);
  const issueId = (created.body as { issue: { id: string } }).issue.id;

  await expect.poll(async () => (await api(beta.page, `/api/issues/${issueId}/details`)).status).toBe(404);
  expect((await api(beta.page, `/api/issues/${issueId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "cross-tenant-write" }),
  })).status).toBe(404);
  const attachmentStatus = await beta.page.evaluate(async (id) => {
    const response = await fetch(`/api/issues/${id}/attachments`, { method: "POST", body: new FormData() });
    return response.status;
  }, issueId);
  expect(attachmentStatus).toBe(404);

  const search = await api(beta.page, "/api/search?q=alpha-tenant-secret");
  expect(search.status).toBe(200);
  expect((search.body as { results: unknown[] }).results).toEqual([]);

  const notifications = await api(beta.page, "/api/notifications");
  expect(notifications.status).toBe(200);
  expect(JSON.stringify(notifications.body)).not.toContain("alpha-tenant-secret");

  const dashboard = await api(beta.page, "/api/projects/FIRST/summary");
  expect(dashboard.status).toBe(200);
  expect((dashboard.body as { statuses: Array<{ issueCount: number }> }).statuses.reduce((sum, status) => sum + status.issueCount, 0)).toBe(0);

  await alpha.context.close();
  await beta.context.close();
});
