import { describe, expect, it } from "vitest";
import { shouldReportBoundaryError } from "./boundary-report";

describe("which boundary errors are reported", () => {
  it("a real client-side error is", () => {
    expect(shouldReportBoundaryError(new TypeError("Cannot read properties of undefined (reading 'map')"))).toBe(true);
    expect(shouldReportBoundaryError("thrown string")).toBe(true);
  });

  it("a server error (it has a digest) is not: the server already recorded it", () => {
    expect(shouldReportBoundaryError(Object.assign(new Error("An error occurred in the Server Components render."), { digest: "3405581620" }))).toBe(false);
    // An empty digest is not a digest.
    expect(shouldReportBoundaryError(Object.assign(new Error("boom"), { digest: "" }))).toBe(true);
  });

  it("a stale deploy is not: the page reloads itself", () => {
    const stale = new Error('Server Action "7f3a9c" was not found on the server.');
    stale.name = "UnrecognizedActionError";
    expect(shouldReportBoundaryError(stale)).toBe(false);
    expect(shouldReportBoundaryError(new Error('Failed to find Server Action "abc". This request might be from an older or newer deployment.'))).toBe(false);
    const chunk = new Error("Loading chunk 812 failed.");
    chunk.name = "ChunkLoadError";
    expect(shouldReportBoundaryError(chunk)).toBe(false);
  });
});
