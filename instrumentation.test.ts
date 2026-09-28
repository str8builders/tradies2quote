import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const writeAppError = vi.fn().mockResolvedValue(undefined);
vi.mock("./src/lib/observability/sink", () => ({
  writeAppError: (...args: unknown[]) => writeAppError(...args),
}));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => fn() }));

import { onRequestError } from "./instrumentation";

type Req = Parameters<typeof onRequestError>[1];
type Ctx = Parameters<typeof onRequestError>[2];

function req(path: string): Req {
  return { path, method: "GET", headers: {} } as unknown as Req;
}
const ctx: Ctx = { routerKind: "App Router", routeType: "route" } as unknown as Ctx;

const ORIGINAL_RUNTIME = process.env.NEXT_RUNTIME;
const ORIGINAL_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

beforeEach(() => {
  writeAppError.mockClear();
  process.env.NEXT_RUNTIME = "nodejs";
  delete process.env.NEXT_PUBLIC_SENTRY_DSN;
});

afterAll(() => {
  process.env.NEXT_RUNTIME = ORIGINAL_RUNTIME;
  process.env.NEXT_PUBLIC_SENTRY_DSN = ORIGINAL_DSN;
});

// The onRequestError hook only sees the outermost `.message` unless it walks
// `.cause` — Next's own "failed to pipe response" wrapper carries the real
// reason (Node's "Premature close" / ERR_STREAM_PREMATURE_CLOSE) one level
// down, which `isDroppedConnectionNoise` (src/lib/observability.ts) now
// walks into.
describe("instrumentation.onRequestError — dropped-connection noise", () => {
  it("does not report a dropped connection, even wrapped a level deep", async () => {
    const root = new Error("Premature close");
    (root as NodeJS.ErrnoException).code = "ERR_STREAM_PREMATURE_CLOSE";
    const wrapped = new Error("failed to pipe response", { cause: root });
    await onRequestError(wrapped, req("/api/quotes/123/pdf"), ctx);
    expect(writeAppError).not.toHaveBeenCalled();
  });

  it("still reports a genuine unhandled error", async () => {
    await onRequestError(new Error("boom"), req("/api/quotes/123/pdf"), ctx);
    expect(writeAppError).toHaveBeenCalledTimes(1);
  });

  it("keeps ignoring the unrelated Server Action exploit-scan noise on \"/\"", async () => {
    await onRequestError(
      new Error("Failed to find Server Action \"x\""),
      req("/"),
      ctx,
    );
    expect(writeAppError).not.toHaveBeenCalled();
  });

  it("doesn't report a page from before the last deploy calling a server action that's gone", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await onRequestError(
      new Error('Failed to find Server Action "7f3a9c". This request might be from an older or newer deployment.'),
      req("/login"),
      ctx,
    );
    expect(writeAppError).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
