/**
 * The clock-in Live Activity in the iPhone app (browser code): "Clocked in"
 * with a timer, in the Dynamic Island and on the Lock Screen. The Swift side
 * (T2QClockActivityPlugin.swift, drawn by ios/App/T2QWidgets) does the
 * starting, updating and ending; the page only says what the account's open
 * time entry is, each time it reads it (LocationBridge). No open entry ends
 * it. Nothing happens anywhere else (Safari, an installed web app, an older
 * copy of the app, an iPhone older than iOS 16.2, Live Activities switched off
 * in Settings), and a failure is never the page's problem.
 *
 * Only the start time goes to the Lock Screen: no client or job name.
 */

import { registerPlugin } from "@capacitor/core";
import { hasNativeModule } from "./plugins";

/** The open time entry, as the Timesheet knows it (LocationState.open). */
export interface OpenClock {
  id: string;
  startedAt: string;
}

export interface ClockActivityStatus {
  supported: boolean;
  enabled: boolean;
  active: boolean;
  /** How many are running (0 or 1). */
  count?: number;
}

interface T2QClockActivityPlugin {
  status(): Promise<ClockActivityStatus>;
  sync(options: { entryId: string; startedAt: string }): Promise<{ result: string }>;
  end(): Promise<{ ended: number }>;
}

const T2QClockActivity = registerPlugin<T2QClockActivityPlugin>("T2QClockActivity");

/**
 * A clock left running longer than this is a forgotten one, not a shift: the
 * island doesn't show it (iOS ends an activity after 8 hours anyway).
 */
export const MAX_ACTIVITY_AGE_MS = 16 * 60 * 60 * 1000;

export function hasClockActivity(): boolean {
  return hasNativeModule("T2QClockActivity");
}

/**
 * What the island should do for this open entry: start (or keep) it, or end it.
 * `start` carries the exact instant to count from.
 */
export function planClockActivity(
  open: OpenClock | null | undefined,
  now: number,
): { kind: "end" } | { kind: "start"; entryId: string; startedAt: string } {
  if (!open || !open.id) return { kind: "end" };
  const started = Date.parse(open.startedAt);
  if (!Number.isFinite(started)) return { kind: "end" };
  // A start a little in the future is a skewed clock: count from now.
  const age = now - started;
  if (age > MAX_ACTIVITY_AGE_MS) return { kind: "end" };
  return { kind: "start", entryId: open.id, startedAt: new Date(Math.min(started, now)).toISOString() };
}

/**
 * Make the island match the open entry (or end it when there is none). Never
 * throws. Says what the phone did ("started", "running", "updated", "kept-off",
 * "off", "unsupported", or "ended" for no open entry), or null when there is
 * no module or it failed: the page ignores it, the local test page shows it.
 */
export async function syncClockActivity(open: OpenClock | null | undefined, now: number = Date.now()): Promise<string | null> {
  if (!hasClockActivity()) return null;
  try {
    const plan = planClockActivity(open, now);
    if (plan.kind === "end") {
      await T2QClockActivity.end();
      return "ended";
    }
    return (await T2QClockActivity.sync({ entryId: plan.entryId, startedAt: plan.startedAt })).result ?? null;
  } catch {
    // The phone said no (Live Activities off, an older iOS): the page carries on.
    return null;
  }
}

/** End it now (signing out). Never throws. */
export async function endClockActivity(): Promise<void> {
  if (!hasClockActivity()) return;
  try {
    await T2QClockActivity.end();
  } catch {
    // Nothing to end, or the phone said no.
  }
}

/** For the local test page: what the phone says about Live Activities. */
export async function clockActivityStatus(): Promise<ClockActivityStatus | null> {
  if (!hasClockActivity()) return null;
  try {
    return await T2QClockActivity.status();
  } catch {
    return null;
  }
}
