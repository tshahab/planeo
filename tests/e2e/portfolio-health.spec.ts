import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("portfolio health is accessible and exposes governed snapshot controls", async ({ page }) => {
  const unique = `health-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await page.goto("/signup");
  await page.getByLabel("Your name").fill("Health Owner");
  await page.getByLabel("Email").fill(`${unique}@example.test`);
  await page.getByLabel("Password").fill("SecurePlaneo123");
  await page.getByLabel("Workspace name").fill("Health Workspace");
  await page.getByLabel("Workspace URL").fill(unique);
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/plans");
  await page.getByLabel("Plan name").fill("Health roadmap");
  await page.getByRole("group", { name: "Projects" }).getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "Create private plan" }).click();

  const health = page.locator(".portfolio-health-directory");
  await expect(health.getByRole("heading", { name: "Portfolio health" })).toBeVisible();
  await expect(health.getByRole("link", { name: "Export health CSV" })).toBeVisible();
  await expect(health.getByRole("button", { name: "Save snapshot" })).toBeVisible();
  await health.getByRole("button", { name: "Save snapshot" }).click();
  await expect(health.getByText("Saved snapshots").first()).toBeVisible();
  await expect(health.getByRole("link", { name: /Export health CSV/ })).toHaveAttribute("href", /format=csv/);
  expect((await new AxeBuilder({ page }).include(".portfolio-health-directory").analyze()).violations).toEqual([]);
});
