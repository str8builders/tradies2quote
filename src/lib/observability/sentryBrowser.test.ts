import { afterEach, describe, expect, it, vi } from "vitest";

describe("sentryBrowser", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.doUnmock("@sentry/nextjs");
  });

  it("loads nothing and reports nothing without a DSN", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");
    const factory = vi.fn(() => ({ captureException: vi.fn() }));
    vi.doMock("@sentry/nextjs", factory);
    const mod = await import("./sentryBrowser");
    expect(await mod.loadSentry()).toBeNull();
    mod.captureToSentry(new Error("ignored"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(factory).not.toHaveBeenCalled();
  });

  it("loads the SDK once and forwards caught errors when a DSN is set", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://public@example.invalid/1");
    const captureException = vi.fn();
    vi.doMock("@sentry/nextjs", () => ({ captureException }));
    const mod = await import("./sentryBrowser");
    const error = new Error("boom");
    mod.captureToSentry(error);
    await vi.waitFor(() => expect(captureException).toHaveBeenCalledWith(error));
    const [first, second] = await Promise.all([mod.loadSentry(), mod.loadSentry()]);
    expect(first).toBe(second);
  });
});
