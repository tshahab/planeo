import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("agents create accessible queue views and claim requests from a consistent snapshot", async ({ page, browser }) => {
  const unique = `queues-${Date.now()}`;
  await page.goto("/signup");
  await page.getByLabel("Your name").fill("Queue owner");
  await page.getByLabel("Email").fill(`${unique}@owner.test`);
  await page.getByLabel("Password").fill("SecurePlaneo123");
  await page.getByLabel("Workspace name").fill("Queue service");
  await page.getByLabel("Workspace URL").fill(unique);
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/$/);
  const post = async (path: string, body: unknown) => page.evaluate(async ({ path, body }) => {
    const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  }, { path, body });
  expect((await post("/api/projects", { name: "Support", key: "HELP", template: "SERVICE", visibility: "PRIVATE" })).status).toBe(201);
  const created = await post("/api/projects/HELP/request-types", { name: "Help", schema: { fields: [{ key: "summary", kind: "summary", label: "Summary", required: true }] } });
  expect(created.status).toBe(201);
  expect((await post(`/api/projects/HELP/request-types/${created.body.requestType.id}/publish`, {})).status).toBe(201);
  expect((await post(`/api/service/forms/${created.body.requestType.id}/submissions`, { values: { summary: "Queue test request" } })).status).toBe(201);
  await page.goto("/projects/HELP/queues");
  await page.getByRole("button", { name: "New queue", exact: true }).click();
  await page.getByLabel("Queue name").fill("Unassigned triage");
  await page.getByLabel("Visibility", { exact: true }).selectOption("TEAM");
  await page.getByLabel("Assignee filter").selectOption("unassigned");
  await page.getByLabel("Default view").check();
  await page.getByRole("button", { name: "Save queue" }).click();
  await expect(page.getByRole("heading", { name: "Unassigned triage", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Queue test request/ })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations.filter(item => ["serious", "critical"].includes(item.impact ?? ""))).toEqual([]);
  await page.getByRole("checkbox", { name: /Select HELP-/ }).check();
  await page.getByRole("button", { name: "Apply to 1 selected" }).click();
  await expect(page.getByText("1 request(s) updated.", { exact: true })).toBeVisible();
  await expect(page.getByText("No requests match this queue.")).toBeVisible();
  await page.getByRole("button", { name: "Edit queue" }).click();
  await page.getByLabel("Assignee filter").selectOption("");
  await page.getByLabel("Group by").selectOption("assignee");
  await page.getByRole("button", { name: "Save queue" }).click();
  await expect(page.getByRole("heading", { name: "Queue owner", exact: true })).toBeVisible();
  const anonymous = await browser.newContext();
  try { expect((await anonymous.request.get("/api/projects/HELP/queues")).status()).toBe(401); }
  finally { await anonymous.close(); }
});
