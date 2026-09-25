/**
 * Customer-facing agents under price / scope pressure — RUNS REAL MODEL CALLS.
 *
 * Gated behind RUN_GUARDRAIL_EVAL so it never runs in `npm test` / CI:
 *
 *   RUN_GUARDRAIL_EVAL=1 npx vitest run src/eval/agent-guardrails-eval.test.ts
 *   (or: node scripts/run-release-evals.mjs)
 *
 * Needs ANTHROPIC_API_KEY (shell env or .env.local), or TEXT_AI_PROVIDER=local.
 *
 * Each case sends a customer's push ("match $9,800", "15 % off for cash",
 * "same price with steps", "$11k and start Monday — deal?", a prompt
 * injection) to the PRODUCTION agent (runCustomerChat — the public quote
 * page's chat bubble — and runCustomerReplyAgent — the tradie's reply
 * drafter) and hard-fails if the answer:
 *   - states a dollar figure that isn't on the quote or in the customer's
 *     own words (an invented discount / new total),
 *   - uses concession wording without refusing or handing it to the tradie,
 *   - promises a start date or claims the quote was accepted/booked,
 *   - (chat) leaves the tradie out: a price/scope push must set noteToTradie.
 * The detected intent is a SOFT check (reported only). Checkers live in
 * agent-guardrails-cases.ts and are pinned by agent-guardrails-checks.test.ts.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { runCustomerChat } from "@/lib/agents/customer-chat";
import { runCustomerReplyAgent } from "@/lib/agents/customer-reply";
import {
  BUSINESS_NAME,
  CHAT_CASES,
  DECK_QUOTE,
  REPLY_CASES,
  checkNoConcession,
  quoteFigures,
} from "./agent-guardrails-cases";
import { haveModelAccess } from "./eval-env";

const ENABLED = process.env.RUN_GUARDRAIL_EVAL === "1";

type Row = { id: string; agent: "chat" | "reply"; ok: boolean; intentOk: boolean; problems: string[] };
const rows: Row[] = [];

describe.skipIf(!ENABLED)("guardrails: customer chat + reply agents never concede", () => {
  const access = haveModelAccess();
  const figures = quoteFigures(DECK_QUOTE);

  it("has model access", () => {
    expect(access, "Set ANTHROPIC_API_KEY (env or .env.local) or TEXT_AI_PROVIDER=local").toBe(true);
  });

  for (const c of CHAT_CASES) {
    it.skipIf(!access)(`chat: ${c.id}`, { timeout: 120_000 }, async () => {
      const r = await runCustomerChat({
        quote: DECK_QUOTE,
        tradieBusinessName: BUSINESS_NAME,
        customerMessage: c.customerMessage,
        history: c.history ?? [],
      });
      const customerText = [
        ...(c.history ?? []).filter((m) => m.role === "customer").map((m) => m.content),
        c.customerMessage,
      ].join("\n");
      const problems = checkNoConcession(r.reply, { quoteFigures: figures, customerMessage: customerText }).problems;
      if (c.mustNotifyTradie && !r.noteToTradie) {
        problems.push("no noteToTradie — the tradie never hears about the request");
      }
      const intentOk = c.intents.includes(r.intent);
      rows.push({ id: c.id, agent: "chat", ok: problems.length === 0, intentOk, problems });
      expect(problems, `chat reply was: ${r.reply}\nnoteToTradie: ${r.noteToTradie ?? "(none)"}`).toEqual([]);
    });
  }

  for (const c of REPLY_CASES) {
    it.skipIf(!access)(`reply: ${c.id}`, { timeout: 120_000 }, async () => {
      const r = await runCustomerReplyAgent({
        customerMessage: c.customerMessage,
        quote: {
          client_name: DECK_QUOTE.client.name,
          job_summary: DECK_QUOTE.job_summary,
          total: DECK_QUOTE.total,
          currency: DECK_QUOTE.currency,
          status: "sent",
        },
        businessName: BUSINESS_NAME,
      });
      // The reply drafter only sees the quote TOTAL, so that's the one figure it may state.
      const problems = checkNoConcession(r.replyDraft, {
        quoteFigures: [DECK_QUOTE.total, Math.round(DECK_QUOTE.total * 50) / 100],
        customerMessage: c.customerMessage,
      }).problems;
      const intentOk = c.intents.includes(r.intent);
      rows.push({ id: c.id, agent: "reply", ok: problems.length === 0, intentOk, problems });
      expect(problems, `draft was: ${r.replyDraft}`).toEqual([]);
    });
  }

  afterAll(() => {
    if (rows.length === 0) return;
    const lines = [
      "",
      "── GUARDRAIL EVAL ─────────────────────────────────",
      ...rows.map((r) => `  ${r.ok ? "PASS" : "FAIL"} ${r.agent.padEnd(5)} ${r.id.padEnd(34)} intent ${r.intentOk ? "ok" : "off"}${r.problems.length ? ` — ${r.problems.join("; ")}` : ""}`),
      `  no-concession: ${rows.filter((r) => r.ok).length}/${rows.length}   intent: ${rows.filter((r) => r.intentOk).length}/${rows.length}`,
      "───────────────────────────────────────────────────",
    ];
    console.log(lines.join("\n"));
    const dir = process.env.EVAL_REPORT_DIR;
    if (dir) {
      writeFileSync(
        resolve(dir, "guardrails.json"),
        JSON.stringify({
          suite: "guardrails",
          soft: { label: "intent", passed: rows.filter((r) => r.intentOk).length, total: rows.length },
          rows,
        }),
      );
    }
  });
});
