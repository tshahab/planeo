import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("creates and checks in an accessible organizational goal", async ({ page }) => {
  const unique = `goals-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await page.goto("/signup");
  await page.getByLabel("Your name").fill("Goal Owner");
  await page.getByLabel("Email").fill(`${unique}@example.test`);
  await page.getByLabel("Password").fill("SecurePlaneo123");
  await page.getByLabel("Workspace name").fill("Goal Workspace");
  await page.getByLabel("Workspace URL").fill(unique);
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/goals");
  await page.getByLabel("Name").fill("Improve customer retention");
  await page.getByRole("button", { name: "Create goal" }).click();
  await expect(page.getByRole("heading", { name: "Improve customer retention" })).toBeVisible();
  await page.getByLabel("Update").fill("Baseline agreed with the customer team.");
  await page.getByRole("button", { name: "Save check-in" }).click();
  await expect(page.getByText(/Version 2/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Export CSV" })).toBeVisible();
  expect((await new AxeBuilder({ page }).include(".goals-page").analyze()).violations).toEqual([]);
});
