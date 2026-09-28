import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  REMEMBERED_EMAIL_KEY,
  REMEMBERED_EMAIL_MAX_AGE_MS,
  recallEmail,
  rememberEmail,
  restoreEmailInto,
} from "./remembered-email";

let store: Map<string, string>;

beforeEach(() => {
  store = new Map();
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("the typed email survives a reload", () => {
  it("comes back within a few minutes", () => {
    rememberEmail("  mike@bayside.co.nz ", 1_000);
    expect(recallEmail(1_000 + 60_000)).toBe("mike@bayside.co.nz");
  });

  it("goes stale and is dropped", () => {
    rememberEmail("mike@bayside.co.nz", 1_000);
    expect(recallEmail(1_000 + REMEMBERED_EMAIL_MAX_AGE_MS + 1)).toBe("");
    expect(store.has(REMEMBERED_EMAIL_KEY)).toBe(false);
  });

  it("blank or junk clears it; bad stored data is ignored", () => {
    rememberEmail("mike@bayside.co.nz", 1_000);
    rememberEmail("", 2_000);
    expect(recallEmail(2_000)).toBe("");
    store.set(REMEMBERED_EMAIL_KEY, "{not json");
    expect(recallEmail(2_000)).toBe("");
    store.set(REMEMBERED_EMAIL_KEY, JSON.stringify({ email: "a@b.nz", at: 9_000 }));
    expect(recallEmail(2_000)).toBe(""); // saved "in the future": not trusted
  });

  it("only fills an empty field", () => {
    rememberEmail("mike@bayside.co.nz");
    const empty = { value: "" } as HTMLInputElement;
    restoreEmailInto(empty);
    expect(empty.value).toBe("mike@bayside.co.nz");
    const typed = { value: "someone@else.nz" } as HTMLInputElement;
    restoreEmailInto(typed);
    expect(typed.value).toBe("someone@else.nz");
    restoreEmailInto(null);
  });

  it("works (does nothing) when storage is blocked", () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("SecurityError");
      },
      removeItem: () => {
        throw new Error("SecurityError");
      },
    });
    expect(() => rememberEmail("mike@bayside.co.nz")).not.toThrow();
    expect(recallEmail()).toBe("");
  });

  it("the forms keep the email field only, never the password", () => {
    for (const file of [
      "../login/_components/LoginForm.tsx",
      "../signup/_components/SignupForm.tsx",
      "../../t2qcal/signin/SignInForm.tsx",
    ]) {
      const source = readFileSync(resolve(__dirname, file), "utf8");
      const calls = source.match(/rememberEmail\([^;]*\)/g) ?? [];
      expect(calls.length, file).toBeGreaterThan(0);
      for (const call of calls) expect(call, file).toContain('.get("email")');
      expect(source, file).not.toMatch(/rememberEmail\([^)]*password/);
      expect(source, file).toContain("restoreEmailInto(");
    }
  });
});
