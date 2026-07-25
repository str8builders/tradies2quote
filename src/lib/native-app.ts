/**
 * iOS-shell detection (App Store Guideline 3.1.3(f) compliance layer).
 *
 * The Capacitor shell loads the SAME production origin as every browser,
 * so the server can't tell them apart — but the shell injects a
 * `window.Capacitor` bridge before any page script runs, and
 * `isNativePlatform()` is true only inside the real native container
 * (false in Safari, PWAs, and plain WKWebViews).
 *
 * Under 3.1.3(f) the iOS binary must contain ZERO pricing, upgrade
 * buttons, or billing links — the free app + Stripe-on-web model (the
 * Tradify pattern). Anything money-shaped renders inside
 * `<HideInNativeApp>` (see src/app/_components/HideInNativeApp.tsx),
 * which uses this check. Server-side gating is impossible here by
 * construction; client gating against the injected bridge is the
 * standard approach.
 */
export function isNativeIOSApp(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (
    window as unknown as {
      Capacitor?: { isNativePlatform?: () => boolean };
    }
  ).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}
