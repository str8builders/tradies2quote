import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isLocalSentrySink,
  isSentryEnabled,
  sentrySendDefaultPii,
  sentryTracesSampleRate,
} from "./sentryTarget";

const LOCAL = "http://abc123@localhost:8969/2";
const HOSTED = "https://abc123@o123.ingest.sentry.io/456";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isLocalSentrySink", () => {
  it("recognises loopback hosts", () => {
    expect(isLocalSentrySink(LOCAL)).toBe(true);
    expect(isLocalSentrySink("http://k@127.0.0.1:8969/2")).toBe(true);
    expect(isLocalSentrySink("http://k@[::1]:8969/2")).toBe(true);
  });

  it("rejects hosted, absent, and malformed DSNs", () => {
    expect(isLocalSentrySink(HOSTED)).toBe(false);
    expect(isLocalSentrySink(undefined)).toBe(false);
    expect(isLocalSentrySink("")).toBe(false);
    expect(isLocalSentrySink("not a url")).toBe(false);
  });

  it("is not fooled by a hostname that merely contains 'localhost'", () => {
    expect(isLocalSentrySink("https://k@localhost.evil.com/2")).toBe(false);
  });
});

describe("isSentryEnabled", () => {
  it("stays off entirely without a DSN", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(isSentryEnabled(undefined)).toBe(false);
  });

  it("keeps hosted Sentry production-only, exactly as before", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(isSentryEnabled(HOSTED)).toBe(false);
    vi.stubEnv("NODE_ENV", "production");
    expect(isSentryEnabled(HOSTED)).toBe(true);
  });

  it("enables a local sink in development — the point of local capture", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(isSentryEnabled(LOCAL)).toBe(true);
  });
});

describe("tuning knobs follow the destination", () => {
  it("samples every trace locally, 10% hosted", () => {
    expect(sentryTracesSampleRate(LOCAL)).toBe(1.0);
    expect(sentryTracesSampleRate(HOSTED)).toBe(0.1);
    expect(sentryTracesSampleRate(undefined)).toBe(0.1);
  });

  it("only ever sends PII to a local sink", () => {
    expect(sentrySendDefaultPii(LOCAL)).toBe(true);
    expect(sentrySendDefaultPii(HOSTED)).toBe(false);
    expect(sentrySendDefaultPii(undefined)).toBe(false);
  });
});
