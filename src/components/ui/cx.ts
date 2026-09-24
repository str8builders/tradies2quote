/**
 * Join class names, dropping falsy parts. No merging: a caller's `className`
 * is for layout (margins, width, grid placement), not for restyling a kit
 * part — restyle through props, so every screen keeps one look.
 */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
