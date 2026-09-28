// After an update the job page's old server actions are gone. A save or a
// step that throws that error used to say "That didn't save. Check your
// signal" and never reload, so every retry failed. Now the new version loads.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STALE_DEPLOY_RELOAD_FLAG } from "@/lib/staleDeploy";
import { actionThrew, NO_CONNECTION } from "./stale";

const STALE = new Error('Server Action "40bcecfe" was not found on the server.');

describe("a server action that threw", () => {
  it("is the connection when it isn't an update", () => {
    const reload = vi.fn();
    const later = vi.fn();
    expect(actionThrew(new TypeError("Failed to fetch"), NO_CONNECTION, later, reload)).toEqual({ error: NO_CONNECTION });
    expect(reload).not.toHaveBeenCalled();
  });

  it("after an update: says so and loads the new version", () => {
    const reload = vi.fn((show: (m: string) => void) => show("Tradies2Quote was just updated. Reloading…"));
    const later = vi.fn();
    expect(actionThrew(STALE, NO_CONNECTION, later, reload)).toEqual({ error: "Tradies2Quote was just updated. Reloading…" });
    expect(reload).toHaveBeenCalledWith(expect.any(Function), STALE);
    expect(later).not.toHaveBeenCalled();
  });

  it("anything said later goes to the page", () => {
    let show: (m: string) => void = () => {};
    const reload = vi.fn((s: (m: string) => void) => {
      show = s;
      s("first");
    });
    const later = vi.fn();
    expect(actionThrew(STALE, NO_CONNECTION, later, reload).error).toBe("first");
    show("Close and reopen the app");
    expect(later).toHaveBeenCalledWith("Close and reopen the app");
  });
});

describe("with the real reload", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("reloads once, then asks for a restart instead of looping", () => {
    vi.useFakeTimers();
    const store = new Map<string, string>();
    const reload = vi.fn();
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    vi.stubGlobal("window", { setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms), location: { reload } });

    const later = vi.fn();
    expect(actionThrew(STALE, NO_CONNECTION, later).error).toMatch(/was just updated\. Reloading/);
    vi.advanceTimersByTime(800);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(store.has(STALE_DEPLOY_RELOAD_FLAG)).toBe(true);
    expect(later).not.toHaveBeenCalled();

    // The reload didn't help (a second stale error within the minute).
    actionThrew(STALE, NO_CONNECTION, later);
    vi.advanceTimersByTime(800);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(later).toHaveBeenCalledWith(expect.stringMatching(/Close and reopen the app/));
  });
});

describe("every server action catch on the job page checks for an update", () => {
  const source = (file: string) =>
    readFileSync(join(__dirname, file), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

  it("JobScreen: no catch drops the error", () => {
    const code = source("JobScreen.tsx");
    expect(code).not.toMatch(/catch\s*\{/);
    expect(code.match(/catch \(e\)/g)?.length).toBeGreaterThanOrEqual(5);
  });

  it("the invoice sheet and day notes reload after an update", () => {
    const invoice = source("sheets/InvoiceSheet.tsx");
    // The one bare catch left is the email route's fetch, not a server action.
    expect(invoice.match(/catch\s*\{/g)).toHaveLength(1);
    expect(invoice.match(/isStaleDeployError\(e\)/g)).toHaveLength(2);
    const notes = source("parts/DayNotes.tsx");
    expect(notes).toMatch(/try \{\s*result = await addCalendarNote\(day, body\);\s*\} catch \(e\)/);
    expect(notes).toContain("isStaleDeployError(e)");
  });
});
