/**
 * Which job page a request gets. The new look only ever renders while the
 * new-look switch is on for this user; with it off the classic page renders
 * exactly as before, whatever the URL says. With it on, `?view=classic` still
 * opens the classic page on purpose — the "detailed editor" the new page links
 * to for terms, markup, measurements, drawing sizes and supplier checks.
 */
export type JobPageLook = "new" | "classic";

export const CLASSIC_VIEW_PARAM = "classic";

export function jobPageLook(newLookOn: boolean, view: string | string[] | undefined): JobPageLook {
  if (!newLookOn) return "classic";
  const requested = Array.isArray(view) ? view[0] : view;
  return requested === CLASSIC_VIEW_PARAM ? "classic" : "new";
}
