/**
 * Validate a post-auth `next` redirect target.
 *
 * Only same-origin ABSOLUTE PATHS are allowed. Anything else — a full
 * URL (`https://evil.com`), a protocol-relative URL (`//evil.com`), a
 * backslash variant (`/\evil.com`), or an empty / missing value — falls
 * back to `/app`. This closes the open-redirect surface on the auth
 * callback route and the login action, both of which take `next` from
 * an untrusted query string / form field.
 */
export function safeNextPath(raw: unknown, fallback = "/app"): string {
  if (typeof raw !== "string") return fallback;
  const value = raw.trim();
  // Must be a root-relative path.
  if (!value.startsWith("/")) return fallback;
  // Reject protocol-relative (`//host`) and backslash (`/\host`)
  // variants — browsers treat both as off-site navigations.
  if (value.startsWith("//") || /[\\\x00-\x20]/.test(value)) return fallback;
  return value;
}
