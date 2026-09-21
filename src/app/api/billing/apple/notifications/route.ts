import { NextResponse } from "next/server";
import { receiveAppleNotification } from "@/lib/billing/apple";
import { MobileError } from "@/lib/mobile/contracts";
import { captureError } from "@/lib/observability";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (raw.length > 132000) return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
    let body: { signedPayload?: unknown };
    try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
    if (typeof body?.signedPayload !== "string") return NextResponse.json({ error: "missing_payload" }, { status: 400 });
    await receiveAppleNotification(body.signedPayload);
    return NextResponse.json({ ok: true });
  } catch (error) {
    // Do not log signed payloads, transaction tokens or private keys.
    captureError(new Error("Apple notification could not be reconciled"), { route: "billing/apple/notifications" });
    return NextResponse.json({ error: "notification_not_processed" }, { status: error instanceof MobileError ? error.status : 503 });
  }
}
