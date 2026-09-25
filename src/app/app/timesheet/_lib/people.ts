/** A readable name from an email for a team member ("sione.t@x.nz" → "Sione T"). Pure. */
export function nameFromEmail(email: string | null | undefined): string {
  const local = (email ?? "").split("@")[0] ?? "";
  const words = local
    .split(/[._\-+]+/)
    .map((w) => w.replace(/\d+/g, ""))
    .filter(Boolean);
  if (words.length === 0) return "Team member";
  return words.map((w) => w[0].toLocaleUpperCase() + w.slice(1)).join(" ");
}
