/**
 * GOLDEN JOBS — the "proof before every release" set.
 *
 * Realistic NZ jobs whose every quantity and dollar figure was worked out by
 * hand from first principles (the working is in the fixtures, and in every
 * failure message). Each figure is its own test and must match EXACTLY:
 * integers for counts, scaled integers for decimal quantities, integer cents
 * for money. No AI, no network, no database — runs in plain `npm test`.
 *
 *   npx vitest run src/eval/golden
 *
 * KNOWN BUGS: where the code disagrees with the hand working (re-checked),
 * the figure runs as `it.fails` with a "KNOWN BUG: …" note — green today, RED
 * the moment someone fixes the bug. When that happens, delete the entry from
 * the job's `knownBugs` so the figure becomes a normal passing test.
 */
import { describe, expect, it } from "vitest";
import { GOLDEN_JOBS } from "./jobs";
import { compare, type Actuals, type GoldenJob } from "./types";

function memo(job: GoldenJob): () => Actuals {
  let cached: Actuals | null = null;
  return () => (cached ??= job.compute());
}

describe("golden jobs — fixture integrity", () => {
  it("has at least 30 jobs, all with unique ids", () => {
    const ids = GOLDEN_JOBS.map((j) => j.id);
    expect(ids.length).toBeGreaterThanOrEqual(30);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const job of GOLDEN_JOBS) {
    it(`${job.id}: every known bug names a real figure and says KNOWN BUG`, () => {
      for (const [key, note] of Object.entries(job.knownBugs ?? {})) {
        expect(job.expect, `${job.id}: knownBugs key "${key}" has no expectation`).toHaveProperty([key]);
        expect(note.startsWith("KNOWN BUG:"), `${job.id} › ${key}: note must start "KNOWN BUG:"`).toBe(true);
      }
    });
    it(`${job.id}: every figure carries its working`, () => {
      for (const [key, e] of Object.entries(job.expect)) {
        expect(e.working.trim().length, `${job.id} › ${key} has no working`).toBeGreaterThan(0);
      }
    });
  }
});

for (const job of GOLDEN_JOBS) {
  describe(`${job.id} — ${job.title}`, () => {
    const actuals = memo(job);
    for (const [key, expected] of Object.entries(job.expect)) {
      const bug = job.knownBugs?.[key];
      const run = () => {
        const verdict = compare(job.id, key, expected, actuals()[key]);
        if (!verdict.ok) throw new Error(verdict.message);
      };
      if (bug) it.fails(`${key} — ${bug}`, run);
      else it(key, run);
    }
  });
}
