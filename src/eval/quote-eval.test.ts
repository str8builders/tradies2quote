/**
 * Quote-generation eval — RUNS A REAL CLAUDE CALL per case.
 *
 * Gated behind RUN_QUOTE_EVAL so it never runs during `npm test` or CI
 * (it costs money and is non-deterministic). Run it deliberately:
 *
 *   npm run eval:quotes
 *
 * It pulls ANTHROPIC_API_KEY from the shell env or `.env.local`, builds
 * the REAL system prompt via buildQuotePrompt for each case, sends the
 * job description to Claude, parses the quote JSON, and scores it
 * against the universal checks + the case's own checks. The console
 * output is a per-case pass list + an overall score you can watch move
 * when you change a prompt.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { buildQuotePrompt } from "@/lib/quote-prompt";
import { parseModelJsonObject } from "@/lib/modelJson";
import { aiModel } from "@/lib/ai/models";
import type {
  LibraryMaterial,
  QuoteData,
  QuoteProfile,
} from "@/lib/quote-types";
import {
  QUOTE_EVAL_CASES,
  TEST_LIBRARY,
  TEST_PROFILE,
  universalChecks,
  type QuoteCheck,
} from "./quote-cases";

const ENABLED = process.env.RUN_QUOTE_EVAL === "1";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
// The same model the pipeline uses (src/lib/ai/models.ts, role "quote").
const MODEL = aiModel("quote");

/** Pull ANTHROPIC_API_KEY from the shell env, falling back to `.env.local`. */
function resolveApiKey(): string | null {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  try {
    const envFile = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of envFile.split(/\r?\n/)) {
      const m = line.match(/^\s*ANTHROPIC_API_KEY\s*=\s*(.+?)\s*$/);
      if (m) return m[1].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* no .env.local — fine */
  }
  return null;
}

/** Build the real prompt, call Claude, parse the quote JSON. */
async function generateQuote(
  apiKey: string,
  description: string,
  profile: QuoteProfile,
  library: LibraryMaterial[],
): Promise<QuoteData> {
  const system = buildQuotePrompt(profile, library);
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    // Mirrors /api/quotes/generate: Sonnet 5 rejects non-default
    // `temperature` and assistant prefills, so neither is sent.
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8192,
      system,
      messages: [
        {
          role: "user",
          content: `Job description from voice memo or typed input:\n\n${description}`,
        },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(
      `Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`,
    );
  }
  const payload = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const text = payload.content?.find((c) => c.type === "text")?.text ?? "";
  return parseModelJsonObject<QuoteData>(text);
}

/** Per-case score tally for the final summary line. */
const scoreboard: Array<{ id: string; passed: number; total: number }> = [];

/**
 * Full human-readable report, mirrored to disk. Vitest 4 buffers test
 * console.log output in a way that's easy to lose behind pipes and
 * reporters, so the report is ALSO written to a file you can always
 * open after a run: quote-eval-report.txt in the repo root.
 */
const REPORT_PATH = resolve(process.cwd(), "quote-eval-report.txt");
const reportLines: string[] = [];
function emit(line: string): void {
  reportLines.push(line);
  console.log(line);
}

describe.skipIf(!ENABLED)("quote-generation eval", () => {
  const apiKey = resolveApiKey();

  for (const evalCase of QUOTE_EVAL_CASES) {
    it(`case: ${evalCase.id}`, { timeout: 90_000 }, async () => {
      if (!apiKey) {
        throw new Error(
          "ANTHROPIC_API_KEY not set — add it to your shell env or .env.local",
        );
      }
      const profile = evalCase.profile ?? TEST_PROFILE;
      const library = evalCase.library ?? TEST_LIBRARY;
      const quote = await generateQuote(
        apiKey,
        evalCase.description,
        profile,
        library,
      );

      const universal = universalChecks(profile);
      const checks: QuoteCheck[] = [...universal, ...evalCase.checks];
      const results = checks.map((c) => {
        let ok = false;
        try {
          ok = c.pass(quote);
        } catch {
          ok = false;
        }
        return { label: c.label, ok };
      });

      const passed = results.filter((r) => r.ok).length;
      scoreboard.push({ id: evalCase.id, passed, total: results.length });

      // Human-readable per-case report in the test output.
      const report = results
        .map((r) => `    ${r.ok ? "PASS" : "FAIL"}  ${r.label}`)
        .join("\n");
      emit(
        `\n  [${evalCase.id}] ${passed}/${results.length} checks passed\n${report}\n`,
      );

      // Hard-fail the case ONLY if a universal (structural / maths)
      // check broke — those are non-negotiable. The per-case quality
      // checks are reported but don't hard-fail, so the eval always
      // completes and shows the full picture.
      const universalPassed = results
        .slice(0, universal.length)
        .filter((r) => r.ok).length;
      expect(
        universalPassed,
        `${evalCase.id}: every structural/maths check must pass`,
      ).toBe(universal.length);
    });
  }

  afterAll(() => {
    if (scoreboard.length === 0) return;
    const totalPassed = scoreboard.reduce((s, c) => s + c.passed, 0);
    const totalChecks = scoreboard.reduce((s, c) => s + c.total, 0);
    const pct =
      totalChecks > 0 ? Math.round((totalPassed / totalChecks) * 100) : 0;
    emit(
      `\n  ===== QUOTE EVAL SCORE: ${totalPassed}/${totalChecks} (${pct}%) =====`,
    );
    for (const c of scoreboard) {
      emit(`    ${c.id}: ${c.passed}/${c.total}`);
    }
    emit("");
    try {
      writeFileSync(REPORT_PATH, reportLines.join("\n") + "\n", "utf8");
      console.log(`  Full report written to ${REPORT_PATH}`);
    } catch {
      /* non-fatal — the console output above is the source of truth */
    }
  });
});
