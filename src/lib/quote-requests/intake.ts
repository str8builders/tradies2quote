import { samePhone } from "./phone";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { captureError } from "@/lib/observability";
import { sendPushToUser } from "@/lib/push";
import { sanitizeForPush } from "@/lib/moderation";
import { sendQuoteRequestEmail } from "@/lib/email-request";
import { consumeDailyQuota } from "@/lib/rate-limit";
import { resolveQuoteTextProvider } from "@/lib/llm/quote-text-provider";
import { resolveLocalLlmConfig } from "@/lib/llm/local-chat";
import { generateQuoteForUser } from "@/lib/quote-generation/run";

/**
 * Public "Request a quote" intake.
 *
 * A client fills in the tradie's public form; this module validates it,
 * creates the client record and a draft quote on the tradie's account,
 * records the request, notifies the tradie, and generates the quote.
 * Everything runs with the service-role client scoped explicitly to the
 * tradie's user id. Nothing here ever prices, sends, or accepts anything
 * on the tradie's behalf — the tradie still reviews and sends.
 */

export const REQUEST_LIMITS = {
  nameMin: 2,
  nameMax: 80,
  descriptionMin: 20,
  descriptionMax: 3000,
  addressMax: 200,
  phoneMax: 30,
  emailMax: 254,
  /** Requests per client IP per UTC day. */
  perIpPerDay: 10,
  /** Requests a single tradie can receive per UTC day. */
  perTradiePerDay: 40,
  /** Auto-generations per tradie per UTC day (AI spend guard). */
  generationsPerTradiePerDay: 30,
} as const;

export type CleanRequestInput = {
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  description: string;
  /** Honeypot field was filled → a bot; caller should pretend success. */
  honeypot: boolean;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function str(v: unknown): string {
  return typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim() : "";
}

export function validateRequestInput(
  raw: unknown,
): { ok: true; value: CleanRequestInput } | { ok: false; error: string } {
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const name = str(body.name).replace(/\s+/g, " ");
  const email = str(body.email).toLowerCase();
  const phone = str(body.phone).replace(/\s+/g, " ");
  const address = str(body.address).replace(/\s+/g, " ");
  const description = str(body.description).replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  const honeypot = str(body.website).length > 0;

  if (name.length < REQUEST_LIMITS.nameMin || name.length > REQUEST_LIMITS.nameMax) {
    return { ok: false, error: "Please tell us your name." };
  }
  if (email && (email.length > REQUEST_LIMITS.emailMax || !EMAIL_RE.test(email))) {
    return { ok: false, error: "That email address doesn't look right." };
  }
  if (phone && (phone.length < 6 || phone.length > REQUEST_LIMITS.phoneMax || !/^[+()\d\s-]+$/.test(phone))) {
    return { ok: false, error: "That phone number doesn't look right." };
  }
  if (!email && !phone) {
    return { ok: false, error: "Add a phone number or an email so the tradie can reach you." };
  }
  if (address.length > REQUEST_LIMITS.addressMax) {
    return { ok: false, error: "Keep the address under 200 characters." };
  }
  if (description.length < REQUEST_LIMITS.descriptionMin) {
    return { ok: false, error: "Tell us a bit more about the job (at least 20 characters)." };
  }
  if (description.length > REQUEST_LIMITS.descriptionMax) {
    return { ok: false, error: "Keep the description under 3000 characters." };
  }
  return {
    ok: true,
    value: {
      name,
      email: email || null,
      phone: phone || null,
      address: address || null,
      description,
      honeypot,
    },
  };
}

/**
 * What the AI quote pipeline sees. Client details lead so the model fills
 * the quote's client block; the job text is the client's own words.
 */
export function composeRequestTranscript(v: CleanRequestInput): string {
  const contact = [v.phone, v.email].filter(Boolean).join(", ");
  return [
    `Quote request from client ${v.name}${contact ? ` (${contact})` : ""}.`,
    v.address ? `Job address: ${v.address}.` : null,
    "Job description in the client's words:",
    v.description,
  ]
    .filter(Boolean)
    .join("\n");
}

export type TradieForRequests = {
  id: string;
  business_name: string | null;
  email: string | null;
};

export async function findTradieBySlug(
  admin: SupabaseClient<Database>,
  slug: string,
): Promise<TradieForRequests | null> {
  const { data } = await admin
    .from("profiles")
    .select("id, business_name, email")
    .eq("request_slug", slug)
    .maybeSingle();
  return data ?? null;
}

export type CreatedRequest = { requestId: string; quoteId: string; clientId: string };

export async function createQuoteRequest(opts: {
  admin: SupabaseClient<Database>;
  tradieUserId: string;
  input: CleanRequestInput;
  sourceIp: string | null;
  userAgent: string | null;
}): Promise<CreatedRequest> {
  const { admin, tradieUserId, input } = opts;

  // Reuse an existing client with the same email (or phone) so repeat
  // requests don't litter the tradie's client list.
  let clientId: string | null = null;
  if (input.email) {
    const { data } = await admin
      .from("clients")
      .select("id")
      .eq("user_id", tradieUserId)
      .ilike("email", input.email)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    clientId = data?.id ?? null;
  }
  if (!clientId && input.phone) {
    // Format-insensitive: "021 555 1234" and "+64 21 555 1234" are one client.
    const { data } = await admin
      .from("clients")
      .select("id, phone")
      .eq("user_id", tradieUserId)
      .not("phone", "is", null)
      .order("created_at", { ascending: true })
      .limit(500);
    clientId = (data ?? []).find((c) => samePhone(c.phone, input.phone))?.id ?? null;
  }
  if (!clientId) {
    const { data, error } = await admin
      .from("clients")
      .insert({
        user_id: tradieUserId,
        name: input.name,
        email: input.email,
        phone: input.phone,
        address: input.address,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`client insert failed: ${error?.message ?? "no row"}`);
    clientId = data.id;
  }

  const { data: quote, error: quoteError } = await admin
    .from("quotes")
    .insert({
      user_id: tradieUserId,
      client_id: clientId,
      voice_transcript: composeRequestTranscript(input),
      status: "draft",
    })
    .select("id")
    .single();
  if (quoteError || !quote) throw new Error(`quote insert failed: ${quoteError?.message ?? "no row"}`);

  const { data: request, error: requestError } = await admin
    .from("quote_requests")
    .insert({
      user_id: tradieUserId,
      quote_id: quote.id,
      client_id: clientId,
      client_name: input.name,
      client_email: input.email,
      client_phone: input.phone,
      site_address: input.address,
      description: input.description,
      status: "new",
      source_ip: opts.sourceIp,
      user_agent: opts.userAgent ? opts.userAgent.slice(0, 300) : null,
    })
    .select("id")
    .single();
  if (requestError || !request) throw new Error(`request insert failed: ${requestError?.message ?? "no row"}`);

  return { requestId: request.id, quoteId: quote.id, clientId };
}

async function tradieEmail(
  admin: SupabaseClient<Database>,
  tradie: TradieForRequests,
): Promise<string | null> {
  if (tradie.email && EMAIL_RE.test(tradie.email)) return tradie.email;
  const { data } = await admin.auth.admin.getUserById(tradie.id);
  const email = data?.user?.email ?? null;
  return email && EMAIL_RE.test(email) ? email : null;
}

export async function notifyTradieOfRequest(opts: {
  admin: SupabaseClient<Database>;
  tradie: TradieForRequests;
  input: CleanRequestInput;
  created: CreatedRequest;
  appUrl: string;
}): Promise<void> {
  const { admin, tradie, input, created, appUrl } = opts;
  const quoteUrl = `${appUrl.replace(/\/+$/, "")}/app/quotes/preview/${created.quoteId}`;
  const name = sanitizeForPush(input.name) || "A client";
  await sendPushToUser(tradie.id, {
    title: "New quote request",
    body: `${name}: ${input.description.slice(0, 90)}${input.description.length > 90 ? "…" : ""}`,
    url: `/app/quotes/preview/${created.quoteId}`,
    tag: `quote-request-${created.requestId}`,
  });
  try {
    const to = await tradieEmail(admin, tradie);
    if (to) {
      const sent = await sendQuoteRequestEmail({
        to,
        businessName: tradie.business_name ?? "your business",
        clientName: input.name,
        clientPhone: input.phone,
        clientEmail: input.email,
        siteAddress: input.address,
        description: input.description,
        quoteUrl,
      });
      if (!sent.ok) console.warn("[quote-request] email not sent:", sent.error);
    }
  } catch (e) {
    captureError(e, { route: "quote-requests/notify" });
  }
}

/**
 * Generate the draft quote for a request. Never throws; the request row
 * records the outcome so the tradie's list shows what happened.
 */
export async function runRequestGeneration(opts: {
  admin: SupabaseClient<Database>;
  tradie: TradieForRequests;
  created: CreatedRequest;
  clientName: string;
}): Promise<"generated" | "skipped" | "failed"> {
  const { admin, tradie, created } = opts;
  const setStatus = async (
    status: "generated" | "generation_failed",
    errorMessage: string | null,
  ) => {
    await admin
      .from("quote_requests")
      .update({
        status,
        error_message: errorMessage,
        generated_at: status === "generated" ? new Date().toISOString() : null,
      })
      .eq("id", created.requestId)
      .eq("user_id", tradie.id);
  };

  const textProvider = resolveQuoteTextProvider();
  try {
    if (!textProvider) throw new Error("no quote text provider configured");
    if (textProvider === "local") resolveLocalLlmConfig();
  } catch {
    await setStatus("generation_failed", "Quote generation is not configured.");
    return "skipped";
  }

  const quota = consumeDailyQuota(
    `request-gen:${tradie.id}`,
    REQUEST_LIMITS.generationsPerTradiePerDay,
  );
  if (!quota.ok) {
    await setStatus("generation_failed", "Daily auto-generation limit reached; generate from the draft.");
    return "skipped";
  }

  try {
    const result = await generateQuoteForUser({
      db: admin,
      userId: tradie.id,
      quoteId: created.quoteId,
      textProvider,
      asAdmin: true,
    });
    if (!result.ok) {
      const message =
        typeof result.body.error === "string" ? result.body.error : `generation failed (${result.status})`;
      await setStatus("generation_failed", message.slice(0, 300));
      return "failed";
    }
    await setStatus("generated", null);
    const name = sanitizeForPush(opts.clientName) || "a client";
    await sendPushToUser(tradie.id, {
      title: "Draft quote ready",
      body: `The quote for ${name} is drafted — review and send.`,
      url: `/app/quotes/preview/${created.quoteId}`,
      tag: `quote-request-ready-${created.requestId}`,
    });
    return "generated";
  } catch (e) {
    captureError(e, { route: "quote-requests/generate" });
    await setStatus("generation_failed", e instanceof Error ? e.message.slice(0, 300) : "generation failed");
    return "failed";
  }
}
