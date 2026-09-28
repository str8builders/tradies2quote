import { describe, expect, it } from "vitest";
import manifest from "./install-manifest";

// The install prompt's description used to promise "in under 60 seconds" —
// never timed on a real quote (see src/app/_components/jobsite/story.ts,
// which deliberately dropped the same claim).
describe("install manifest — no untimed speed claim", () => {
  it("describes the app without a speed claim it can't back up", () => {
    const { description } = manifest();
    expect(description).not.toMatch(/\d+\s*seconds?|under a minute/i);
    expect(description).toContain("Voice-first AI quoting for tradies");
  });
});
