/**
 * The owner's T2Q logo (public/logo-mark.png, 1084 × 512) cut into its three
 * pieces: the white T, the orange 2 and the white Q, each on the full
 * transparent canvas so the three stacked are exactly the logo. The welcome
 * scenes fly them in separately and land them as the real mark (not the
 * letters typed in a font). `origin` is each piece's centre, for its spin.
 */
export const LOGO_ASPECT = 1084 / 512;

export const LOGO_PIECES = {
  T: { src: "/brand/t2q-T.png", origin: "20.8% 50%" },
  two: { src: "/brand/t2q-2.png", origin: "46.4% 50%" },
  Q: { src: "/brand/t2q-Q.png", origin: "76.4% 50.2%" },
} as const;

/** The whole logo, for masking effects (the caution stripe) to its shape. */
export const LOGO_SRC = "/logo-mark.png";

/**
 * Resolves once every piece is decoded (or after `timeoutMs`), so a welcome
 * never starts with its logo still loading. Never rejects.
 */
export function preloadLogoPieces(timeoutMs = 1500): Promise<void> {
  if (typeof Image === "undefined") return Promise.resolve();
  const loads = Object.values(LOGO_PIECES).map(({ src }) => {
    const img = new Image();
    img.src = src;
    return img.decode().catch(() => undefined);
  });
  return Promise.race([
    Promise.all(loads).then(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}
