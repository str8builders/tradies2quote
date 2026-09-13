import { after, NextResponse, type NextRequest } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { captureError } from "@/lib/observability";
import { isLinkPreviewBot } from "@/lib/bot-detection";
import { consumeDailyQuota, tooManyRequestsResponse } from "@/lib/rate-limit";
import { moderateChatText } from "@/lib/moderation";
import { canWrite, getSubscriptionStatus } from "@/lib/subscription";
import { isValidRequestSlug } from "@/lib/quote-requests/slug";
import {
  REQUEST_LIMITS,
  createQuoteRequest,
  findTradieBySlug,
  notifyTradieOfRequest,
  runRequestGeneration,
  validateRequestInput,
} from "@/lib/quote-requests/intake";
import {
  MAX_PHOTO_BYTES,
  MAX_REQUEST_PHOTOS,
  describePhotosIntoTranscript,
  storeRequestPhotos,
  type IncomingPhoto,
} from "@/lib/quote-requests/photos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Generation runs after the response; give it the same budget as the
// tradie-facing generate route.
export const maxDuration = 300;

const MAX_BODY_BYTES = 64 * 1024;
const MAX_MULTIPART_BYTES = MAX_REQUEST_PHOTOS * MAX_PHOTO_BYTES + 256 * 1024;

/**
 * The form posts JSON when there are no photos and multipart when there
 * are. Both shapes normalise to the same fields; photos ride alongside.
 */
async function readSubmission(
  request: NextRequest,
): Promise<{ fields: unknown; photos: IncomingPhoto[] } | null> {
  const type = request.headers.get("content-type") ?? "";
  if (type.startsWith("multipart/form-data")) {
    if (Number(request.headers.get("content-length")) > MAX_MULTIPART_BYTES) return null;
    const form = await request.formData();
    const text = (key: string) => {
      const v = form.get(key);
      return typeof v === "string" ? v : "";
    };
    const fields = {
      name: text("name"),
      phone: text("phone"),
      email: text("email"),
      address: text("address"),
      description: text("description"),
      website: text("website"),
    };
    const photos: IncomingPhoto[] = [];
    for (const entry of form.getAll("photos").slice(0, MAX_REQUEST_PHOTOS)) {
      if (!(entry instanceof File) || entry.size === 0 || entry.size > MAX_PHOTO_BYTES) continue;
      photos.push({ bytes: new Uint8Array(await entry.arrayBuffer()), name: entry.name });
    }
    return { fields, photos };
  }
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) return null;
  return { fields: await request.json(), photos: [] };
}

function clientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || null;
  return request.headers.get("x-real-ip");
}

function appUrl(request: NextRequest): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin).replace(/\/+$/, "");
}

/** Defer work until after the response; run inline where `after` is unavailable (tests). */
function deferred(job: () => Promise<unknown>): void {
  try {
    after(job);
  } catch {
    void job();
  }
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  if (!isValidRequestSlug(slug)) {
    return NextResponse.json({ error: "This request link isn't active." }, { status: 404 });
  }
  if (isLinkPreviewBot(request.headers.get("user-agent"))) {
    return NextResponse.json({ error: "Not available." }, { status: 403 });
  }

  const ip = clientIp(request) ?? "unknown";
  const ipQuota = consumeDailyQuota(`quote-request:${ip}`, REQUEST_LIMITS.perIpPerDay);
  if (!ipQuota.ok) return tooManyRequestsResponse(ipQuota.resetAt);

  let submission: { fields: unknown; photos: IncomingPhoto[] } | null;
  try {
    submission = await readSubmission(request);
  } catch {
    return NextResponse.json({ error: "Please fill in the form and try again." }, { status: 400 });
  }
  if (!submission) {
    return NextResponse.json({ error: "That request is too large." }, { status: 413 });
  }
  const validated = validateRequestInput(submission.fields);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }
  const input = validated.value;

  const admin = adminClient();
  const tradie = await findTradieBySlug(admin, slug);
  if (!tradie) {
    return NextResponse.json({ error: "This request link isn't active." }, { status: 404 });
  }

  // Honeypot filled → a bot. Pretend it worked so it stops trying.
  if (input.honeypot) return NextResponse.json({ ok: true });

  const tradieQuota = consumeDailyQuota(
    `quote-requests:${tradie.id}`,
    REQUEST_LIMITS.perTradiePerDay,
  );
  if (!tradieQuota.ok) {
    return NextResponse.json(
      { error: "This tradie's request box is full for today. Please try again tomorrow." },
      { status: 429 },
    );
  }

  const verdict = await moderateChatText(input.description, "inbound");
  if (!verdict.allowed) {
    return NextResponse.json(
      { error: "We couldn't send that description. Please describe the job you need done." },
      { status: 400 },
    );
  }

  let created;
  try {
    created = await createQuoteRequest({
      admin,
      tradieUserId: tradie.id,
      input,
      sourceIp: ip === "unknown" ? null : ip,
      userAgent: request.headers.get("user-agent"),
    });
  } catch (e) {
    captureError(e, { route: "api/requests" });
    return NextResponse.json(
      { error: "Something went wrong saving your request. Please try again." },
      { status: 503 },
    );
  }

  const base = appUrl(request);
  const clientName = input.name;
  const photos = submission.photos;

  deferred(async () => {
    try {
      await notifyTradieOfRequest({ admin, tradie, input, created, appUrl: base });
    } catch (e) {
      captureError(e, { route: "quote-requests/notify" });
    }
    // Client photos: store them on the draft, then let the vision agent
    // describe them into the transcript before the quote is generated.
    if (photos.length > 0) {
      try {
        const stored = await storeRequestPhotos({
          admin,
          tradieUserId: tradie.id,
          quoteId: created.quoteId,
          photos,
        });
        await describePhotosIntoTranscript({
          admin,
          tradieUserId: tradie.id,
          quoteId: created.quoteId,
          photos: stored,
        });
      } catch (e) {
        captureError(e, { route: "quote-requests/photos" });
      }
    }
    // Generation only while the tradie's account can create quotes; an
    // expired trial still receives the request and can generate later.
    try {
      const { data } = await admin.auth.admin.getUserById(tradie.id);
      const sub = await getSubscriptionStatus({
        userId: tradie.id,
        signedUpAt: new Date(data?.user?.created_at ?? Date.now()),
        email: data?.user?.email ?? undefined,
      });
      if (!canWrite(sub)) {
        await admin
          .from("quote_requests")
          .update({ status: "generation_failed", error_message: "Subscription inactive; generate from the draft." })
          .eq("id", created.requestId)
          .eq("user_id", tradie.id);
        return;
      }
      await runRequestGeneration({ admin, tradie, created, clientName });
    } catch (e) {
      captureError(e, { route: "quote-requests/generate" });
    }
  });

  return NextResponse.json({ ok: true, business: tradie.business_name ?? null });
}
