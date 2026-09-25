// ─────────────────────────────────────────────────────────────────────────
// Human-readable recovery guidance for a BLOCKED takeoff line.
//
// A blocked line (takeoff_status === "blocked") means the deterministic
// calculator could not run because a required dimension was missing — by
// design we never guess it. This maps the scope (read off the line's
// "<scope> takeoff — needs dimensions…" description) to a plain-language
// sentence telling the tradie exactly what to enter and the obvious next
// actions. Pure + deterministic → unit-tested. No AI, no guessing.
// ─────────────────────────────────────────────────────────────────────────

/** Required-input phrasing per scope — mirrors validate.ts requirements. */
const SCOPE_NEEDS: Record<string, string> = {
  framing: "total wall length (m) and wall height (m)",
  wall: "total wall length (m) and wall height (m)",
  lining: "wall area (m²) — or wall length (m) and height (m)",
  // STRICT exterior-only rule: insulation is never sized off the total
  // wall run, so the unblock is exterior evidence specifically.
  insulation:
    "exterior-wall evidence — the exterior wall area (m²), or say the walls are exterior",
  concrete: "length (m) and width (m) — or volume (m³)",
  fixing: "run length (m) or perimeter (m)",
  deck: "deck length (m) and width (m)",
  subfloor: "floor length (m) and width (m)",
  cladding: "wall length (m) and height (m)",
  roofing: "roof area (m²) — or length (m) and width (m)",
  fencing: "fence length (m) or perimeter (m)",
};

/** Parse the scope from a blocked line's description ("framing takeoff — …"). */
export function blockedScopeFromDescription(description: string | null | undefined): string | null {
  const m = /^([a-z_]+)\s+takeoff/i.exec((description ?? "").trim());
  return m ? m[1].toLowerCase() : null;
}

/** A short, human recovery sentence for a blocked line. */
export function blockedLineGuide(description: string | null | undefined): string {
  const scope = blockedScopeFromDescription(description);

  // STRICT legacy insulation: the calculator emits a blocked
  // "Pink Batts Insulation" line (not the "<scope> takeoff —" form) when no
  // exterior wall length was given. The Takeoff assumptions panel has no
  // exterior-run field yet, so the honest recovery is explicit: supply the
  // exterior run via re-scan/regenerate, or type the count yourself.
  if (!scope && /insulation/i.test(description ?? "")) {
    return (
      "Insulation is quoted for exterior walls only and the exterior wall " +
      "run wasn't given, so it can't be calculated. Type the pack count " +
      "below yourself (it becomes your number, not a guess), re-scan the " +
      "plan with the exterior run marked, or remove the line."
    );
  }

  const needs = scope ? SCOPE_NEEDS[scope] : undefined;
  const label = scope ? `${scope.charAt(0).toUpperCase()}${scope.slice(1)}` : "This line";
  const tail =
    "Enter dimensions in “Takeoff assumptions” above and tap Recalculate, type a quantity below to keep it as a manual line, or remove it.";
  return needs ? `${label} needs: ${needs}. ${tail}` : `${label}: dimensions are missing. ${tail}`;
}
