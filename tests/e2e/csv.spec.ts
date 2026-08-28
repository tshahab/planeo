import { expect, test, type Page } from "@playwright/test";
import { ISSUE_CSV_COLUMNS } from "../../src/lib/csv";

async function signUp(page: Page) { const unique = `csv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; await page.goto("/signup"); await page.getByLabel("Your name").fill("CSV Owner"); await page.getByLabel("Email").fill(`${unique}@example.test`); await page.getByLabel("Password").fill("SecurePlaneo123"); await page.getByLabel("Workspace name").fill("CSV Workspace"); await page.getByLabel("Workspace URL").fill(unique); await page.getByRole("button", { name: "Create workspace" }).click(); await expect(page).toHaveURL(/\/$/); }
async function send(page: Page, body: unknown) { return page.evaluate(async (value) => { const response = await fetch("/api/projects/FIRST/issues/csv", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(value) }); return { status: response.status, body: await response.json() }; }, body); }

test("CSV preview, atomic validation, idempotent import, and safe export", async ({ page }) => {
  await signUp(page); const header = ISSUE_CSV_COLUMNS.join(","); const csv = `${header}\nrow-1,Imported issue,Unicode ✓,Task,To do,HIGH,,,,,,,\nrow-2,=Formula is text,,Task,To do,LOW,,,,,row-1,row-1,`;
  expect(await send(page, { csv, idempotencyKey: "csv-e2e", dryRun: true })).toMatchObject({ status: 200, body: { valid: true, rowCount: 2 } });
  expect(await send(page, { csv: `${header}\nbad,,,,WRONG,,,,,,,,`, idempotencyKey: "invalid", dryRun: false })).toMatchObject({ status: 422, body: { valid: false } });
  const imported = await send(page, { csv, idempotencyKey: "csv-e2e", dryRun: false }); expect(imported).toMatchObject({ status: 201, body: { imported: 2, idempotentReplay: false } });
  expect(await send(page, { csv, idempotencyKey: "csv-e2e", dryRun: false })).toMatchObject({ status: 200, body: { imported: 2, idempotentReplay: true } });
  const exported = await page.evaluate(async () => { const response = await fetch("/api/projects/FIRST/issues/csv?q=Formula"); return { status: response.status, text: await response.text() }; }); expect(exported.status).toBe(200); expect(exported.text).toContain("'=Formula is text");
});
