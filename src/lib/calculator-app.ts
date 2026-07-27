/**
 * Whether to offer the T2QCAL companion app, and where to send someone who
 * hasn't got it.
 *
 * The rule is a Guideline 2.5.2 one and worth stating plainly: an App Store
 * binary must not point people at software that is not itself on the App Store.
 * So inside the iOS shell the button only exists once T2QCAL is genuinely
 * published — signalled by the App Store URL being configured, which is a fact
 * that can only be true after review. On the open web there is no such rule and
 * the button always shows, falling back to the store page.
 *
 * Kept out of the component so the decision can be tested. A compliance gate
 * that is only three lines inside a server component is three lines nobody can
 * prove.
 */
export function shouldOfferCalculatorApp(options: {
  /** True when the request came from the iOS App Store shell. */
  nativeShell: boolean;
  /** The App Store product URL, set only once the app is live. */
  appStoreUrl?: string | null;
}): boolean {
  const published = Boolean(options.appStoreUrl && options.appStoreUrl.trim());
  // Fails closed: unset variable plus native shell means no button at all.
  // A missing button costs a tap; a button that breaks 2.5.2 costs the binary.
  return !options.nativeShell || published;
}

/** The scheme T2QCAL registers. Nothing secret ever travels through it. */
export const T2QCAL_SCHEME = "t2qcal";

/**
 * Builds the deep link for a destination inside T2QCAL.
 *
 * Route is restricted to a known shape rather than interpolated freely: this
 * string becomes a `window.location.href`, and letting arbitrary text into a
 * URL that launches another application is how you end up with a scheme
 * injection nobody looked for.
 */
export function calculatorDeepLink(route = ""): string {
  const clean = route.replace(/[^a-z0-9/-]/gi, "").replace(/^\/+/, "");
  return `${T2QCAL_SCHEME}://${clean}`;
}
