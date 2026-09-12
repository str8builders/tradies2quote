import test from "node:test";
import assert from "node:assert/strict";
import { createECDH } from "node:crypto";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { checkRelease } from "./check-release.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const jwt = claims => ["header", Buffer.from(JSON.stringify(claims)).toString("base64url"), "synthetic-signature"].join(".");
function fixture() {
  const pair = createECDH("prime256v1"); pair.generateKeys();
  return {
    env: {
      NEXT_PUBLIC_APP_URL: "https://tradies2quote.com", NEXT_PUBLIC_SUPABASE_URL: "https://api.tradies2quote.com",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: jwt({role:"anon",exp:4102444800}), SUPABASE_SERVICE_ROLE_KEY:"synthetic-service-key",
      TEXT_AI_PROVIDER:"local", LOCAL_LLM_BASE_URL:"http://127.0.0.1:8080/v1", LOCAL_LLM_API_KEY:"synthetic-local-key", LOCAL_LLM_MODEL:"fixture-model",
      ANTHROPIC_API_KEY:"synthetic-anthropic-key", OPENAI_API_KEY:"synthetic-openai-key", PLAN_READER_ENABLED:"true",
      RESEND_API_KEY:"synthetic-resend-key", RESEND_FROM_EMAIL:"T2Q <quotes@example.invalid>",
      STRIPE_SECRET_KEY:"sk_live_synthetic", STRIPE_PRICE_ID:"price_synthetic", STRIPE_WEBHOOK_SECRET:"whsec_synthetic",
      STRIPE_PAYMENTS_WEBHOOK_SECRET:"whsec_payments_synthetic", PAYMENTS_ENABLED:"true",
      TWILIO_ACCOUNT_SID:"synthetic-sid", TWILIO_AUTH_TOKEN:"synthetic-token", TWILIO_FROM_NUMBER:"+640000000",
      CRON_SECRET:"synthetic-cron-secret-at-least-32-characters",
      VAPID_PRIVATE_KEY:pair.getPrivateKey().toString("base64url"), VAPID_PUBLIC_KEY:pair.getPublicKey().toString("base64url"),
    },
    auth: {GOTRUE_SMTP_HOST:"mail.example.invalid", GOTRUE_SMTP_PORT:"587", GOTRUE_SMTP_USER:"synthetic-user", GOTRUE_SMTP_PASS:"synthetic-password", GOTRUE_SMTP_ADMIN_EMAIL:"auth@example.invalid"},
  };
}
const blocked = report => report.checks.filter(x => x.status === "blocked").map(x => x.id);
test("all settings can pass configuration without claiming transaction readiness", () => {
  const {env,auth}=fixture(), result=checkRelease(env,auth);
  assert.equal(result.configurationReady,true); assert.deepEqual(blocked(result),[]);
  assert.ok(result.notVerified.some(x=>x.includes("Database")));
  assert.ok(result.notVerified.some(x=>x.includes("distribution")));
});
test("every required service credential blocks release when missing", () => {
  for (const key of ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY","SUPABASE_SERVICE_ROLE_KEY","LOCAL_LLM_API_KEY","LOCAL_LLM_MODEL","ANTHROPIC_API_KEY","OPENAI_API_KEY","RESEND_API_KEY","RESEND_FROM_EMAIL","STRIPE_SECRET_KEY","STRIPE_WEBHOOK_SECRET","STRIPE_PRICE_ID","STRIPE_PAYMENTS_WEBHOOK_SECRET","TWILIO_AUTH_TOKEN","CRON_SECRET","VAPID_PRIVATE_KEY"]) {
    const {env,auth}=fixture(); delete env[key]; assert.equal(checkRelease(env,auth).configurationReady,false,key);
  }
});
test("local text configuration cannot satisfy vision or transcription", () => {
  const {env,auth}=fixture(); delete env.ANTHROPIC_API_KEY; delete env.OPENAI_API_KEY;
  const result=blocked(checkRelease(env,auth));
  assert.ok(result.includes("plans-and-anthropic-agents")); assert.ok(result.includes("voice-and-photo-agents"));
  assert.ok(!result.includes("local-text-ai"));
});
test("Resend does not imply Supabase SMTP configuration", () => {
  const {env}=fixture(); assert.ok(blocked(checkRelease(env)).includes("auth-email"));
});
test("public build refuses service-role, expired and malformed JWTs", () => {
  for (const key of [jwt({role:"service_role",exp:4102444800}),jwt({role:"anon",exp:1}),"bad-key"]) {
    const {env,auth}=fixture(); env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=key;
    assert.ok(blocked(checkRelease(env,auth)).includes("public-key-role"));
  }
});
test("test billing and disabled client flags cannot be mistaken for a full release", () => {
  const {env,auth}=fixture(); env.STRIPE_SECRET_KEY="sk_test_synthetic"; env.PLAN_READER_ENABLED="false"; delete env.PAYMENTS_ENABLED;
  const ids=blocked(checkRelease(env,auth));
  for (const id of ["stripe-live-mode","client-plan-reader","client-deposits"]) assert.ok(ids.includes(id));
});
test("diagnostics contain no secret values or malformed credential URLs", () => {
  const {env,auth}=fixture(); env.LOCAL_LLM_BASE_URL="https://user:secret@example.invalid";
  const result=JSON.stringify(checkRelease(env,auth));
  for (const key of ["SUPABASE_SERVICE_ROLE_KEY","LOCAL_LLM_API_KEY","ANTHROPIC_API_KEY","OPENAI_API_KEY","RESEND_API_KEY","STRIPE_SECRET_KEY","VAPID_PRIVATE_KEY"]) assert.ok(!result.includes(env[key]));
  assert.ok(!result.includes(auth.GOTRUE_SMTP_PASS)); assert.ok(!result.includes("user:secret"));
});
test("wrong production origin, nonpositive timeout and unpaired VAPID keys fail", () => {
  const {env,auth}=fixture(); env.NEXT_PUBLIC_APP_URL="http://localhost:3000"; env.LOCAL_LLM_TIMEOUT_MS="-1"; env.VAPID_PUBLIC_KEY=fixture().env.VAPID_PUBLIC_KEY;
  const ids=blocked(checkRelease(env,auth));
  for (const id of ["NEXT_PUBLIC_APP_URL","LOCAL_LLM_TIMEOUT_MS","web-push-key-pair"]) assert.ok(ids.includes(id));
});
test("CLI reports blocked, exits nonzero with an empty environment", () => {
  const result=spawnSync(process.execPath,[resolve(root,"deploy/check-release.mjs")],{env:{},encoding:"utf8"});
  assert.equal(result.status,1); assert.equal(JSON.parse(result.stdout).configurationReady,false);
});
test("invalid auth-container argument is refused before Docker execution", () => {
  const result=spawnSync(process.execPath,[resolve(root,"deploy/check-release.mjs"),"--auth-container","-secret"],{env:{},encoding:"utf8"});
  assert.equal(result.status,2); assert.match(result.stderr,/Usage:/);
});
for (const tracker of ["t","f"]) test(`migration dry-run issues SELECTs only (tracker ${tracker})`, () => {
  const dir=mkdtempSync(join(tmpdir(),"t2q-release-test-")), log=join(dir,"queries");
  try {
    // Isolated fake psql: no database, credentials or network are used.
    writeFileSync(join(dir,"psql"),`#!/bin/sh\nprintf '%s\\n' "$*" >> "$T2Q_QUERY_LOG"\ncase "$*" in *to_regclass*) printf '%s\\n' "$T2Q_TRACKER" ;; esac\n`,{mode:0o700});
    const result=spawnSync("bash",[resolve(root,"deploy/apply-migrations.sh")],{env:{...process.env,PATH:`${dir}:${process.env.PATH}`,DRY_RUN:"1",TARGET_DB_URL:"postgres://example.invalid/fixture",T2Q_QUERY_LOG:log,T2Q_TRACKER:tracker},encoding:"utf8"});
    assert.equal(result.status,0,result.stderr); assert.match(result.stdout,/DRY_RUN=1/);
    const queries=readFileSync(log,"utf8"); assert.match(queries,/select to_regclass/);
    assert.doesNotMatch(queries,/create|insert|update|delete|alter|drop/i);
    assert.equal(queries.includes("select name"),tracker==="t");
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test("restricted live keys are supported and enabled teams require their full billing configuration", () => {
  const {env,auth}=fixture(); env.STRIPE_SECRET_KEY="rk_live_synthetic";
  assert.equal(checkRelease(env,auth).configurationReady,true);
  env.TEAM_PLANS_ENABLED="true"; assert.ok(blocked(checkRelease(env,auth)).includes("team-billing"));
  Object.assign(env,{STRIPE_PRICE_CREW:"price_crew",STRIPE_PRICE_BUILDER:"price_builder",STRIPE_PORTAL_CONFIGURATION:"bpc_fixture"});
  assert.equal(checkRelease(env,auth).configurationReady,true);
});
