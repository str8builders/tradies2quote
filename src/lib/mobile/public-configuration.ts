/** Publish only keys specifically intended for untrusted clients. */
export function isPublicSupabaseKey(key: string): boolean {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true;
  const parts = key.split(".");
  if (parts.length !== 3) return false;
  try { return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")).role === "anon"; }
  catch { return false; }
}
