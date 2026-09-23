/**
 * Brand mark — Wave 19.12 — transparent T2Q artwork, no white box.
 *
 * History:
 *   - Wave 19.2 swapped every `public/*.png` icon asset to the
 *     founder's uploaded T2Q logo.
 *   - Wave 19.8 refactored the landing surfaces to an SVG <text>
 *     approximation — not the real letterforms.
 *   - Wave 19.11 pointed <LogoMark> back at the real PNG, but the
 *     source had a baked-in white background, so it needed a white
 *     pill to stay legible on the dark theme — the "white box".
 *   - Wave 19.12 (this) regenerates `/logo-horizontal.png` as a
 *     TRANSPARENT PNG: the T and Q letterforms recoloured light
 *     (#F5F5F4), the 2 kept orange, the white background dropped to
 *     alpha 0, and the canvas cropped tight to the glyphs (was 33%
 *     content + 67% white padding). It now reads cleanly straight on
 *     the dark site + dark splash with NO pill, and renders large
 *     because the wasted padding is gone.
 *
 * `size` controls HEIGHT; the ~2.12:1 asset aspect sets the width.
 * Served as a 424px-wide WebP (sharp from the transparent PNG): big enough
 * for the largest use (96px tall at 2x) at ~5% of the PNG's weight.
 *
 * The legacy export name `LogoMark` is preserved so existing imports
 * keep working without churn.
 */
type LogoMarkProps = {
  size?: number;
  className?: string;
  title?: string;
};

export function LogoMark({
  size = 40,
  className = "",
  title = "Tradies2Quote",
}: LogoMarkProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      data-testid="logo-mark"
      src="/logo-horizontal.webp"
      alt={title}
      width={424}
      height={200}
      className={`block w-auto shrink-0 ${className}`}
      style={{ height: size }}
    />
  );
}

// Alias so future imports can be explicit about the new design intent.
export { LogoMark as T2QLogoMark };

type LogoProps = {
  size?: number;
  withWordmark?: boolean;
  /**
   * Optional Tailwind classes applied to the wordmark span. Use to
   * hide the wordmark on small viewports while keeping the mark
   * visible — e.g. `wordmarkClassName="hidden md:inline"` shows just
   * T2Q on mobile and T2Q + TRADIES2QUOTE on tablet/desktop.
   */
  wordmarkClassName?: string;
  className?: string;
};

/**
 * Composite brand lockup — T2Q mark + "TRADIES2QUOTE" wordmark in caps.
 *
 * Wave 19.8 — wordmark switched from `tradies²Quote` (mixed case + the
 * `²` superscript) to `TRADIES2QUOTE` all-caps with the `2` in brand
 * orange. This matches the brutalist display-type aesthetic of the
 * landing (Archivo Black + uppercase) and echoes the orange `2` in
 * the new T2Q logo mark for visual cohesion.
 *
 * Wave 19.9 — added `wordmarkClassName` so the Header can hide the
 * wordmark on mobile (T2Q only fits cleaner against a hamburger menu)
 * while desktop still shows the full lockup.
 */
export function Logo({
  size = 36,
  withWordmark = true,
  wordmarkClassName = "",
  className = "",
}: LogoProps) {
  return (
    <span
      data-testid="brand-logo"
      className={`inline-flex items-center gap-3 ${className}`}
    >
      {/* With the wordmark beside it the mark is decorative: its alt text
          would only repeat the word (Lighthouse image-redundant-alt). A link
          that hides the wordmark on small screens labels itself. */}
      <LogoMark size={size} title={withWordmark ? "" : undefined} />
      {withWordmark && (
        <span
          className={`font-display uppercase tracking-tight leading-none whitespace-nowrap ${wordmarkClassName}`}
        >
          TRADIES<span className="text-brand">2</span>QUOTE
        </span>
      )}
    </span>
  );
}
