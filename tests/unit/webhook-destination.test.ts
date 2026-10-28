import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { isPrivateAddress, postPinnedHttps, resolvePinnedHttpsTarget } from "../../ops/webhook-destination.mjs";

describe("pinned webhook delivery", () => {
  it("rejects a hostname whose DNS answer set contains a private address", async () => {
    await expect(resolvePinnedHttpsTarget("https://hooks.example.test/events", async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.8", family: 4 },
    ])).rejects.toThrow("unsafe webhook destination");
  });

  it("connects to the validated IP while preserving hostname SNI and Host", async () => {
    type TestResponse = EventEmitter & { statusCode: number; headers: Record<string, string>; resume: () => void };
    const response = new EventEmitter() as TestResponse;
    response.statusCode = 204;
    response.headers = {};
    response.resume = vi.fn();
    const request = vi.fn((options: Record<string, unknown>, callback: (response: TestResponse) => void) => {
      const client = new EventEmitter() as EventEmitter & { end: (body?: string) => void; setTimeout: () => void; destroy: (error: Error) => void };
      client.setTimeout = vi.fn();
      client.destroy = vi.fn();
      client.end = vi.fn((body?: string) => { expect(body).toBe('{"ok":true}'); callback(response); queueMicrotask(() => response.emit("end")); });
      expect(options).toMatchObject({ hostname: "93.184.216.34", servername: "hooks.example.test", path: "/events?x=1", headers: { host: "hooks.example.test", "x-test": "1" } });
      return client;
    });
    await expect(postPinnedHttps("https://hooks.example.test/events?x=1", { lookup: async () => [{ address: "93.184.216.34", family: 4 }], request, headers: { "x-test": "1" }, body: '{"ok":true}' })).resolves.toMatchObject({ status: 204 });
  });

  it("keeps private and mapped addresses blocked", () => {
    expect(isPrivateAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
  });
});
