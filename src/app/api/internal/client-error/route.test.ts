import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const captureClientReport = vi.fn();
vi.mock("@/lib/observability", () => ({
  captureClientReport: (...args: unknown[]) => captureClientReport(...args),
}));

import { POST } from "./route";

beforeEach(() => {
  captureClientReport.mockClear();
});

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/internal/client-error", {
    method: "POST",
    body,
  });
}

describe("POST /api/internal/client-error — the 8 KB cap used to drop real reports", () => {
  it("processes a realistic report carrying a full 3,500-character stack", async () => {
    const rawStack = "Error: boom\n" + "    at fn (https://app.example.com/_next/static/chunks/app.js:1:1)\n".repeat(60);
    const stack = rawStack.slice(0, 3500);
    const payload = JSON.stringify({
      name: "Error",
      message: "boom",
      stack,
      kind: "error",
      path: "/app/quotes/new",
      flags: { translated: false, appleDataDetectors: false, grammarly: false },
    });
    // This is the largest stack the current client ever sends (clientReport.ts
    // caps it at 3,500 chars) — well clear of the old 8 KB cap even before
    // accounting for JSON escaping, but it's the shape a real report takes.
    expect(payload.length).toBeGreaterThan(3500);

    const res = await POST(request(payload));

    expect(res.status).toBe(204);
    expect(captureClientReport).toHaveBeenCalledTimes(1);
  });

  it("still processes a report whose (client-uncapped) message pushed the old payload past 8 KB", async () => {
    // clientReport.ts caps the STACK client-side but never the message —
    // an unusual error thrown with a very long message could still produce
    // a payload past the old 8,192-byte cap on its own.
    const payload = JSON.stringify({
      name: "Error",
      message: "x".repeat(9000),
      path: "/app/quotes/new",
    });
    expect(payload.length).toBeGreaterThan(8 * 1024);

    const res = await POST(request(payload));

    expect(res.status).toBe(204);
    expect(captureClientReport).toHaveBeenCalledTimes(1);
  });

  it("still drops an absurdly oversized payload (the abuse guard, not a loss mechanism)", async () => {
    const payload = JSON.stringify({ message: "boom", stack: "x".repeat(64 * 1024) });
    const res = await POST(request(payload));
    expect(res.status).toBe(204);
    expect(captureClientReport).not.toHaveBeenCalled();
  });

  it("drops a non-JSON body without ever calling captureClientReport", async () => {
    const res = await POST(request("not json"));
    expect(res.status).toBe(204);
    expect(captureClientReport).not.toHaveBeenCalled();
  });
});
