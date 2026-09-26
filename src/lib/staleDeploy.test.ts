import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STALE_DEPLOY_LOOP_GUARD_MS, STALE_DEPLOY_RELOAD_FLAG, maybeRecoverFromStaleDeploy } from "./staleDeploy";

const STALE = 'UnrecognizedActionError: Server Action "405b4d19" was not found on the server.';
let store: Map<string, string>;
let reload: ReturnType<typeof vi.fn>;

beforeEach(() => {
  store = new Map();
  reload = vi.fn();
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  });
  vi.stubGlobal("window", { location: { reload } });
});
afterEach(() => vi.unstubAllGlobals());

describe("recovering a page left open across an update", () => {
  it("reloads for a stale page, and again after a later update in the same session", () => {
    const t0 = 1_000_000;
    expect(maybeRecoverFromStaleDeploy(STALE, t0)).toBe(true);
    // Hours later, another deploy strands the same (days-long) iPhone app session.
    expect(maybeRecoverFromStaleDeploy(STALE, t0 + 3 * 60 * 60 * 1000)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("won't loop: a second stale error within a minute of reloading is left alone", () => {
    const t0 = 5_000_000;
    expect(maybeRecoverFromStaleDeploy(STALE, t0)).toBe(true);
    expect(maybeRecoverFromStaleDeploy(STALE, t0 + STALE_DEPLOY_LOOP_GUARD_MS - 1)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("an old once-per-session flag doesn't block recovery", () => {
    store.set(STALE_DEPLOY_RELOAD_FLAG, "1");
    expect(maybeRecoverFromStaleDeploy(STALE, 9_000_000)).toBe(true);
  });

  it("ignores other errors, and stays put when storage is blocked", () => {
    expect(maybeRecoverFromStaleDeploy("TypeError: Load failed", 1)).toBe(false);
    vi.stubGlobal("sessionStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {},
    });
    expect(maybeRecoverFromStaleDeploy(STALE, 2)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
