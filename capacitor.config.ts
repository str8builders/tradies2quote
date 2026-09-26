import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor iOS shell — see APP_STORE_READINESS.md for the full plan.
 *
 * Architecture: the product is a server-rendered Next.js app (RSC +
 * server actions), so the shell loads the production origin and layers
 * REAL native capabilities on top (APNs push, native share/save, and a
 * native offline screen via `errorPath`). The Guideline 4.2 defence is
 * that native layer plus review notes — a bare webview wrapper this is
 * not.
 *
 * `webDir` holds the LOCAL assets: the branded offline/error screen
 * that WKWebView falls back to when the remote origin is unreachable
 * (reviewers Airplane-Mode-test; a stock browser error page is an
 * instant wrapper rejection).
 */
const config: CapacitorConfig = {
  appId: "com.str8builders.tradies2quote",
  appName: "Tradies2Quote",
  webDir: "ios-shell",
  server: {
    // Launch straight into the product (login-first) — NOT the
    // marketing homepage, which carries pricing (3.1.3(f)) and reads
    // as a website wrapper (4.2).
    url: "https://tradies2quote.com/app",
    // Local page shown when the remote fails to load (offline / DNS).
    errorPath: "error.html",
    // Keep navigation inside the product origin; everything else opens
    // in the system browser (also keeps Stripe/legal pages out of the
    // binary's own surface).
    allowNavigation: ["tradies2quote.com", "www.tradies2quote.com"],
  },
  ios: {
    scheme: "Tradies2Quote",
    contentInset: "never",
    backgroundColor: "#0A0A0A",
    // 3.1.3(f) load-bearing: the SERVER detects this marker (see
    // src/lib/native-shell.ts) and never emits pricing/billing HTML to the
    // shell. The client-side <HideInNativeApp> is only defence-in-depth —
    // client hiding alone leaves the money HTML in the SSR payload, where a
    // reviewer can catch it as a hydration flash or in view-source.
    appendUserAgent: "T2QNativeShell",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: "#0A0A0A",
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
