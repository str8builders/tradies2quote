import { isStaleDeployError, reloadForUpdate } from "@/lib/stale-deploy";

/** The words for a step or a save that never came back. */
export const NO_CONNECTION = "No connection. Check your signal and try again.";

/**
 * What a sheet says when a server action threw. After an update, a page
 * that was already open still calls the previous version's actions ("Server
 * Action … was not found"). That isn't the tradie's signal, and every retry
 * would fail the same way, so the new version loads (reloadForUpdate, as the
 * timesheet's clock does) and the sheet says so. Anything else is the
 * connection: `offline` is said instead.
 *
 * `later` gets whatever reloadForUpdate says afterwards, when it couldn't
 * reload (it only just did): the sheet has already shown the first message,
 * so the page shows the next one itself.
 */
export function actionThrew(
  error: unknown,
  offline: string,
  later: (message: string) => void,
  reload: typeof reloadForUpdate = reloadForUpdate,
): { error: string } {
  if (!isStaleDeployError(error)) return { error: offline };
  const said: string[] = [];
  reload((message) => {
    if (said.length === 0) said.push(message);
    else later(message);
  }, error);
  return { error: said[0] ?? offline };
}
