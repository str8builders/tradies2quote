/**
 * The new job page's words for lines the calculator couldn't work out. The
 * classic editor's guide (lib/takeoff/blockedLineGuide) sends the tradie to
 * its "Takeoff assumptions" panel and a Recalculate button, which the new
 * look doesn't have; these point to what the new page does have: typing the
 * quantity on the line, deleting it, or (on a wall job) the measurements
 * sheet, which works the wall materials out again. Pure: tested in node.
 */

import { blockedScopeFromDescription } from "@/lib/takeoff/blockedLineGuide";

/** What each calculator needed and didn't get, in plain words. */
const NEEDS: Record<string, string> = {
  framing: "the wall length and height",
  wall: "the wall length and height",
  lining: "the wall area, or the wall length and height",
  insulation: "the outside wall area, or to know the walls are outside walls",
  concrete: "the length and width, or how many cubic metres",
  fixing: "the length of the run, or the perimeter",
  deck: "the deck length and width",
  subfloor: "the floor length and width",
  cladding: "the wall length and height",
  roofing: "the roof area, or its length and width",
  fencing: "the fence length",
};

/** The scopes the measurements sheet (a wall's length, height, doors and windows) works out again. */
const MEASURABLE = new Set(["framing", "wall", "lining"]);

const OWN_NUMBER = "Type how many below to make it your own number, or delete the line.";

export interface BlockedLineHelp {
  text: string;
  /** Offer "Change the measurements": a wall job whose measurements work this line out. */
  measure: boolean;
}

/**
 * Why a blocked line can't be worked out and what to do about it.
 * `canMeasure`: the job page has the measurements sheet for this quote.
 */
export function blockedLineHelp(description: string | null | undefined, canMeasure: boolean): BlockedLineHelp {
  const scope = blockedScopeFromDescription(description);
  // The calculator's own blocked insulation line ("Pink Batts Insulation"):
  // insulation is only quoted on outside walls, and their length wasn't given.
  if (!scope && /insulation/i.test(description ?? "")) {
    return {
      text: `Insulation goes on outside walls only, and we weren't told how long they are, so it can't be worked out. ${OWN_NUMBER}`,
      measure: false,
    };
  }
  const needs = scope ? NEEDS[scope] : undefined;
  const measure = canMeasure && scope !== null && MEASURABLE.has(scope);
  const what = scope ? `${scope.charAt(0).toUpperCase()}${scope.slice(1)}` : "This line";
  const why = needs ? `${what} needs ${needs} before it can be worked out.` : `${what} is missing a size, so it can't be worked out.`;
  const measureWords = measure ? " Or change the measurements and the wall materials are worked out again." : "";
  return { text: `${why} ${OWN_NUMBER}${measureWords}`, measure };
}

/**
 * A note stored on the quote at generation, as the new page shows it. Notes
 * that send the tradie to the classic "Takeoff assumptions" panel and its
 * Recalculate button say what to do on this page instead.
 */
export function plainNote(note: string, canMeasure: boolean): string {
  const instead = canMeasure
    ? "Change the measurements to work the wall materials out."
    : "Add the wall materials as lines yourself.";
  return note
    .replace(/\s*Enter (?:total )?wall (?:dimensions|length and height) in Takeoff assumptions,? (?:and|then) recalculate\.?/gi, ` ${instead}`)
    .trim();
}
