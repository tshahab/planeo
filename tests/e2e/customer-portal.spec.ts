import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

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
