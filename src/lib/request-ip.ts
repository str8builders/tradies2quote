/** Best-effort client IP for rate-limit keys, behind Caddy (first x-forwarded-for hop). */
export function requestIp(request: { headers: { get(name: string): string | null } }): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}
