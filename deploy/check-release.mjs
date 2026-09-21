#!/usr/bin/env node
// Read-only configuration inventory. Never writes settings or calls providers.
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { createECDH } from "node:crypto";

export function checkRelease(env, authEnv = {}, now = Date.now()) {
  const checks = [];
  const present = (key, source = env) => {
    const value = source[key]?.trim() ?? "";
    return value.length > 0 && !/^(?:changeme|change_me|replace_me|your_.*|<.*>)$/i.test(value);
  };
  const add = (id, ok, detail) => checks.push({ id, status: ok ? "configured" : "blocked", detail });
  const requireKeys = (id, keys, source = env) => {
    const missing = keys.filter(key => !present(key, source));
    add(id, missing.length === 0, missing.length ? `Missing: ${missing.join(", ")}` : "Required settings are present; live validation pending.");
  };
  const origin = (key, expected) => {
    let valid = false;
    try {
      const url = new URL(env[key]);
      valid = url.origin === expected && ["", "/"].includes(url.pathname) && !url.search && !url.hash && !url.username && !url.password;
    } catch { /* Never echo a malformed URL, which might contain credentials. */ }
    add(key, valid, valid ? "Matches the existing production origin." : `Must match ${expected}.`);
  };
  origin("NEXT_PUBLIC_APP_URL", "https://tradies2quote.com");
  origin("NEXT_PUBLIC_SUPABASE_URL", "https://api.tradies2quote.com");
  requireKeys("database-credentials", ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"]);
  const publicKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";
  let publicRoleOK = publicKey.startsWith("sb_publishable_") && publicKey.length > 20;
  try {
    const parts = publicKey.split(".");
    const payload = JSON.parse(Buffer.from(parts[1] ?? "", "base64url").toString("utf8"));
    publicRoleOK = parts.length === 3 && parts.every(Boolean) && payload.role === "anon" &&
      (payload.exp === undefined || (Number.isFinite(payload.exp) && payload.exp * 1000 > now));
  } catch { /* Opaque publishable keys are permitted; all other formats fail. */ }
  add("public-key-role", publicRoleOK && publicKey !== env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
      "Public builds need an unexpired anon JWT or publishable key. Signature/issuer validation requires the live auth service.");
  const textProvider = env.TEXT_AI_PROVIDER?.trim().toLowerCase() || "anthropic";
  add("text-provider", ["local", "anthropic"].includes(textProvider), "Supported text routing: local or anthropic (default).");
  if (textProvider === "local") {
    requireKeys("local-text-ai", ["LOCAL_LLM_BASE_URL", "LOCAL_LLM_API_KEY", "LOCAL_LLM_MODEL"]);
    let valid = false;
    try {
      const url = new URL(env.LOCAL_LLM_BASE_URL);
      valid = ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash;
    } catch { /* No secret values in diagnostics. */ }
    add("local-text-url", valid, "Needs an HTTP(S) OpenAI-compatible endpoint; model and structured-output support must be exercised.");
    for (const key of ["LOCAL_LLM_TIMEOUT_MS", "LOCAL_LLM_MAX_TOKENS"]) {
      const n = Number(env[key]);
      add(key, !present(key) || (Number.isSafeInteger(n) && n > 0), "If set, must be a positive safe integer.");
    }
  }
  // Some plan routes call Anthropic directly, while photo-plan and transcription
  // call OpenAI. A working local text model cannot satisfy either dependency.
  requireKeys("plans-and-anthropic-agents", ["ANTHROPIC_API_KEY"]);
  requireKeys("voice-and-photo-agents", ["OPENAI_API_KEY"]);
  requireKeys("commercial-weather", ["OPEN_METEO_API_KEY"]);
  add("client-plan-reader", env.PLAN_READER_ENABLED === "true", "PLAN_READER_ENABLED=true is required for clients; enable only after representative plan evaluations pass.");
  requireKeys("quote-invoice-email", ["RESEND_API_KEY", "RESEND_FROM_EMAIL"]);
  const email = env.RESEND_FROM_EMAIL?.trim() ?? "";
  add("email-sender", /^(?:[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+|[^<>\r\n]+<[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+>)$/.test(email), "Sender address must be valid and its domain verified by Resend.");
  requireKeys("auth-email", ["GOTRUE_SMTP_HOST", "GOTRUE_SMTP_PORT", "GOTRUE_SMTP_USER", "GOTRUE_SMTP_PASS", "GOTRUE_SMTP_ADMIN_EMAIL"], authEnv);
  add("auth-email-port", /^\d+$/.test(authEnv.GOTRUE_SMTP_PORT ?? "") && Number(authEnv.GOTRUE_SMTP_PORT) > 0 && Number(authEnv.GOTRUE_SMTP_PORT) <= 65535,
      "Auth SMTP is separate from quote email; signup and password-reset delivery must both pass.");
  requireKeys("subscriptions", ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_ID"]);
  add("stripe-live-mode", /^(?:sk|rk)_live_\S+$/.test(env.STRIPE_SECRET_KEY ?? ""), "Client billing needs a live Stripe key; test-mode validation precedes release.");
  if (env.TEAM_PLANS_ENABLED === "true") requireKeys("team-billing", ["STRIPE_PRICE_CREW", "STRIPE_PRICE_BUILDER", "STRIPE_PORTAL_CONFIGURATION"]);
  requireKeys("quote-deposits", ["STRIPE_PAYMENTS_WEBHOOK_SECRET"]);
  add("client-deposits", env.PAYMENTS_ENABLED === "true", "PAYMENTS_ENABLED=true is required for client deposits after Connect/webhook acceptance tests.");
  requireKeys("sms", ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER"]);
  requireKeys("scheduled-jobs", ["CRON_SECRET"]);
  add("cron-secret-strength", (env.CRON_SECRET?.length ?? 0) >= 32, "Use at least 32 characters for the cron bearer secret; verify the server timers separately.");
  requireKeys("web-push", ["VAPID_PRIVATE_KEY"]);
  // Match src/lib/push.ts's precedence and legacy public key. Do not generate
  // or replace a pair: doing so would invalidate existing subscriptions.
  const vapidPublic = env.VAPID_PUBLIC_KEY || env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "BMh1wyMbQoDS3zhC02ejkeknqX3v6wtZiN7ewUsaBjggVnPqHdDNKarEkcsQrvuPZI3tPFNQ-AvIWFfsfqfePLI";
  let vapidOK = false;
  try {
    const pair = createECDH("prime256v1");
    pair.setPrivateKey(Buffer.from(env.VAPID_PRIVATE_KEY ?? "", "base64url"));
    vapidOK = pair.getPublicKey().equals(Buffer.from(vapidPublic, "base64url"));
  } catch { /* Never echo a private key or crypto error. */ }
  add("web-push-key-pair", vapidOK, "VAPID public and private keys must form the same P-256 pair; preserve existing subscriptions.");
  return {
    configurationReady: checks.every(check => check.status === "configured"),
    checks,
    notVerified: ["Provider credentials/entitlements and model capabilities", "Auth email and customer message delivery", "Database backup, repair and owner isolation", "Native quote handoff, private documents and website preview", "Subscription/Connect webhooks and payment flows", "Scheduled jobs and push delivery", "Current build, live health and browser/device acceptance tests", "iOS signing, archive and App Store distribution"],
  };
}

export function main(args = process.argv.slice(2)) {
  let authEnv = {};
  if (args.length) {
    if (args.length !== 2 || args[0] !== "--auth-container" || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(args[1])) {
      console.error("Usage: node --env-file=/srv/t2q/app.env deploy/check-release.mjs [--auth-container NAME]");
      return 2;
    }
    try {
      // Capture privately; only required variable names/statuses reach stdout.
      const raw = execFileSync("docker", ["inspect", "--format", "{{json .Config.Env}}", args[1]], {encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout:10000,maxBuffer:1048576});
      const values = JSON.parse(raw);
      if (!Array.isArray(values) || values.some(value => typeof value !== "string")) throw new Error();
      authEnv = Object.fromEntries(values.map(value => { const i=value.indexOf("="); return i < 0 ? [value, ""] : [value.slice(0,i), value.slice(i+1)]; }));
    } catch {
      console.error("Could not read the selected auth container. No environment values were printed.");
      return 2;
    }
  }
  const report = checkRelease(process.env, authEnv);
  console.log(JSON.stringify(report, null, 2));
  return report.configurationReady ? 0 : 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = main();
