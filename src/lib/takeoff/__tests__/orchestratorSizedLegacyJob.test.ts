import { describe, expect, it } from "vitest";
import { orchestratorSizedLegacyJob } from "../legacyCoverage";

const scope = (scope: string, status: string, lines: number) => ({
  scope: scope as never,
  status,
  lines: Array.from({ length: lines }, () => ({})),
});

describe("orchestratorSizedLegacyJob — no 'sizes needed' line when the job was already counted", () => {
  it("a frame-only wall sized by the framing scope counts as sized", () => {
    expect(orchestratorSizedLegacyJob("wall", [scope("framing", "ok", 4)])).toBe(true);
  });

  it("a ceiling or partition lined by area counts as sized", () => {
    expect(orchestratorSizedLegacyJob("wall", [scope("lining", "ok", 3)])).toBe(true);
  });

  it("fixings alone don't count as sizing the job", () => {
    expect(orchestratorSizedLegacyJob("wall", [scope("fixing", "ok", 2)])).toBe(false);
  });

  it("a blocked or empty scope doesn't count", () => {
    expect(orchestratorSizedLegacyJob("wall", [scope("framing", "blocked", 0)])).toBe(false);
    expect(orchestratorSizedLegacyJob("wall", [scope("lining", "ok", 0)])).toBe(false);
  });

  it("only scopes that job type owns count (a fence doesn't size a deck)", () => {
    expect(orchestratorSizedLegacyJob("deck", [scope("fencing", "ok", 5)])).toBe(false);
    expect(orchestratorSizedLegacyJob("deck", [scope("deck", "ok", 5)])).toBe(true);
    expect(orchestratorSizedLegacyJob("unknown", [scope("framing", "ok", 5)])).toBe(false);
  });
});
