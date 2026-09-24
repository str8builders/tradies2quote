/**
 * Drawing-scan eval — RUNS A REAL CLAUDE VISION CALL per case.
 *
 * Gated behind RUN_SCAN_EVAL so it never runs during `npm test` or CI
 * (it costs money and is non-deterministic). Run it deliberately:
 *
 *   npm run eval:scan
 *
 * It pulls ANTHROPIC_API_KEY from the shell env or `.env.local`, builds the
 * REAL system prompt (the exact one the /api/quotes/scan-drawing route uses),
 * sends each fixture drawing to Claude, runs the model's plan through the same
 * `sanitisePlan` + deterministic geometry the app uses, and scores:
 *
 *   - shape match      (did it read rect / l_shape / triangle / circle / line)
 *   - area within tol  (did the COMPUTED area land near the hand-measured truth)
 *   - perimeter (opt)  (fences / slabs)
 *
 * Cases whose image file is missing are skipped, so you can grow
 * src/eval/scan-cases.ts ahead of the photos. Drop drawings into
 * src/eval/fixtures/drawings/ and re-run.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  MODEL,
  buildSystemPrompt,
  sanitisePlan,
  type ScannedPlan,
} from "@/lib/scan-drawing";
import { SCAN_CASES, type ScanCase } from "./scan-cases";

const ENABLED = process.env.RUN_SCAN_EVAL === "1";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const DRAWINGS_DIR = resolve(process.cwd(), "src/eval/fixtures/drawings");

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
    // no .env.local — fine.
  }
  return null;
}

function mediaTypeFor(file: string): string {
  const ext = file.toLowerCase().split(".").pop() ?? "";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/jpeg";
}

function withinPct(actual: number, expected: number, tolPct: number): boolean {
  if (expected === 0) return Math.abs(actual) < 0.01;
  return Math.abs(actual - expected) / expected <= tolPct / 100;
}

function shapeMatches(actual: string, expect: ScanCase["expect"]): boolean {
  const allowed = Array.isArray(expect.shape) ? expect.shape : [expect.shape];
  return allowed.includes(actual as (typeof allowed)[number]);
}

type CaseResult = {
  id: string;
  ran: boolean;
  shapeOk: boolean;
  areaOk: boolean;
  perimeterOk: boolean | null;
  read: string;
};

const results: CaseResult[] = [];

async function callVision(
  apiKey: string,
  c: ScanCase,
  base64: string,
  mediaType: string,
): Promise<ScannedPlan | null> {
  const timberLength = c.timberLength ?? 6;
  const userText = [
    `Job type: ${c.jobType}. Tradie buys timber in ${timberLength}m lengths and wants a 10% waste factor.`,
    c.hint ? `Tradie note about this drawing: ${c.hint}` : "",
    "Read every annotation on this hand-drawn plan and return the JSON described in the system prompt.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      system: buildSystemPrompt(c.jobType, timberLength),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: base64 },
            },
            { type: "text", text: userText },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const payload = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const text = payload.content?.find((p) => p.type === "text")?.text ?? "";
  const json = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  const parsed = JSON.parse(json) as { plan?: unknown };
  return sanitisePlan(parsed.plan);
}

describe.skipIf(!ENABLED)("drawing-scan shape-reading eval", () => {
  const apiKey = resolveApiKey();

  it("has an API key", () => {
    expect(
      apiKey,
      "Set ANTHROPIC_API_KEY in the env or .env.local to run the scan eval.",
    ).toBeTruthy();
  });

  for (const c of SCAN_CASES) {
    const imgPath = resolve(DRAWINGS_DIR, c.image);
    const present = existsSync(imgPath);

    it.skipIf(!present || !apiKey)(
      `${c.id} — ${c.notes ?? c.jobType}`,
      async () => {
        const buf = readFileSync(imgPath);
        const plan = await callVision(
          apiKey as string,
          c,
          buf.toString("base64"),
          mediaTypeFor(c.image),
        );

        const shapeOk = !!plan && shapeMatches(plan.shape, c.expect);
        // A line (fence, boundary run) has no area: the pipeline reports none,
        // which is the right answer when the case expects 0 m².
        const areaOk =
          !!plan &&
          (c.expect.area_m2 === 0
            ? plan.area_m2 == null || plan.area_m2 === 0
            : plan.area_m2 != null &&
              withinPct(plan.area_m2, c.expect.area_m2, c.expect.areaTolerancePct ?? 10));
        let perimeterOk: boolean | null = null;
        if (c.expect.perimeter_m != null) {
          perimeterOk =
            !!plan &&
            plan.perimeter_m != null &&
            withinPct(
              plan.perimeter_m,
              c.expect.perimeter_m,
              c.expect.perimeterTolerancePct ?? 10,
            );
        }

        results.push({
          id: c.id,
          ran: true,
          shapeOk,
          areaOk,
          perimeterOk,
          read: plan
            ? `shape=${plan.shape} area=${plan.area_m2 ?? "—"}m² perim=${plan.perimeter_m ?? "—"}m`
            : "no plan",
        });

        // Shape + area are the headline metrics — assert them so a regression
        // fails the run, while the console summary shows the full breakdown.
        expect(shapeOk, `shape misread (${results.at(-1)?.read})`).toBe(true);
        expect(areaOk, `area out of tolerance (${results.at(-1)?.read})`).toBe(true);
        if (perimeterOk !== null) {
          expect(perimeterOk, `perimeter out of tolerance (${results.at(-1)?.read})`).toBe(true);
        }
      },
      120_000,
    );
  }

  afterAll(() => {
    if (results.length === 0) return;
    const pct = (n: number) => `${Math.round((n / results.length) * 100)}%`;
    const shape = results.filter((r) => r.shapeOk).length;
    const area = results.filter((r) => r.areaOk).length;
    const perimEval = results.filter((r) => r.perimeterOk !== null);
    const perim = perimEval.filter((r) => r.perimeterOk).length;

    console.log(
      [
        "",
        "── DRAWING-SCAN EVAL ─────────────────────────────",
        ...results.map(
          (r) =>
            `  ${r.shapeOk && r.areaOk && r.perimeterOk !== false ? "✅" : "❌"} ${r.id.padEnd(22)} ${r.read}`,
        ),
        "──────────────────────────────────────────────────",
        `  shape:     ${shape}/${results.length} (${pct(shape)})`,
        `  area:      ${area}/${results.length} (${pct(area)})`,
        perimEval.length
          ? `  perimeter: ${perim}/${perimEval.length}`
          : "  perimeter: (none tested)",
        "──────────────────────────────────────────────────",
        "",
      ].join("\n"),
    );
  });
});
