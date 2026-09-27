/**
 * The site's public origin (https://tradies2quote.com) for redirects built on
 * the server.
 *
 * Behind Caddy, Next builds `request.url` from the address it listens on
 * (https://localhost:3001), so a redirect made from `request.url` sends people
 * to a dead page — sign-out and every email link (confirm, reset password) did
 * exactly that. NEXT_PUBLIC_APP_URL is the source of truth (the proxy already
 * uses it); the forwarded host is the fallback for local development.
 */
export function publicOrigin(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      /* fall through to the request */
    }
  }
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host) {
    const proto = (request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol).replace(/:$/, "");
    try {
      return new URL(`${proto}://${host}`).origin;
    } catch {
      /* fall through to the request */
    }
  }
  return new URL(request.url).origin;
}

/** An absolute URL on the public site, e.g. publicUrl("/login", request). */
export function publicUrl(path: string, request: Request): URL {
  return new URL(path, publicOrigin(request));
}
