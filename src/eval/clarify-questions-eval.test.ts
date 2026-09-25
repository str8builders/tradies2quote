/**
 * Clarifying-questions agent — RUNS REAL MODEL CALLS.
 *
 * Gated behind RUN_CLARIFY_EVAL so it never runs in `npm test` / CI:
 *
 *   RUN_CLARIFY_EVAL=1 npx vitest run src/eval/clarify-questions-eval.test.ts
 *   (or: node scripts/run-release-evals.mjs)
 *
 * Needs ANTHROPIC_API_KEY (shell env or .env.local), or TEXT_AI_PROVIDER=local.
 *
 * The public "Request a quote" form asks the client up to three questions
 * (quote-requests/questions.ts → suggestClarifyingQuestions) before the
 * request reaches the tradie. When the description leaves out the size of
 * the job, the agent must ASK for it — a quote can't be built on a guessed
 * deck size or fence length. When the size is given, it must not ask again.
 * It must never ask about budget. `suggestClarifyingQuestions` swallows model
 * errors and returns no questions, so an unavailable model is detected via
 * its warning and FAILS the case instead of passing it vacuously.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { suggestClarifyingQuestions } from "@/lib/quote-requests/questions";
import { ASKS_ABOUT_BUDGET, CLARIFY_CASES } from "./agent-guardrails-cases";
import { haveModelAccess } from "./eval-env";

const ENABLED = process.env.RUN_CLARIFY_EVAL === "1";

type Row = { id: string; ok: boolean; questions: string[]; problems: string[] };
const rows: Row[] = [];

describe.skipIf(!ENABLED)("clarifying questions ask for the missing dimension", () => {
  const access = haveModelAccess();

  it("has model access", () => {
    expect(access, "Set ANTHROPIC_API_KEY (env or .env.local) or TEXT_AI_PROVIDER=local").toBe(true);
  });

  for (const c of CLARIFY_CASES) {
    it.skipIf(!access)(`clarify: ${c.id}`, { timeout: 90_000 }, async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      let questions: string[];
      let modelFailed = false;
      try {
        questions = await suggestClarifyingQuestions(c.description);
      } finally {
        // Read the calls BEFORE mockRestore — restoring also clears them.
        modelFailed = warn.mock.calls.some((args) => String(args[0]).includes("clarifying questions unavailable"));
        warn.mockRestore();
      }

      const problems: string[] = [];
      if (modelFailed) problems.push("the model call failed (no questions came back)");
      if (c.mustAsk && !questions.some((q) => c.mustAsk!.re.test(q))) problems.push(`never ${c.mustAsk.label}`);
      if (c.mustNotAsk && questions.some((q) => c.mustNotAsk!.re.test(q))) problems.push(`breaks: ${c.mustNotAsk.label}`);
      if (questions.some((q) => ASKS_ABOUT_BUDGET.test(q))) problems.push("asks about budget");

      rows.push({ id: c.id, ok: problems.length === 0, questions, problems });
      expect(problems, `questions were: ${JSON.stringify(questions)}`).toEqual([]);
    });
  }

  afterAll(() => {
    if (rows.length === 0) return;
    console.log(
      [
        "",
        "── CLARIFY EVAL ───────────────────────────────────",
        ...rows.map((r) => `  ${r.ok ? "PASS" : "FAIL"} ${r.id.padEnd(34)} ${r.questions.length} question(s)${r.problems.length ? ` — ${r.problems.join("; ")}` : ""}`),
        `  ${rows.filter((r) => r.ok).length}/${rows.length} cases`,
        "───────────────────────────────────────────────────",
      ].join("\n"),
    );
    const dir = process.env.EVAL_REPORT_DIR;
    if (dir) writeFileSync(resolve(dir, "clarify.json"), JSON.stringify({ suite: "clarify", rows }));
  });
});
