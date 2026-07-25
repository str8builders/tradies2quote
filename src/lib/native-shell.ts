import "server-only";
import { headers } from "next/headers";

/**
 * SERVER-side iOS-shell detection — the authoritative 3.1.3(f) gate.
 *
 * The Capacitor shell appends "T2QNativeShell" to WKWebView's User-Agent
 * (capacitor.config.ts → ios.appendUserAgent), so the server can withhold
 * money-shaped HTML (pricing, upgrade CTAs, Stripe checkout/portal links)
 * from the App Store binary BEFORE it is ever rendered. The client-side
 * <HideInNativeApp> remains as defence-in-depth for shells built before the
 * marker existed, but it cannot be the primary gate: it renders the priced
 * children during SSR and only swaps them out on hydration, which leaves the
 * pricing in the served HTML (view-source / slow-network flash — an instant
 * 3.1.3(f) rejection).
 *
 * Guarantee direction matters here: a FALSE NEGATIVE (native shell not
 * detected) is the dangerous case, a false positive just hides prices from
 * an odd browser. The marker string is distinctive enough that real browsers
 * never carry it.
 */

const NATIVE_SHELL_UA_MARKER = "T2QNativeShell";

/** True when the current request comes from the iOS App Store shell. */
export async function isNativeShellRequest(): Promise<boolean> {
  const ua = (await headers()).get("user-agent") ?? "";
  return ua.includes(NATIVE_SHELL_UA_MARKER);
}
