/**
 * Weather-impact rollout gate.
 *
 * Defaults ON. Setting NEXT_PUBLIC_T2Q_WEATHER_IMPACT=0 (client-visible) or
 * T2Q_WEATHER_IMPACT=0 (server) parks the feature for everyone EXCEPT the
 * owner, who always sees it — that's the owner-testing path the flag exists
 * for. Callers that gate NAVIGATION must use the same function so a parked
 * feature never leaves a reviewer-visible tab pointing at a locked screen
 * (App Store Guideline 2.1: no dead/placeholder surfaces).
 */
export function isWeatherImpactEnabled(isOwner: boolean) {
  return (
    isOwner ||
    (process.env.NEXT_PUBLIC_T2Q_WEATHER_IMPACT !== "0" &&
      process.env.T2Q_WEATHER_IMPACT !== "0")
  );
}
