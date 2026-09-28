import { afterEach, describe, expect, it, vi } from "vitest";
import { reportClientError } from "./clientReport";

type StubOptions = {
  htmlClasses?: string[];
  appleDataDetectors?: boolean;
  grammarly?: boolean;
  sendBeacon?: ((url: string, data: Blob) => boolean) | false;
};

function stubBrowser(opts: StubOptions = {}) {
  const classes = new Set(opts.htmlClasses ?? []);
  vi.stubGlobal("document", {
    documentElement: { classList: { contains: (c: string) => classes.has(c) } },
    querySelector: (sel: string) =>
      opts.appleDataDetectors && sel === "[x-apple-data-detectors]" ? {} : null,
    body: {
      hasAttribute: (attr: string) => Boolean(opts.grammarly) && attr === "data-gr-ext-installed",
    },
  });
  vi.stubGlobal("window", { location: { pathname: "/app/quotes/new" } });
  const sendBeacon = opts.sendBeacon === false ? undefined : (opts.sendBeacon ?? vi.fn(() => true));
  vi.stubGlobal("navigator", sendBeacon ? { sendBeacon } : {});
  return { sendBeacon };
}

/** Decode the JSON payload handed to sendBeacon's Blob. */
async function payloadFrom(sendBeacon: ReturnType<typeof vi.fn>) {
  const blob = sendBeacon.mock.calls[0][1] as Blob;
  return JSON.parse(await blob.text());
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("reportClientError — outside a browser", () => {
  it("does nothing (no window) and never throws", () => {
    expect(() => reportClientError(new Error("boom"), "error")).not.toThrow();
  });
});

describe("reportClientError — real Error objects", () => {
  it("sends the real name/message/stack, capped at 3,500 characters", () => {
    const { sendBeacon } = stubBrowser();
    const err = new Error("boom");
    err.stack = "Error: boom\n" + "    at x (y.js:1:1)\n".repeat(500); // well over 3,500 chars
    reportClientError(err, "error");
    expect(sendBeacon).toHaveBeenCalledTimes(1);
    return payloadFrom(sendBeacon as ReturnType<typeof vi.fn>).then((payload) => {
      expect(payload.name).toBe("Error");
      expect(payload.message).toBe("boom");
      expect(payload.stack.length).toBeLessThanOrEqual(3500);
      expect(payload.stack.startsWith("Error: boom")).toBe(true);
    });
  });
});

describe("reportClientError — non-Error values send no fabricated stack", () => {
  it("a plain string becomes the message, with no stack at all", async () => {
    const { sendBeacon } = stubBrowser();
    reportClientError("Script error.", "error");
    const payload = await payloadFrom(sendBeacon as ReturnType<typeof vi.fn>);
    expect(payload.message).toBe("Script error.");
    expect(payload.name).toBe("Error");
    expect(payload.stack).toBeUndefined();
  });

  it("a non-string, non-Error value falls back to a plain label, still no stack", async () => {
    const { sendBeacon } = stubBrowser();
    reportClientError({ weird: "object" }, "unhandledrejection");
    const payload = await payloadFrom(sendBeacon as ReturnType<typeof vi.fn>);
    expect(payload.message).toBe("Client error");
    expect(payload.stack).toBeUndefined();
  });
});

describe("reportClientError — page-rewrite flags", () => {
  it("are all false on a stock page", async () => {
    const { sendBeacon } = stubBrowser();
    reportClientError(new Error("boom"), "error");
    const payload = await payloadFrom(sendBeacon as ReturnType<typeof vi.fn>);
    expect(payload.flags).toEqual({ translated: false, appleDataDetectors: false, grammarly: false });
  });

  it("flag Chrome's translate rewrite", async () => {
    const { sendBeacon } = stubBrowser({ htmlClasses: ["translated-ltr"] });
    reportClientError(new Error("boom"), "error");
    const payload = await payloadFrom(sendBeacon as ReturnType<typeof vi.fn>);
    expect(payload.flags.translated).toBe(true);
  });

  it("flag iOS Safari's data detectors", async () => {
    const { sendBeacon } = stubBrowser({ appleDataDetectors: true });
    reportClientError(new Error("boom"), "error");
    const payload = await payloadFrom(sendBeacon as ReturnType<typeof vi.fn>);
    expect(payload.flags.appleDataDetectors).toBe(true);
  });

  it("flag Grammarly's extension", async () => {
    const { sendBeacon } = stubBrowser({ grammarly: true });
    reportClientError(new Error("boom"), "error");
    const payload = await payloadFrom(sendBeacon as ReturnType<typeof vi.fn>);
    expect(payload.flags.grammarly).toBe(true);
  });
});

describe("reportClientError — transport", () => {
  it("falls back to a keepalive fetch when sendBeacon isn't available", () => {
    stubBrowser({ sendBeacon: false });
    const fetchMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("fetch", fetchMock);
    reportClientError(new Error("boom"), "error");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/internal/client-error");
    expect(init.keepalive).toBe(true);
    expect(JSON.parse(init.body).message).toBe("boom");
  });
});
