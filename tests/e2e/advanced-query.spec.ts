import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("runs, versions, validates, and exposes an accessible advanced search", async ({ page }) => {
  const unique = `query-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await page.goto("/signup");
  await page.getByLabel("Your name").fill("Query Owner");
  await page.getByLabel("Email").fill(`${unique}@example.test`);
  await page.getByLabel("Password").fill("SecurePlaneo123");
  await page.getByLabel("Workspace name").fill("Query Workspace");
  await page.getByLabel("Workspace URL").fill(unique);
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/search");
  const query = page.getByLabel("Advanced query");
  await query.fill("project = FIRST AND priority IN (MEDIUM, HIGH)");
  await page.getByRole("button", { name: "Run query" }).click();
  await expect(page).toHaveURL(/queryVersion=1/);
  await expect(page.locator(".search-results-heading strong")).toContainText("issues");
  expect((await new AxeBuilder({ page }).include(".search-content").analyze()).violations).toEqual([]);
  await query.fill("unknown = value");
  await page.getByRole("button", { name: "Run query" }).click();
  await expect(page.locator(".search-state-error")).toContainText("supported field");
});
