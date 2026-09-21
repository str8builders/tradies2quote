import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { Environment } from "@apple/app-store-server-library";
const transport = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("node-fetch", () => ({ default: transport.fetch }));
import { BoundedAppleClient } from "./apple-client";
describe("bounded Apple transport", () => {
  it("keeps Apple's signed request on the correct host and forbids redirects", async () => {
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1", privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
    transport.fetch.mockResolvedValue({ ok: true, json: async () => ({ environment: "Sandbox", bundleId: "fixture", data: [] }) });
    const client = new BoundedAppleClient(privateKey, "key", "issuer", "fixture", Environment.SANDBOX);
    await client.getAllSubscriptionStatuses("12345");
    const [url, options] = transport.fetch.mock.calls[0];
    expect(url).toBe("https://api.storekit-sandbox.apple.com/inApps/v1/subscriptions/12345?");
    expect(options).toMatchObject({ method: "GET", redirect: "error", size: 2_000_000 });
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.headers.Authorization).toMatch(/^Bearer /);
  });
  it("never points a billing client at the local Xcode environment", () => {
    expect(() => new BoundedAppleClient("", "", "", "", Environment.XCODE)).toThrow("Unsupported Apple service environment");
  });
});
