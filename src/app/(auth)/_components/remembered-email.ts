/**
 * The email typed on the sign-in or sign-up form, kept in this tab's
 * sessionStorage for a few minutes.
 *
 * Right after an update, a sign-in page that was already open calls a
 * server action the new server doesn't know; the error boundary reloads the
 * page (see src/lib/staleDeploy.ts) and the typed email used to vanish with
 * it. It also comes back after a failed attempt. Never the password.
 */

export const REMEMBERED_EMAIL_KEY = "t2q-auth-email";
/** Long enough for a reload or a retry, short enough not to linger. */
export const REMEMBERED_EMAIL_MAX_AGE_MS = 15 * 60 * 1000;

type Stored = { email: string; at: number };

function storage(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null; // storage blocked (private mode, embedded webview settings)
  }
}

/** Keep what was typed in the email field (blank or junk clears it). */
export function rememberEmail(value: unknown, now: number = Date.now()): void {
  const store = storage();
  if (!store) return;
  try {
    const email = typeof value === "string" ? value.trim() : "";
    if (!email || email.length > 254 || !email.includes("@")) {
      store.removeItem(REMEMBERED_EMAIL_KEY);
      return;
    }
    store.setItem(REMEMBERED_EMAIL_KEY, JSON.stringify({ email, at: now } satisfies Stored));
  } catch {
    /* full or blocked: nothing to keep */
  }
}

/** The email typed in this tab in the last few minutes, or "". */
export function recallEmail(now: number = Date.now()): string {
  const store = storage();
  if (!store) return "";
  try {
    const raw = store.getItem(REMEMBERED_EMAIL_KEY);
    if (!raw) return "";
    const saved = JSON.parse(raw) as Partial<Stored>;
    const fresh =
      typeof saved.email === "string" &&
      typeof saved.at === "number" &&
      saved.at <= now &&
      now - saved.at <= REMEMBERED_EMAIL_MAX_AGE_MS;
    if (!fresh) {
      store.removeItem(REMEMBERED_EMAIL_KEY);
      return "";
    }
    return saved.email as string;
  } catch {
    return "";
  }
}

/** Put the remembered email back into an empty email field. */
export function restoreEmailInto(input: HTMLInputElement | null): void {
  if (!input || input.value) return;
  const email = recallEmail();
  if (email) input.value = email;
}
