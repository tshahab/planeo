import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("service owner publishes an accessible customer form and submits one request", async ({ page }) => {
  const unique = Date.now();
  await page.goto("/signup");
  await page.getByLabel("Your name").fill("Service Owner");
  await page.getByLabel("Email").fill(`service-${unique}@example.test`);
  await page.getByLabel("Password").fill("SecurePlaneo123");
  await page.getByLabel("Workspace name").fill("Service Workspace");
  await page.getByLabel("Workspace URL").fill(`service-${unique}`);
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/$/);

  const post = (path: string, body?: unknown) => page.evaluate(async ({ path: target, body: payload }) => { const response = await fetch(target, { method: "POST", headers: { "Content-Type": "application/json" }, body: payload === undefined ? undefined : JSON.stringify(payload) }); return { status: response.status, body: await response.json() }; }, { path, body });
  const projectResponse = await post("/api/projects", { name: "Customer help", key: "HELP", template: "SERVICE", visibility: "PRIVATE" });
  expect(projectResponse.status).toBe(201);
  const typeResponse = await post("/api/projects/HELP/request-types", { name: "Technical help", description: "Tell us what went wrong.", consentText: "I consent to service processing.", schema: { fields: [
    { key: "summary", kind: "summary", label: "Summary", required: true, validation: { maxLength: 200 } },
    { key: "description", kind: "description", label: "Details", helpText: "Do not include passwords.", required: true },
    { key: "priority", kind: "priority", label: "Impact", required: true, options: ["Low", "Medium", "High", "Urgent"] },
  ] } });
  expect(typeResponse.status).toBe(201);
  const requestType = (typeResponse.body as { requestType: { id: string } }).requestType;
  expect((await post(`/api/projects/HELP/request-types/${requestType.id}/publish`)).status).toBe(201);

  await page.goto(`/service/forms/${requestType.id}`);
  await page.getByLabel("Summary *").fill("Cannot access billing");
  await page.getByLabel("Details *").fill("The billing page reports an error.");
  await page.getByLabel("Impact *").selectOption("High");
  await page.getByLabel("I consent to service processing.").check();
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? ""))).toEqual([]);
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByRole("status")).toContainText("HELP-1");
});
