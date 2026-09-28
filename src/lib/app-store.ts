/**
 * The iPhone app on the App Store. Everything App Store on the website (the
 * download badge, Safari's smart app banner) stays hidden until Apple has
 * published the app and its id is set: APP_STORE_ID in the server's env (the
 * number in the listing's link, apps.apple.com/…/id6746123456), then a
 * rebuild. Read at build time for static pages.
 */
export function appStoreId(env: Record<string, string | undefined> = process.env): string | null {
  const id = env.APP_STORE_ID?.trim().replace(/^id/i, "");
  return id && /^\d{6,12}$/.test(id) ? id : null;
}

export function appStoreUrl(id: string): string {
  return `https://apps.apple.com/app/id${id}`;
}

/**
 * Apple's official "Download on the App Store" badge, served by Apple's own
 * App Store marketing tools (Apple's badge rules: use it unaltered, at least
 * 40 px tall, with clear space around it).
 */
export const APP_STORE_BADGE_SRC =
  "https://toolbox.marketingtools.apple.com/api/badges/download-on-the-app-store/black/en-us?size=250x83";
