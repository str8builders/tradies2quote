import { beforeEach, describe, expect, it, vi } from "vitest";

const writeAppError = vi.fn().mockResolvedValue(undefined);
vi.mock("./observability/sink", () => ({
  writeAppError: (...args: unknown[]) => writeAppError(...args),
}));
// Run the scheduled write immediately (synchronously) so tests can assert
// on it without waiting on Next's request-scoped `after()`.
vi.mock("next/server", () => ({ after: (fn: () => unknown) => fn() }));

import { captureClientReport, captureError, isDroppedConnectionNoise } from "./observability";

beforeEach(() => {
  writeAppError.mockClear();
});

describe("isDroppedConnectionNoise", () => {
  it("matches a top-level message", () => {
    expect(isDroppedConnectionNoise(new Error("The destination stream closed early"))).toBe(true);
    expect(isDroppedConnectionNoise(new Error("failed to pipe response"))).toBe(false); // message alone doesn't match — needs the cause or a code
    expect(isDroppedConnectionNoise(new Error("Premature close"))).toBe(true);
    expect(isDroppedConnectionNoise(new Error("read ECONNRESET"))).toBe(true);
    expect(isDroppedConnectionNoise(new Error("write EPIPE"))).toBe(true);
    expect(isDroppedConnectionNoise(new Error("aborted"))).toBe(true);
    expect(isDroppedConnectionNoise("aborted")).toBe(true);
  });

  it("matches a machine code carried on `.code`, independent of the message", () => {
    const err = new Error("failed to pipe response");
    (err as NodeJS.ErrnoException).code = "ERR_STREAM_PREMATURE_CLOSE";
    expect(isDroppedConnectionNoise(err)).toBe(true);
  });

  it("walks `.cause` to find the real reason Next/Node buried a level or two down", () => {
    const root = new Error("Premature close");
    (root as NodeJS.ErrnoException).code = "ERR_STREAM_PREMATURE_CLOSE";
    const middle = new Error("pipe failed", { cause: root });
    const top = new Error("failed to pipe response", { cause: middle });
    expect(isDroppedConnectionNoise(top)).toBe(true);
  });

  it("gives up after 4 levels rather than walking forever", () => {
    let deepest: Error = new Error("Premature close");
    (deepest as NodeJS.ErrnoException).code = "ERR_STREAM_PREMATURE_CLOSE";
    // 5 wrapping layers on top of the real cause — one past the 4-deep walk.
    for (let i = 0; i < 5; i++) deepest = new Error(`wrap ${i}`, { cause: deepest });
    expect(isDroppedConnectionNoise(deepest)).toBe(false);
  });

  it("leaves a real app error alone", () => {
    expect(isDroppedConnectionNoise(new Error("Cannot read properties of undefined (reading 'x')"))).toBe(false);
    expect(isDroppedConnectionNoise(new TypeError("boom"))).toBe(false);
  });
});

describe("captureError — drops connection noise before it reaches the sink", () => {
  it("does not write a dropped-connection error, however deep its cause", () => {
    const root = new Error("Premature close");
    (root as NodeJS.ErrnoException).code = "ERR_STREAM_PREMATURE_CLOSE";
    captureError(new Error("failed to pipe response", { cause: root }), { route: "/api/x" });
    expect(writeAppError).not.toHaveBeenCalled();
  });

  it("still writes a genuine error", () => {
    captureError(new Error("boom"), { route: "/api/x" });
    expect(writeAppError).toHaveBeenCalledTimes(1);
  });
});

describe("captureClientReport — drops the same noise from a browser payload", () => {
  it("does not write a dropped-connection message", () => {
    captureClientReport({ message: "aborted" });
    expect(writeAppError).not.toHaveBeenCalled();
  });

  it("still writes a genuine client error", () => {
    captureClientReport({ message: "TypeError: boom", path: "/app" });
    expect(writeAppError).toHaveBeenCalledTimes(1);
  });
});
