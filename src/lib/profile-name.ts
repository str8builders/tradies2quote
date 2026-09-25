/**
 * The first name on a profile (new look round two): the greeting's name
 * ("Good morning, Challis"). Pure; shared by the save action, the field and
 * the top bar.
 */

export const FIRST_NAME_MAX = 40;

export type FirstNameResult = { ok: true; value: string | null } | { ok: false; error: string };

/**
 * Tidy what was typed: trim, collapse inner spaces, drop control characters.
 * Blank means "no name" (null). Longer than 40 characters is refused.
 */
export function normalizeFirstName(raw: unknown): FirstNameResult {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false, error: "That isn't a name." };
  const value = raw
    .replace(/[\p{Cc}\p{Cf}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!value) return { ok: true, value: null };
  if ([...value].length > FIRST_NAME_MAX) {
    return { ok: false, error: `Keep it to ${FIRST_NAME_MAX} characters.` };
  }
  return { ok: true, value };
}

/**
 * Who the greeting is for: your first name, else your business name, else
 * nobody (the greeting stands alone). A business name is used whole
 * ("STR8 Builders"), never cut down to a guessed first name.
 */
export function greetingName({
  firstName,
  businessName,
}: {
  firstName: string | null | undefined;
  businessName: string | null | undefined;
}): string | null {
  const first = normalizeFirstName(firstName ?? null);
  if (first.ok && first.value) return first.value;
  const business = (businessName ?? "").replace(/\s+/g, " ").trim();
  return business || null;
}

/** The letter in the avatar when there's no photo: name, else email, else "?". */
export function avatarLetter(name: string | null | undefined, email: string | null | undefined): string {
  const source = (name ?? "").trim() || (email ?? "").trim();
  const letter = [...source][0] ?? "";
  return letter ? letter.toLocaleUpperCase() : "?";
}
