/**
 * Link-preview crawler detection for the public quote page.
 *
 * When a tradie texts a quote link, the messaging app fetches the URL to
 * render an unfurl card BEFORE the human ever taps it. iMessage in particular
 * fetches with a User-Agent that impersonates the Facebook/Twitter crawlers
 * (literally `facebookexternalhit/1.1 Facebot Twitterbot/1.0`). The quote page
 * marks a quote "viewed" on GET, so without this guard the preview fetch flips
 * the quote to viewed before the client has seen anything — corrupting the
 * "viewed by client" signal and the follow-up cadence anchored to it.
 *
 * We use this ONLY to skip the view-telemetry write, never to change what data
 * is served (the crawler must still get the OG tags). A false positive costs a
 * single un-recorded view; a false negative is the bug we're fixing — so the
 * matcher favours catching crawlers over being conservative, while still never
 * matching a real mobile browser (Safari/Chrome UAs contain none of these
 * tokens).
 */

// Explicit, well-known preview/crawler UA tokens. Case-insensitive.
const LINK_PREVIEW_BOTS =
  /(facebookexternalhit|facebot|twitterbot|slackbot|slack-imgproxy|telegrambot|discordbot|whatsapp|linkedinbot|applebot|pinterest|redditbot|skypeuripreview|googlebot|google-inspectiontool|bingbot|embedly|quora link preview|vkshare|w3c_validator|bitlybot|nuzzel|iframely|opengraph)/i;

/** True when the request's User-Agent is a link-preview/unfurl crawler. */
export function isLinkPreviewBot(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  return LINK_PREVIEW_BOTS.test(userAgent);
}
