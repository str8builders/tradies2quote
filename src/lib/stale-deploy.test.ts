import { describe, expect, it } from "vitest";
import { isOutOfDate, isStaleDeployError } from "./stale-deploy";

describe("a page left open across an update", () => {
  it("recognises the error an old page gets from the new server", () => {
    expect(
      isStaleDeployError(
        new Error('Failed to find Server Action "405b4d19dccebe98c5f8d361f42e83a1af24c35bac". This request might be from an older or newer deployment.'),
      ),
    ).toBe(true);
    expect(isStaleDeployError(new Error('Server Action "40bcecfe" was not found on the server.'))).toBe(true);
  });

  it("leaves real network and app errors alone", () => {
    expect(isStaleDeployError(new TypeError("Load failed"))).toBe(false);
    expect(isStaleDeployError(new Error("Not clocked in"))).toBe(false);
    expect(isStaleDeployError(null)).toBe(false);
  });

  it("reloads only when the live commit is a different one", () => {
    expect(isOutOfDate("6425558b7", "d359ed464")).toBe(true);
    expect(isOutOfDate("d359ed464", "d359ed464")).toBe(false);
    expect(isOutOfDate(null, "d359ed464")).toBe(false); // local dev: no build to compare
    expect(isOutOfDate("d359ed464", null)).toBe(false);
    expect(isOutOfDate("d359ed464", "")).toBe(false);
  });
});
