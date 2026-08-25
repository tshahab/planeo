import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("liveness and readiness distinguish process and dependency health", async ({ request }) => {
  await expect((await request.get("/api/health/live")).json()).resolves.toEqual({ status: "ok" });
  await expect((await request.get("/api/health/ready")).json()).resolves.toEqual({ status: "ready" });
});

test("new user creates a usable workspace", async ({ page }) => {
  const unique = Date.now();
  await page.goto("/signup");
  await page.getByLabel("Your name").fill("Pilot Owner");
  await page.getByLabel("Email").fill(`pilot-${unique}@example.test`);
  await page.getByLabel("Password").fill("SecurePlaneo123");
  await page.getByLabel("Workspace name").fill("Pilot Workspace");
  await page.getByLabel("Workspace URL").fill(`pilot-${unique}`);
  await page.getByRole("button", { name: "Create workspace" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("Pilot Workspace")).toBeVisible();
  await page.goto("/projects/FIRST");
  await expect(page.getByRole("heading", { name: "First project" })).toBeVisible();
});

test("public authentication routes have no serious accessibility violations", async ({ page }) => {
  for (const path of ["/login", "/signup", "/forgot-password"]) {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? "")),
      path,
    ).toEqual([]);
  }
});
