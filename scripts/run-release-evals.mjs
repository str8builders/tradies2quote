#!/usr/bin/env node
/**
 * Release evals — the "proof before every release" run.
 *
 * Runs the deterministic golden jobs, then every opt-in AI eval suite, and
 * prints a one-page pass/fail summary against each suite's threshold. Meant
 * for the server, with the production model key, before a release:
 *
 *   node scripts/run-release-evals.mjs                       # everything
 *   node scripts/run-release-evals.mjs --env-file /srv/t2q/app.env
 *   node scripts/run-release-evals.mjs --only golden,guardrails
 *   node scripts/run-release-evals.mjs --min clarify=0.6 --json /tmp/evals.json
 *   node scripts/run-release-evals.mjs --list                # show suites, run nothing
 *
 * Options
 *   --only a,b        run only these suite ids
 *   --skip a,b        leave these suites out
 *   --min id=0.9      override a suite's pass threshold (0–1)
 *   --env-file PATH   read the MODEL settings (and only those) from an env
 *                     file: ANTHROPIC_API_KEY, OPENAI_API_KEY, TEXT_AI_PROVIDER,
 *                     LOCAL_LLM_* — database/Stripe/other secrets are ignored
 *   --json PATH       also write the summary as JSON
 *   --verbose         print each suite's (scrubbed) test output
 *   --timeout-min N   per-suite timeout in minutes (default 30)
 *   --config PATH     vitest config to run the suites with (default: the repo's)
 *
 * Model access comes from the environment, `--env-file`, or `.env.local`
 * (the eval files read `.env.local` themselves). The key is NEVER printed:
 * the summary only says whether one is present, and every line of child
 * output that reaches the terminal is scrubbed of the key value and of
 * anything shaped like an API key.
 *
 * Exit code: 0 when every gate passes, 1 when any suite is below its
 * threshold (or couldn't run), 2 on a usage error.
 *
 * Needs the dev dependencies (vitest). It spends real model tokens — each
 * AI suite makes one or two model calls per case (~40 calls in total).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Each suite: its vitest file, the env flag that opens its gate, and the
 * minimum pass rate (passed ÷ run, skipped cases excluded). `optional`
 * suites need fixtures that may not be on the box (drawings) — if every
 * case skips they are reported, not failed. A suite with a `feature` flag
 * only gates the release when that feature is on (the flag is "true" in the
 * environment or the --env-file); while it's off a failure is reported as
 * INFO — e.g. the plan reader, which stays off until its hand-labelled plan
 * sheets exist (src/lib/planreader/flag.ts).
 */
const SUITES = [
  {
    id: "golden",
    title: "Golden jobs — quantities + money, exact",
    file: "src/eval/golden/golden-jobs.test.ts",
    env: {},
    min: 1,
    needsModel: false,
  },
  {
    id: "guardrails",
    title: "Chat + reply agents never concede price/scope",
    file: "src/eval/agent-guardrails-eval.test.ts",
    env: { RUN_GUARDRAIL_EVAL: "1" },
    min: 1,
    needsModel: true,
  },
  {
    id: "clarify",
    title: "Clarifying questions ask for missing sizes",
    file: "src/eval/clarify-questions-eval.test.ts",
    env: { RUN_CLARIFY_EVAL: "1" },
    min: 0.8,
    needsModel: true,
  },
  {
    id: "quote",
    title: "Quote generation: structure, maths, stated numbers",
    file: "src/eval/quote-eval.test.ts",
    env: { RUN_QUOTE_EVAL: "1" },
    min: 0.8,
    needsModel: true,
  },
  {
    id: "quote-agent",
    title: "Quote agent output reconciles",
    file: "src/eval/quote-agent-eval.test.ts",
    env: { RUN_QUOTE_AGENT_EVAL: "1" },
    min: 0.75,
    needsModel: true,
  },
  {
    id: "scan",
    title: "Drawing scan reads shapes",
    file: "src/eval/scan-eval.test.ts",
    env: { RUN_SCAN_EVAL: "1" },
    min: 0.75,
    needsModel: true,
    optional: true,
  },
  {
    id: "supplier",
    title: "Supplier quotes read exactly (net prices, freight, GST, PDF)",
    file: "src/eval/supplier-quote-eval.test.ts",
    env: { RUN_SUPPLIER_EVAL: "1" },
    min: 1,
    needsModel: true,
  },
  {
    id: "plans",
    title: "Plan reader classifies + extracts",
    file: "src/eval/plan-reader-eval.test.ts",
    env: { RUN_PLAN_EVAL: "1" },
    min: 0.75,
    needsModel: true,
    optional: true,
    feature: "PLAN_READER_ENABLED",
  },
];

/** Model settings an --env-file may contribute. Nothing else is read. */
const MODEL_ENV_ALLOWLIST = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "TEXT_AI_PROVIDER",
  "LOCAL_LLM_API_KEY",
  "LOCAL_LLM_BASE_URL",
  "LOCAL_LLM_MAX_TOKENS",
  "LOCAL_LLM_MODEL",
  "LOCAL_LLM_TIMEOUT_MS",
];

/** Feature flags an --env-file may contribute (never secrets): they decide which suites gate. */
const FEATURE_ENV_ALLOWLIST = ["PLAN_READER_ENABLED"];

// ── Arguments ────────────────────────────────────────────────────────────

function usage(message) {
  console.error(`run-release-evals: ${message}\nSee the header of scripts/run-release-evals.mjs for usage.`);
  process.exit(2);
}

function parseArgs(argv) {
  const opts = { only: null, skip: new Set(), min: {}, envFile: null, json: null, verbose: false, list: false, timeoutMin: 30, config: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) usage(`${a} needs a value`);
      return v;
    };
    if (a === "--only") opts.only = new Set(next().split(",").map((s) => s.trim()).filter(Boolean));
    else if (a === "--skip") for (const s of next().split(",")) opts.skip.add(s.trim());
    else if (a === "--min") {
      const [id, v] = next().split("=");
      const n = Number(v);
      if (!id || !(n >= 0 && n <= 1)) usage("--min takes id=fraction, e.g. --min clarify=0.6");
      opts.min[id] = n;
    } else if (a === "--env-file") opts.envFile = next();
    else if (a === "--json") opts.json = next();
    else if (a === "--timeout-min") opts.timeoutMin = Number(next()) || 30;
    else if (a === "--config") opts.config = next();
    else if (a === "--verbose") opts.verbose = true;
    else if (a === "--list") opts.list = true;
    else if (a === "--help" || a === "-h") usage("help");
    else usage(`unknown option ${a}`);
  }
  const known = new Set(SUITES.map((s) => s.id));
  for (const id of [...(opts.only ?? []), ...opts.skip, ...Object.keys(opts.min)]) {
    if (!known.has(id)) usage(`unknown suite "${id}" (suites: ${[...known].join(", ")})`);
  }
  return opts;
}

// ── Secrets: read, never print ───────────────────────────────────────────

/** KEY=VALUE lines → object (comments / blanks ignored, quotes stripped). */
function readEnvFile(path) {
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

function buildChildEnv(opts) {
  const env = { ...process.env };
  const features = Object.fromEntries(FEATURE_ENV_ALLOWLIST.map((k) => [k, process.env[k] ?? ""]));
  let keySource = env.ANTHROPIC_API_KEY ? "shell environment" : null;
  if (opts.envFile) {
    if (!existsSync(opts.envFile)) usage(`--env-file ${opts.envFile} not found`);
    const fromFile = readEnvFile(opts.envFile);
    for (const k of MODEL_ENV_ALLOWLIST) if (fromFile[k]) env[k] = fromFile[k];
    for (const k of FEATURE_ENV_ALLOWLIST) if (fromFile[k] !== undefined) features[k] = fromFile[k];
    if (fromFile.ANTHROPIC_API_KEY) keySource = `--env-file (${opts.envFile})`;
  }
  if (!env.ANTHROPIC_API_KEY) {
    const local = join(ROOT, ".env.local");
    if (existsSync(local)) {
      const v = readEnvFile(local).ANTHROPIC_API_KEY;
      if (v) {
        env.ANTHROPIC_API_KEY = v;
        keySource = ".env.local";
      }
    }
  }
  return { env, keySource, features };
}

function makeScrubber(env) {
  const secrets = MODEL_ENV_ALLOWLIST.filter((k) => /KEY/.test(k))
    .map((k) => env[k])
    .filter((v) => typeof v === "string" && v.length >= 8);
  return (text) => {
    let s = String(text ?? "");
    for (const v of secrets) s = s.split(v).join("[redacted]");
    return s
      .replace(/sk-ant-[A-Za-z0-9_-]{6,}/g, "[redacted]")
      .replace(/\bsk-[A-Za-z0-9_-]{16,}/g, "[redacted]")
      .replace(/((?:x-api-key|api[_-]?key|authorization)["']?\s*[:=]\s*["']?)[^\s"',}]+/gi, "$1[redacted]");
  };
}

// ── Running one suite ────────────────────────────────────────────────────

function runSuite(suite, ctx) {
  // Not "<id>.json": the eval files write their own <id>.json soft reports here.
  const outFile = join(ctx.work, `vitest-${suite.id}.json`);
  const started = Date.now();
  const r = spawnSync(
    process.execPath,
    [ctx.vitest, "run", suite.file, "--reporter=json", `--outputFile=${outFile}`, ...(ctx.config ? ["--config", ctx.config] : [])],
    {
      cwd: ROOT,
      env: { ...ctx.env, ...suite.env, EVAL_REPORT_DIR: ctx.work, FORCE_COLOR: "0" },
      encoding: "utf8",
      timeout: ctx.timeoutMs,
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  const seconds = Math.round((Date.now() - started) / 1000);
  if (ctx.verbose) {
    process.stdout.write(`\n──── ${suite.id} output (scrubbed) ────\n${ctx.scrub(r.stdout)}${ctx.scrub(r.stderr)}\n`);
  }
  if (r.error || !existsSync(outFile)) {
    const why = r.error?.code === "ETIMEDOUT" ? "timed out" : ctx.scrub(r.error?.message ?? (r.stderr || "no results written").split("\n").find((l) => l.trim()) ?? "");
    return { suite, seconds, error: why, passed: 0, failed: 0, skipped: 0, failures: [], knownOpen: 0, knownFixed: [] };
  }
  const report = JSON.parse(readFileSync(outFile, "utf8"));
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let knownOpen = 0;
  const knownFixed = [];
  const failures = [];
  for (const file of report.testResults ?? []) {
    // A file that failed to load has no assertions but a message.
    if ((file.assertionResults ?? []).length === 0 && file.status === "failed") {
      failed++;
      failures.push({ name: file.name?.replace(`${ROOT}/`, "") ?? suite.file, message: ctx.scrub(file.message ?? "suite failed to load") });
    }
    for (const t of file.assertionResults ?? []) {
      const name = t.fullName ?? t.title;
      const knownBug = /KNOWN BUG:/.test(name);
      if (t.status === "passed") {
        passed++;
        if (knownBug) knownOpen++;
      } else if (t.status === "failed") {
        failed++;
        if (knownBug) knownFixed.push(name);
        failures.push({ name: ctx.scrub(name), message: ctx.scrub((t.failureMessages ?? []).join("\n")) });
      } else skipped++;
    }
  }
  return { suite, seconds, error: null, passed, failed, skipped, failures, knownOpen, knownFixed };
}

/** The guardrail suite writes its soft (intent) score into the work dir. */
function softNote(suiteId, work) {
  if (suiteId !== "guardrails") return "";
  const file = join(work, "guardrails.json");
  if (!existsSync(file)) return "";
  try {
    const j = JSON.parse(readFileSync(file, "utf8"));
    return j.soft ? `${j.soft.label} ${j.soft.passed}/${j.soft.total} (soft)` : "";
  } catch {
    return "";
  }
}

// ── Main ─────────────────────────────────────────────────────────────────

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const selected = SUITES.filter((s) => (!opts.only || opts.only.has(s.id)) && !opts.skip.has(s.id));

  if (opts.list) {
    for (const s of SUITES) {
      console.log(`${s.id.padEnd(12)} min ${String(Math.round((opts.min[s.id] ?? s.min) * 100)).padStart(3)}%  ${s.optional ? "(optional) " : ""}${s.title}  [${s.file}]`);
    }
    return;
  }

  const vitest = join(ROOT, "node_modules", "vitest", "vitest.mjs");
  if (!existsSync(vitest)) {
    console.error("run-release-evals: vitest isn't installed here — install the dev dependencies (npm ci) first.");
    process.exit(1);
  }

  const { env, keySource, features } = buildChildEnv(opts);
  const scrub = makeScrubber(env);
  const provider = (env.TEXT_AI_PROVIDER ?? "").trim().toLowerCase() === "local" ? "local model (TEXT_AI_PROVIDER=local)" : "Anthropic";
  const haveModel = Boolean(env.ANTHROPIC_API_KEY) || provider.startsWith("local");
  const work = mkdtempSync(join(tmpdir(), "t2q-release-evals-"));
  const ctx = { vitest, env, scrub, work, verbose: opts.verbose, timeoutMs: opts.timeoutMin * 60_000, config: opts.config };

  const git = (args) => {
    const r = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
    return r.status === 0 ? r.stdout.trim() : "?";
  };
  const started = new Date();
  const results = [];
  try {
    for (const suite of selected) {
      process.stderr.write(`… ${suite.id} (${suite.file})\n`);
      if (suite.needsModel && !haveModel) {
        results.push({ suite, seconds: 0, error: "no model access (no ANTHROPIC_API_KEY, TEXT_AI_PROVIDER not local)", passed: 0, failed: 0, skipped: 0, failures: [], knownOpen: 0, knownFixed: [] });
        continue;
      }
      const r = runSuite(suite, ctx);
      r.soft = softNote(suite.id, work);
      results.push(r);
    }
  } finally {
    // work dir holds raw reports (replies, questions) — no key, but tidy up.
    rmSync(work, { recursive: true, force: true });
  }

  // ── Verdicts ──
  const rows = results.map((r) => {
    const min = opts.min[r.suite.id] ?? r.suite.min;
    const run = r.passed + r.failed;
    const rate = run > 0 ? r.passed / run : 0;
    let verdict;
    if (r.error) verdict = r.suite.optional ? "SKIP" : "FAIL";
    else if (run === 0) verdict = r.suite.optional ? "SKIP" : "FAIL";
    else verdict = rate + 1e-9 >= min ? "PASS" : "FAIL";
    let note = r.error ?? "";
    if (!r.error && run === 0) note = r.suite.optional ? "every case skipped (fixtures not on this box)" : "every case skipped";
    if (r.suite.id === "golden" && !r.error) {
      note = `${r.knownOpen} known-bug figures still open` + (r.knownFixed.length ? `; ${r.knownFixed.length} FIXED — flip it.fails → it` : "");
    }
    if (r.soft) note = [note, r.soft].filter(Boolean).join("; ");
    if (verdict === "FAIL" && r.suite.feature && features[r.suite.feature] !== "true") {
      verdict = "INFO";
      note = [note, `${r.suite.feature} is off — reported, not gated`].filter(Boolean).join("; ");
    }
    return { ...r, min, run, rate, verdict, note };
  });
  const gateFailed = rows.filter((r) => r.verdict === "FAIL");

  // ── One-page summary ──
  const pct = (x) => `${Math.round(x * 100)}%`;
  const line = "─".repeat(96);
  const out = [];
  out.push(`T2Q RELEASE EVALS — ${started.toISOString()} — ${git(["rev-parse", "--short", "HEAD"])} (${git(["rev-parse", "--abbrev-ref", "HEAD"])})`);
  out.push(`Model: ${provider}; Anthropic key ${keySource ? `present (from ${keySource})` : "NOT present"}`);
  out.push(line);
  out.push(`${"Suite".padEnd(12)} ${"Result".padEnd(6)} ${"Passed/Run".padStart(11)} ${"Rate".padStart(5)} ${"Min".padStart(5)} ${"Secs".padStart(5)}  Notes`);
  for (const r of rows) {
    out.push(
      `${r.suite.id.padEnd(12)} ${r.verdict.padEnd(6)} ${`${r.passed}/${r.run}`.padStart(11)} ${(r.run ? pct(r.rate) : "-").padStart(5)} ${pct(r.min).padStart(5)} ${String(r.seconds).padStart(5)}  ${r.note}`,
    );
  }
  out.push(line);
  const shownFailures = rows.flatMap((r) => r.failures.map((f) => ({ suite: r.suite.id, ...f }))).slice(0, 12);
  if (shownFailures.length) {
    out.push("Failures (first line each):");
    for (const f of shownFailures) {
      const first = (f.message.split("\n").find((l) => l.trim()) ?? "").trim().slice(0, 150);
      out.push(`  ${f.suite} › ${f.name.slice(0, 90)}`);
      if (first) out.push(`      ${first}`);
    }
    const more = rows.reduce((n, r) => n + r.failures.length, 0) - shownFailures.length;
    if (more > 0) out.push(`  … and ${more} more (re-run with --verbose)`);
    out.push(line);
  }
  out.push(
    gateFailed.length === 0
      ? "RELEASE GATE: PASS"
      : `RELEASE GATE: FAIL — ${gateFailed.map((r) => r.suite.id).join(", ")} below threshold or not run`,
  );
  console.log(out.join("\n"));

  if (opts.json) {
    writeFileSync(
      opts.json,
      JSON.stringify(
        {
          started: started.toISOString(),
          commit: git(["rev-parse", "HEAD"]),
          model: provider,
          anthropicKeyPresent: Boolean(keySource),
          gate: gateFailed.length === 0 ? "pass" : "fail",
          suites: rows.map((r) => ({
            id: r.suite.id,
            verdict: r.verdict,
            passed: r.passed,
            failed: r.failed,
            skipped: r.skipped,
            rate: r.rate,
            min: r.min,
            seconds: r.seconds,
            note: r.note,
            failures: r.failures.map((f) => ({ name: f.name, message: f.message.slice(0, 2000) })),
          })),
        },
        null,
        2,
      ),
    );
  }
  process.exitCode = gateFailed.length === 0 ? 0 : 1;
}

main();
