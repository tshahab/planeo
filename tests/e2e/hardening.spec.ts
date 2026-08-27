import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function signUp(page: Page) {
  const unique = `hardening-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await page.goto("/signup");
  await page.getByLabel("Your name").fill("Hardening Owner");
  await page.getByLabel("Email").fill(`${unique}@example.test`);
  await page.getByLabel("Password").fill("SecurePlaneo123");
  await page.getByLabel("Workspace name").fill("Hardening Workspace");
  await page.getByLabel("Workspace URL").fill(unique);
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/$/);
}

test.beforeEach(async ({ page }) => signUp(page));

test("keyboard users can move issues and dialog focus is restored", async ({ page }) => {
  const created = await page.evaluate(async () => {
    const response = await fetch("/api/issues", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectKey: "FIRST", title: "Keyboard movable issue" }) });
    return response.json() as Promise<{ issue: { key: string } }>;
  });
  await page.goto("/projects/FIRST");
  await page.getByRole("tab", { name: "Board", exact: true }).click();
  const card = page.getByRole("button", { name: new RegExp(`${created.issue.key}: Keyboard movable issue`) });
  await card.focus();
  await card.press("Alt+ArrowRight");
  await expect(card).toHaveAttribute("aria-label", /Status In progress/);

  const create = page.getByRole("button", { name: "Create", exact: true });
  await create.focus();
  await create.click();
  await expect(page.getByRole("dialog", { name: /First project/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(create).toBeFocused();
});

test("core authenticated routes are responsive and pass serious accessibility checks", async ({ page }) => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }]) {
    await page.setViewportSize(viewport);
    for (const path of ["/", "/projects/FIRST", "/search", "/notifications", "/settings/profile", "/settings/workspace"]) {
      await page.goto(path);
      await expect(page.locator("main").first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), `${path} at ${viewport.width}px`).toBe(true);
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? "")), `${path} at ${viewport.width}px`).toEqual([]);
    }
  }
});

test("authenticated page and common API reads meet pilot smoke budgets", async ({ page }) => {
  await page.goto("/projects/FIRST");
  const pageStart = Date.now();
  await page.reload();
  await expect(page.getByRole("heading", { name: "First project" })).toBeVisible();
  const pageDuration = Date.now() - pageStart;
  expect(pageDuration, "cached authenticated page load").toBeLessThan(2_500);
  const apiResults: Record<string, number[]> = {};

  for (const path of ["/api/issues?projectKey=FIRST", "/api/projects/FIRST/summary", "/api/search?q="]) {
    await page.evaluate((url) => fetch(url), path);
    const samples: number[] = [];
    for (let index = 0; index < 5; index += 1) {
      const start = Date.now();
      const status = await page.evaluate(async (url) => (await fetch(url)).status, path);
      expect(status).toBe(200);
      samples.push(Date.now() - start);
    }
    samples.sort((a, b) => a - b);
    apiResults[path] = samples;
    expect(samples[4], `${path} p95 smoke latency`).toBeLessThan(400);
  }
  console.log(`performance.smoke ${JSON.stringify({ pageDuration, apiResults })}`);
});
