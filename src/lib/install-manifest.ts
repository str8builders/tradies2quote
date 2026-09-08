import type { MetadataRoute } from "next";

/**
 * Web App Manifest for tradies2Quote.
 *
 * Served by the explicit /manifest.webmanifest route. Layout metadata chooses
 * the manifest so the separate T2QCAL app can override its install identity.
 *
 * Theme + background colours mirror the design tokens declared in
 * `src/app/globals.css`:
 *   - theme_color  = brand orange (#FF5F15)  — what the OS tints address bars,
 *                                              taskbars, and PWA chrome with
 *   - background_color = ink-950 (#0A0A0A)   — splash background on launch,
 *                                              prevents flash-of-white
 *
 * `start_url: "/app"` lands installed-app users directly on the dashboard.
 * If unauthenticated, the existing `/app` server-component redirects to
 * `/login` (defense-in-depth on top of `proxy.ts`).
 *
 * Wave 10.3 — install icons now use the new Tradies2Quote PNG mark
 * generated from `public/logo-mark.png`. `purpose: "any"` covers
 * standard Android + Chrome install surfaces; `purpose: "maskable"`
 * is a separately-sized PNG with 15 % safe padding + an opaque ink-950
 * background so Android's circle/squircle mask never clips the mark
 * and never lets the wallpaper bleed through.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/app",
    name: "tradies2Quote",
    short_name: "T2Q",
    description:
      "Voice-first AI quoting for tradies. Record, generate, send a branded quote in under 60 seconds.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    theme_color: "#FF5F15",
    background_color: "#0A0A0A",
    categories: ["business", "productivity"],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/maskable-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    // Web Share Target — registers Tradies2Quote as a target in the OS
    // share sheet (Android Chrome, desktop Chrome PWA installs). The OS
    // hands the page `?title=&text=&url=` query params, which the
    // /app/materials/capture page reads and prefills into the capture form.
    // Method GET is intentional: no service-worker mediation needed,
    // no file/multipart handling. iOS Safari does NOT implement this part
    // of the spec — that's why the capture page also has a paste-URL
    // fallback for iPhone users.
    share_target: {
      action: "/app/materials/capture",
      method: "GET",
      enctype: "application/x-www-form-urlencoded",
      params: {
        title: "title",
        text: "text",
        url: "url",
      },
    },
  };
}
