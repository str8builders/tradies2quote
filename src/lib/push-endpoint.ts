/**
 * Web-push endpoints the server will later POST to. Only the browsers' own
 * push services, over https, at sane sizes — never an arbitrary host, so a
 * subscription can't be used to make the server call internal or attacker
 * URLs (audit 2026-09-15).
 */
const PUSH_HOSTS = [/(^|\.)push\.services\.mozilla\.com$/i, /(^|\.)googleapis\.com$/i, /(^|\.)notify\.windows\.com$/i, /(^|\.)push\.apple\.com$/i];

export function isPushServiceEndpoint(raw: string): boolean {
  if (raw.length > 2048) return false;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && !url.username && !url.password && PUSH_HOSTS.some((re) => re.test(url.hostname));
  } catch {
    return false;
  }
}
