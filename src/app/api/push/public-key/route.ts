import { NextResponse } from "next/server";
import { VAPID_PUBLIC_KEY } from "@/lib/push";

// Pulls in src/lib/push.ts, which pulls in "web-push" and (via apns.ts)
// node:http2 — neither is edge-compatible.
export const runtime = "nodejs";

/**
 * The public VAPID key the server actually signs with — safe to expose (see
 * the comment on VAPID_PUBLIC_KEY in src/lib/push.ts). The client fetches
 * this instead of hard-coding its own copy, so there is exactly one source
 * of truth: whatever the server is configured with right now (audit finding
 * 3 — the client used to hard-code a fallback key that had drifted from the
 * server's, so every push silently failed with a 403 while the switch still
 * said "on").
 */
export async function GET() {
  return NextResponse.json({ key: VAPID_PUBLIC_KEY });
}
