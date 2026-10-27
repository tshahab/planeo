import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function run(script: string, env: Partial<NodeJS.ProcessEnv>, args: string[] = []) {
  return () => execFileSync(process.execPath, [join(root, script), ...args], {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

describe("production readiness controls", () => {
  it("runs the production preflight before starting the server", () => {
    const dockerfile = readFileSync(join(root, "Dockerfile"), "utf8");
    expect(dockerfile).toContain("node ops/validate-production-env.mjs && exec node server.js");
  });

  it("rejects non-production or incomplete environments", () => {
    expect(run("ops/validate-production-env.mjs", { NODE_ENV: "test" })).toThrow(/NODE_ENV must be production/);
    expect(run("ops/validate-production-env.mjs", { NODE_ENV: "production" })).toThrow(/missing or short/);
  });

  it("accepts production secrets only when all required values are strong", () => {
    const output = run("ops/validate-production-env.mjs", {
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://prod.example/planeo",
      SESSION_SECRET: "s".repeat(32),
      ATTACHMENT_SIGNING_SECRET: "a".repeat(32),
      AUDIT_EXPORT_KEY: "k".repeat(32),
      APP_URL: "https://plan-uat.teknosys.ai",
    })();
    expect(output).toContain("Production environment validated");
  });

  it.each([
    "http://plan-uat.teknosys.ai",
    "https://plan-uat.teknosys.ai/login",
    "https://plan-uat.teknosys.ai?redirect=/login",
    "https://user:password@plan-uat.teknosys.ai",
    "not a url",
  ])("rejects non-canonical APP_URL %s", (APP_URL) => {
    expect(run("ops/validate-production-env.mjs", {
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://prod.example/planeo",
      SESSION_SECRET: "s".repeat(32),
      ATTACHMENT_SIGNING_SECRET: "a".repeat(32),
      AUDIT_EXPORT_KEY: "k".repeat(32),
      APP_URL,
    })).toThrow(/canonical HTTPS origin required/);
  });

  it("renders only explicit immutable release tags", () => {
    const directory = mkdtempSync(join(tmpdir(), "planeo-release-"));
    const output = join(directory, "manifest.yaml");
    try {
      expect(run("ops/render-release-manifest.mjs", { RELEASE_TAG: "2026.10.27-rc1" }, [output])()).toContain("Rendered");
      const rendered = readFileSync(output, "utf8");
      expect(rendered).toContain(":2026.10.27-rc1");
      expect(rendered).not.toContain(":release-placeholder");
      expect(run("ops/render-release-manifest.mjs", { RELEASE_TAG: "latest" }, [output])).toThrow(/explicit immutable image tag/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
