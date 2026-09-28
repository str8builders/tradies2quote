/**
 * The rules LocationBridge (src/app/app/_v2/shell/LocationBridge.tsx)
 * follows, kept pure so they can be tested: when the iPhone app needs a new
 * upload key, what an arrival or departure the phone saw should do, whether
 * the server's answer means the phone can forget it, and which forms sign
 * out.
 */

import type { NativeStatus, SiteEvent } from "./device";
import type { Fix } from "./fix";

/** What the app's location module can do: 1 for builds before api 2 (see NativeStatus.api). */
export function nativeApi(status: Partial<NativeStatus> | null | undefined): number {
  return typeof status?.api === "number" && Number.isFinite(status.api) ? status.api : 1;
}

/**
 * A new upload key is needed when the phone has none or, on builds that
 * can say whose it is, when it belongs to someone else (another person
 * signed in on this phone). Older builds only know whether they have one.
 */
export function needsDeviceKey(status: Partial<NativeStatus> | null | undefined, userId: string): boolean {
  if (!status?.hasToken) return true;
  return nativeApi(status) >= 2 && status.userId !== userId;
}

/** The server still takes an automatic clock-in this late (clock_in: 12 hours back). */
export const MAX_ARRIVAL_AGE_MS = 12 * 60 * 60 * 1000;
/** A departure this recent can use where the phone is now as the finish pin. */
export const FRESH_DEPARTURE_MS = 2 * 60 * 1000;

export interface SiteEventState {
  consent: { granted: boolean; autoClock: boolean };
  open: { source: "tap" | "auto"; clientId: string | null } | null;
}

export type SiteEventPlan =
  | { kind: "clockIn"; at: number; clientId: string; fix: Fix | null }
  /** `askFix`: no position came with the departure, and it's recent enough to ask for one now. */
  | { kind: "clockOut"; at: number; fix: Fix | null; askFix: boolean }
  /** Nothing to do (location or automatic clock-in off, already clocked in, not this job): forget it. */
  | { kind: "skip" };

function eventFix(event: SiteEvent): Fix | null {
  return typeof event.lat === "number" && typeof event.lng === "number"
    ? { lat: event.lat, lng: event.lng, acc: event.acc ?? null }
    : null;
}

/**
 * What an arrival or departure means now, with the time it happened.
 * Arriving clocks in (automatically) when not clocked in; leaving clocks
 * out only an automatic clock-in at that same job. Work hours were checked
 * by the phone for arrivals only: leaving always ends the automatic
 * clock-in, whatever the time.
 */
export function planSiteEvent(event: SiteEvent, state: SiteEventState, now: number): SiteEventPlan {
  if (!state.consent.granted || !state.consent.autoClock || !Number.isFinite(event.t)) return { kind: "skip" };
  const fix = eventFix(event);
  if (event.type === "enter") {
    if (state.open || now - event.t > MAX_ARRIVAL_AGE_MS) return { kind: "skip" };
    return { kind: "clockIn", at: event.t, clientId: event.clientId, fix };
  }
  if (event.type === "exit" && state.open?.source === "auto" && state.open.clientId === event.clientId) {
    return { kind: "clockOut", at: event.t, fix, askFix: !fix && now - event.t <= FRESH_DEPARTURE_MS };
  }
  return { kind: "skip" };
}

/** A clock-in or clock-out's answer: null when the call itself failed (no signal). */
export type ActionAnswer = { ok: true } | { ok: false; retry?: boolean } | null | undefined;

/**
 * "ack": the server has it, or it will never apply (already clocked in,
 * too long ago), so the phone can forget it. "retry": keep it, and
 * everything after it, for the next go (no signal, a server hiccup).
 */
export function eventOutcome(answer: ActionAnswer): "ack" | "retry" {
  if (!answer) return "retry";
  if (answer.ok) return "ack";
  return answer.retry ? "retry" : "ack";
}

const SIGN_OUT_PATH = "/auth/signout";

/** A form posting to /auth/signout on this site (the app's sign-out buttons). */
export function isSignOutAction(action: string | null | undefined, pageUrl: string): boolean {
  if (!action) return false;
  try {
    const page = new URL(pageUrl);
    const url = new URL(action, page);
    return url.origin === page.origin && url.pathname.replace(/\/+$/, "") === SIGN_OUT_PATH;
  } catch {
    return false;
  }
}

/** This phone's or browser's time zone (IANA), or null when it can't say. */
export function deviceTimeZone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof zone === "string" && zone ? zone : null;
  } catch {
    return null;
  }
}

/** Remembered per tab once a zone has been offered for an account, so it's sent once, not on every page. */
export function zoneMark(userId: string, zone: string): string {
  return `${userId} ${zone}`;
}
