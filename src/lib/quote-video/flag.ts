/**
 * Quote video on/off switch.
 *
 *   QUOTE_VIDEO_ENABLED   env flag. DEFAULT OFF (unset / not "true").
 *
 * Off (the owner took the quote video out of the app and the website on
 * 27 September 2026): the job page shows no video card, a new video can't
 * be requested, the owner's download route answers 404 and the client's
 * quote link plays no video. Nothing is deleted: the tables, the bucket and
 * the videos already made stay, so setting it to "true" (and restarting the
 * web app) brings everything back, including videos of quotes that haven't
 * changed since. With nothing queued, the t2q-video worker just idles.
 */
export function quoteVideoEnabled(): boolean {
  return process.env.QUOTE_VIDEO_ENABLED === "true";
}
