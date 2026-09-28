// Coming back to the app after an update loads the new version, unless the
// page holds something the tradie hasn't saved (a new quote's words, an open
// editor): then it waits, and the page's next save meets the update instead.
import { describe, expect, it, vi } from "vitest";
import { AWAY_MS, shouldReloadForUpdate, watchForUpdate, type UpdateWatchEnv } from "./StaleVersionReload";

function fakeEnv(opts: { commit: string; unsaved?: boolean }) {
  let visibility = "visible";
  let clock = 1_000_000;
  const listeners = new Set<() => void>();
  const env: UpdateWatchEnv = {
    document: {
      get visibilityState() {
        return visibility;
      },
      addEventListener: (_type, listener) => void listeners.add(listener),
      removeEventListener: (_type, listener) => void listeners.delete(listener),
    },
    fetch: vi.fn(async () => ({ ok: true, json: async () => ({ commit: opts.commit }) })),
    reload: vi.fn(),
    now: () => clock,
    unsavedInput: () => opts.unsaved === true,
  };
  const flip = (to: "hidden" | "visible") => {
    visibility = to;
    for (const listener of Array.from(listeners)) listener();
  };
  const awayFor = async (ms: number) => {
    flip("hidden");
    clock += ms;
    flip("visible");
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  return { env, awayFor, listeners };
}

describe("reloading after an update", () => {
  it("reloads when the live version is newer and nothing is unsaved", async () => {
    const { env, awayFor } = fakeEnv({ commit: "new-build" });
    watchForUpdate("old-build", env);
    await awayFor(AWAY_MS);
    expect(env.fetch).toHaveBeenCalledWith("/api/health", { cache: "no-store" });
    expect(env.reload).toHaveBeenCalledTimes(1);
  });

  it("keeps a page holding unsaved input", async () => {
    const { env, awayFor } = fakeEnv({ commit: "new-build", unsaved: true });
    watchForUpdate("old-build", env);
    await awayFor(5 * 60_000);
    expect(env.fetch).toHaveBeenCalled();
    expect(env.reload).not.toHaveBeenCalled();
  });

  it("leaves a quick app switch and an up-to-date page alone", async () => {
    const quick = fakeEnv({ commit: "new-build" });
    watchForUpdate("old-build", quick.env);
    await quick.awayFor(AWAY_MS - 1);
    expect(quick.env.fetch).not.toHaveBeenCalled();

    const current = fakeEnv({ commit: "same-build" });
    watchForUpdate("same-build", current.env);
    await current.awayFor(AWAY_MS);
    expect(current.env.reload).not.toHaveBeenCalled();
  });

  it("stops watching on cleanup, and never watches without a build", () => {
    const { env, listeners } = fakeEnv({ commit: "new-build" });
    const stop = watchForUpdate("old-build", env);
    expect(listeners.size).toBe(1);
    stop();
    expect(listeners.size).toBe(0);
    watchForUpdate(null, env);
    expect(listeners.size).toBe(0);
  });

  it("the rule on its own", () => {
    expect(shouldReloadForUpdate("a", "b", false)).toBe(true);
    expect(shouldReloadForUpdate("a", "b", true)).toBe(false);
    expect(shouldReloadForUpdate("a", "a", false)).toBe(false);
    expect(shouldReloadForUpdate(null, "b", false)).toBe(false);
  });
});
