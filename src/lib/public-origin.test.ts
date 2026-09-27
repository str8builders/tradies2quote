import { afterEach, describe, expect, it, vi } from "vitest";
import { publicOrigin, publicUrl } from "./public-origin";

// What Next hands a route handler behind Caddy: its own listening address.
const behindProxy = (headers: Record<string, string> = {}) =>
  new Request("https://localhost:3001/auth/signout", { method: "POST", headers });

afterEach(() => vi.unstubAllEnvs());

describe("publicOrigin", () => {
  it("uses the configured site address, never the server's own", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://tradies2quote.com/");
    expect(publicOrigin(behindProxy({ host: "localhost:3001" }))).toBe("https://tradies2quote.com");
    expect(publicUrl("/login", behindProxy()).href).toBe("https://tradies2quote.com/login");
  });

  it("falls back to the forwarded host when nothing is configured", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    expect(publicOrigin(behindProxy({ "x-forwarded-host": "tradies2quote.com", "x-forwarded-proto": "https" }))).toBe(
      "https://tradies2quote.com",
    );
  });

  it("uses the request itself in local development", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    const local = new Request("http://localhost:3000/auth/callback");
    expect(publicOrigin(local)).toBe("http://localhost:3000");
  });

  it("ignores a malformed configured address", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "not a url");
    expect(publicOrigin(behindProxy({ host: "tradies2quote.com", "x-forwarded-proto": "https" }))).toBe(
      "https://tradies2quote.com",
    );
  });
});
