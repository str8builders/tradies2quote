import { type NextRequest, NextResponse } from "next/server";
import { captureError } from "@/lib/observability";
import { adminClient } from "@/lib/supabase/admin";
import { uploadSignature } from "@/lib/quote-storage";
import { sendPushToUser } from "@/lib/push";
import { sanitizeForPush } from "@/lib/moderation";
import { quoteNumber } from "@/lib/quote-defaults";
import { consumeDailyQuota, tooManyRequestsResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SIGNATURE_BYTES = 1 * 1024 * 1024; // 1MB
const SIGNATURE_PREFIX = "data:image/png;base64,";

type Params = { token: string };

type AcceptBody = {
  name?: unknown;
  email?: unknown;
  signature?: unknown;
  accepted?: unknown;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clientIp(request: NextRequest): string | null {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  return null;
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<Params> },
) {
  const { token } = await ctx.params;

  // Per-IP fixed-window guard (UTC day). Generous cap so corporate-NAT /
  // one-office-many-customers traffic isn't throttled; it only trips on a
  // scripted replay loop hammering this endpoint.
  const ipForLimit = clientIp(request) ?? "unknown";
  const acceptQuota = consumeDailyQuota(`quote-accept:${ipForLimit}`, 60);
  if (!acceptQuota.ok) {
    return tooManyRequestsResponse(acceptQuota.resetAt);
  }

  let body: AcceptBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const signature = typeof body.signature === "string" ? body.signature : "";
  const accepted = body.accepted === true;

  if (!accepted) {
    return NextResponse.json({ error: "consent_required" }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: "name_required" }, { status: 400 });
  }
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "email_invalid" }, { status: 400 });
  }
  if (!signature) {
    return NextResponse.json({ error: "signature_required" }, { status: 400 });
  }
  if (!signature.startsWith(SIGNATURE_PREFIX)) {
    return NextResponse.json(
      { error: "signature_invalid_format" },
      { status: 400 },
    );
  }

  const base64 = signature.slice(SIGNATURE_PREFIX.length);
  let signatureBytes: Buffer;
  try {
    signatureBytes = Buffer.from(base64, "base64");
  } catch {
    return NextResponse.json({ error: "signature_decode_failed" }, { status: 400 });
  }
  if (signatureBytes.length === 0) {
    return NextResponse.json({ error: "signature_empty" }, { status: 400 });
  }
  if (signatureBytes.length > MAX_SIGNATURE_BYTES) {
    return NextResponse.json({ error: "signature_too_large" }, { status: 413 });
  }
  // PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
  const isPng =
    signatureBytes[0] === 0x89 &&
    signatureBytes[1] === 0x50 &&
    signatureBytes[2] === 0x4e &&
    signatureBytes[3] === 0x47;
  if (!isPng) {
    return NextResponse.json(
      { error: "signature_not_png" },
      { status: 400 },
    );
  }

  const admin = adminClient();
  const { data: quoteRaw } = await admin
    .from("quotes")
    .select(
      "id, status, expires_at, total_amount, accepted_quote_version, user_id, created_at",
    )
    .eq("public_token", token)
    .maybeSingle();
  const quote = quoteRaw as
    | {
        id: string;
        status: string;
        expires_at: string | null;
        total_amount: number | null;
        accepted_quote_version: number | null;
        user_id: string;
        created_at: string;
      }
    | null;
  if (!quote) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (quote.expires_at && new Date(quote.expires_at) < new Date()) {
    return NextResponse.json({ error: "expired" }, { status: 410 });
  }
  if (quote.status === "accepted") {
    return NextResponse.json({ error: "already_accepted" }, { status: 409 });
  }
  if (quote.status === "declined") {
    return NextResponse.json({ error: "declined" }, { status: 409 });
  }

  let signaturePath: string;
  try {
    signaturePath = await uploadSignature(
      quote.id,
      new Uint8Array(signatureBytes),
    );
  } catch (e) {
    captureError(e, { route: "quote/accept" });
    console.error("Signature upload failed", e);
    return NextResponse.json(
      { error: "signature_upload_failed" },
      { status: 500 },
    );
  }

  const ip = clientIp(request);
  const userAgent = request.headers.get("user-agent");
  const total = Number(quote.total_amount) || 0;
  const version = Number(quote.accepted_quote_version) || 1;

  const { data: rpcResult, error: rpcErr } = await admin.rpc(
    "accept_quote",
    {
      p_token: token,
      p_name: name,
      p_email: email,
      p_signature_path: signaturePath,
      p_ip: ip,
      p_user_agent: userAgent,
      p_total: total,
      p_version: version,
    } as never,
  );
  if (rpcErr) {
    console.error("accept_quote RPC failed", rpcErr);
    return NextResponse.json({ error: "accept_failed" }, { status: 500 });
  }
  const result = rpcResult as { ok?: boolean; error?: string };
  if (result?.error) {
    // The signature was uploaded before the RPC ran, so a reject here
    // (expired / already_accepted, e.g. a replay) leaves an orphan in
    // storage. Best-effort delete it; a storage hiccup must not turn a
    // correct 409/410 into a 500, so swallow any delete error.
    try {
      await admin.storage.from("signatures").remove([signaturePath]);
    } catch (cleanupErr) {
      console.error("orphaned signature cleanup failed", cleanupErr);
    }
    const status =
      result.error === "expired"
        ? 410
        : result.error === "already_accepted"
          ? 409
          : 404;
    return NextResponse.json({ error: result.error }, { status });
  }

  // Notify the quote owner via push that their quote was just accepted.
  // sendPushToUser never throws and no-ops when push isn't configured, so
  // this can't break the customer's accept flow.
  // The name is anonymous free text off the public accept form — sanitise
  // before it becomes an OS-level notification banner on the tradie's phone
  // (strips newlines/control chars, caps length).
  await sendPushToUser(quote.user_id, {
    title: "Quote accepted",
    body: `${sanitizeForPush(name) || "Your client"} accepted ${quoteNumber(quote.id, quote.created_at)}`,
    url: `/app/quotes/preview/${quote.id}`,
    tag: `quote-accepted-${quote.id}`,
  });

  return NextResponse.json({ ok: true });
}
