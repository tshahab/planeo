import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("workspace administrator configures an accessible planning level", async ({ page }) => {
  const unique = `hierarchy-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await page.goto("/signup");
  await page.getByLabel("Your name").fill("Hierarchy Owner");
  await page.getByLabel("Email").fill(`${unique}@example.test`);
  await page.getByLabel("Password").fill("SecurePlaneo123");
  await page.getByLabel("Workspace name").fill("Hierarchy Workspace");
  await page.getByLabel("Workspace URL").fill(unique);
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/settings/workspace");
  await page.getByLabel("Level name").fill("Initiative");
  await page.getByLabel("Level color").fill("#3978b8");
  await page.getByRole("button", { name: "Add level" }).click();
  await expect(page.getByText("Hierarchy level created.")).toBeVisible();
  await expect(page.getByText("Initiative")).toBeVisible();
  expect((await new AxeBuilder({ page }).include(".hierarchy-admin").analyze()).violations).toEqual([]);
});
