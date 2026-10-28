import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("bulk worker transaction resilience", () => {
  it("uses bounded retry handling for transient Prisma transaction failures", async () => {
    const source = await readFile(new URL("../../ops/bulk-worker.mjs", import.meta.url), "utf8");

    expect(source).toContain('transactionTimeout=30000');
    expect(source).toContain('transactionMaxWait=10000');
    expect(source).toContain('transactionRetries=3');
    expect(source).toContain('error?.code==="P2028"');
    expect(source).toContain('attempt>=transactionRetries');
    expect(source).toContain('maxWait:transactionMaxWait,timeout:transactionTimeout');
  });

  it("does not retry validation or optimistic-concurrency failures", async () => {
    const source = await readFile(new URL("../../ops/bulk-worker.mjs", import.meta.url), "utf8");

    expect(source).toContain('if(!isRetryableTransactionError(error)||attempt>=transactionRetries)throw error');
    expect(source).toContain("Issue changed during execution.");
    expect(source).toContain("Issue changed since preview");
  });
});
