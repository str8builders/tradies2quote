import { isNativeIOSApp } from "@/lib/native-app";

/**
 * What an account whose free trial has ended is told when it tries to make
 * something new: a quote, a drawing scan, a photo or plan reading.
 *
 * On the website each place keeps its own sentence, which names the
 * subscription. Inside the iPhone app nothing may mention subscribing, plans
 * or prices (App Store 3.1.1 / 3.1.3(f): a free companion app), so the app is
 * only ever told that new quotes are paused.
 *
 * Client-safe. API routes answer through trialEndedResponse
 * (trial-ended-response.ts), which picks the wording on the server.
 */
export const NEW_QUOTES_PAUSED = "New quotes are paused on this account.";

/** The website's own sentence, or the app's plain one. */
export function trialEndedMessage(webMessage: string, inApp: boolean): string {
  return inApp ? NEW_QUOTES_PAUSED : webMessage;
}

/**
 * A quote request's saved note ("Subscription inactive; …"), as the iPhone
 * app may show it: any subscription or plan talk becomes the paused sentence.
 */
export function requestNoteForApp(note: string, inApp: boolean): string {
  return inApp && /subscri|trial|plan|upgrade|billing/i.test(note) ? NEW_QUOTES_PAUSED : note;
}

/** The iOS shell's user-agent marker (capacitor.config.ts, src/lib/native-shell.ts). */
const NATIVE_SHELL_UA_MARKER = "T2QNativeShell";

/**
 * In the browser: true inside the iPhone app (the shell's user-agent marker,
 * or the Capacitor bridge older shells carry). Always false on the server.
 * Only for words picked after the page has loaded, such as an error reply;
 * anything in the server-rendered page is decided by isNativeShellRequest().
 */
export function inIPhoneApp(): boolean {
  if (typeof window === "undefined") return false;
  return (window.navigator?.userAgent ?? "").includes(NATIVE_SHELL_UA_MARKER) || isNativeIOSApp();
}
