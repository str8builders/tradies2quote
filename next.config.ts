import type { NextConfig } from "next";
import path from "node:path";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/mobile/v1/*": ["./src/lib/billing/apple-roots/*.cer"],
    "/api/billing/apple/*": ["./src/lib/billing/apple-roots/*.cer"],
  },
  // Self-hosting (Docker): emit a standalone server bundle that ships only
  // the file-traced runtime deps, so the production image doesn't need the
  // full node_modules. Opt-in via BUILD_STANDALONE=1 (set by deploy/Dockerfile)
  // because `next start` — which the VPS systemd service and Vercel-less local
  // prod runs use — refuses to serve a standalone build.
  ...(process.env.BUILD_STANDALONE === "1" ? { output: "standalone" as const } : {}),
  turbopack: {
    root: path.resolve(__dirname),
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "images.pexels.com" },
    ],
  },
  // Production hardening — baseline security headers on every route.
  // Notes on the choices:
  //   - frame-ancestors 'self' (+ X-Frame-Options SAMEORIGIN for older
  //     browsers): the public /quote/[token] page carries the accept +
  //     signature flow, so it must not be embeddable on other origins
  //     (clickjacking). Nothing legitimately iframes this site.
  //   - Permissions-Policy keeps microphone (voice quotes), camera
  //     (materials capture) and geolocation (weather planning) available
  //     to OUR origin only, and shuts them off for any embedded content.
  //   - HSTS is intentionally absent — Vercel injects it on HTTPS domains.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self'",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(self), geolocation=(self)",
          },
        ],
      },
    ];
  },
  // Wave 17 — perf — tell SWC to per-icon tree-shake these packages.
  // Without this hint, importing 3 icons from `@phosphor-icons/react`
  // can pull the entire icon manifest into the client bundle. Hitting
  // every /app page because the mobile bottom nav, account hub, and
  // onboarding tour all use Phosphor client-side. Same idea for
  // framer-motion (only used on splash + auth panel) and lucide-react.
  // Verified against Next 16 release notes — supported under Turbopack.
  experimental: {
    // Keep release builds within memory while the VPS serves the live app and AI.
    cpus: 2,
    // Optional for disposable or disk-constrained builds; runtime output is identical.
    turbopackFileSystemCacheForBuild: process.env.T2Q_NO_BUILD_CACHE !== "1",
    optimizePackageImports: [
      "@phosphor-icons/react",
      "framer-motion",
      "lucide-react",
    ],
    // Server Actions default to a 1 MB request-body cap. The avatar + business
    // logo uploads go through Server Actions and their server-side size
    // backstop is 8 MB, so without this the platform would 413 a large logo
    // BEFORE the action's own check runs. Match the two so the action is the
    // single enforcement point. (Client-side compression keeps real uploads
    // far smaller; this only governs the fallback / pathological case.)
    serverActions: {
      bodySizeLimit: "8mb",
    },
  },
};

// Wire Sentry into the build: enables the build plugin (release tagging +
// source-map upload so production stacks are readable) and the client-side
// instrumentation. All side effects are env-gated and SAFE WHEN ENV IS ABSENT:
//   - No `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT` → source-map
//     upload is skipped with a warning; the build still succeeds.
//   - No `NEXT_PUBLIC_SENTRY_DSN` → `Sentry.init` is a no-op at runtime, so no
//     events are sent and behaviour is unchanged.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Quiet build logs unless something is actually wrong.
  silent: !process.env.CI,
  // Upload a wider set of client source maps for readable stack traces.
  widenClientFileUpload: true,
});
