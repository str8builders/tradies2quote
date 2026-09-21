import "server-only";
import { verifyApplePurchase } from "@/lib/billing/apple";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { captureError } from "@/lib/observability";
import { getSubscriptionStatus, canWrite } from "@/lib/subscription";
import { hasAiConsent, AI_CONSENT_VERSION } from "@/lib/ai-consent";
import { consumeFixedWindow } from "@/lib/rate-limit";
import { recordAiConsentAction, withdrawAiConsentAction } from "@/app/app/quotes/new/ai-consent-actions";
import { uploadBusinessLogoAction, removeBusinessLogoAction } from "@/app/app/settings/logo-actions";
import { bulkDeleteInvoices } from "@/app/app/invoices/actions";
import { saveSettings } from "@/app/app/settings/actions";
import { enableQuoteRequestLink, disableQuoteRequestLink, rotateQuoteRequestLink } from "@/app/app/settings/request-link-actions";
import { saveQuoteChanges, confirmDimensions, acceptQuote, declineQuote, scheduleJob, markInProgress, markComplete, createInvoiceFromQuote, markInvoicePaid } from "@/app/app/quotes/preview/[id]/actions";
import { archiveQuote, unarchiveQuote, softDeleteQuote } from "@/app/app/quotes/actions";
import { addCalendarNote, updateCalendarNote, deleteCalendarNote } from "@/app/app/_components/calendar-notes-actions";
import { setQuoteRequestDismissed } from "@/app/app/requests/actions";
import { createMaterial, updateMaterial, deleteMaterial, importMaterials, importSupplierQuoteItems, createQuoteFromScan } from "@/app/app/materials/actions";
import { saveKit, deleteKit } from "@/app/app/materials/kits/actions";
import { saveSupplierMaterial } from "@/app/app/suppliers/actions";
import { isPublicSupabaseKey } from "./public-configuration";
import { mobileCapabilities } from "./capabilities";
import { readCollection } from "./collections";
import { MobileError, record, uuid, text, quoteData, formData } from "./contracts";

const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });

async function body(request: NextRequest) {
  const raw = await request.text();
  if (raw.length > 2_000_000) throw new MobileError(413, "This request is too large.");
  try { return record(JSON.parse(raw)); } catch (e) { if (e instanceof MobileError) throw e; throw new MobileError(400, "Invalid JSON request."); }
}

async function action(operation: () => Promise<unknown>) {
  try {
    const result = await operation();
    if (result && typeof result === "object") {
      const value = result as Record<string, unknown>;
      if (value.error || value.ok === false || value.status === "error") return json(result, value.code === "PT409" ? 409 : 400);
    }
    return json(result ?? { ok: true });
  } catch (e) {
    // Existing material actions navigate after a successful commit. Only their
    // known success destination is translated; login/errors are never success.
    const digest = e && typeof e === "object" && "digest" in e ? String(e.digest) : "";
    if (/^NEXT_REDIRECT;[^;]+;\/app\/materials;30[378];$/.test(digest)) return json({ ok: true });
    throw e;
  }
}

export async function dispatchMobile(request: NextRequest, path: string[]) {
  try {
    const route = path.join("/");
    if (request.method === "GET" && route === "configuration") {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
      if (!url || !key || !isPublicSupabaseKey(key) || key === process.env.SUPABASE_SERVICE_ROLE_KEY) throw new MobileError(503, "Account service is unavailable.");
      return json({ supabaseURL: url, supabasePublishableKey: key, ...mobileCapabilities() });
    }
    if (!/^Bearer [A-Za-z0-9._~-]+$/i.test(request.headers.get("authorization") ?? "")) throw new MobileError(401, "Sign in to continue.", "unauthorized");
    const db = await createClient();
    const { data: { user }, error: authError } = await db.auth.getUser();
    if (authError || !user) throw new MobileError(401, "Your session has expired. Sign in again.", "unauthorized");
    if (!consumeFixedWindow(`mobile:${user.id}`, 240, 60000).ok) throw new MobileError(429, "Please wait a minute and try again.");

    if (route === "business-logo") {
      if (request.method === "POST") {
        if (Number(request.headers.get("content-length")) > 8_500_000) throw new MobileError(413, "Choose a logo smaller than 8 MB.");
        const form = await request.formData();
        return await action(() => uploadBusinessLogoAction(form));
      }
      if (request.method === "DELETE") return await action(removeBusinessLogoAction);
      throw new MobileError(405, "Unsupported method.");
    }
    if (request.method === "GET") {
      if (route === "account") {
        const [profile, entitlement, consented, deletion] = await Promise.all([
          db.from("profiles").select("*").eq("id", user.id).maybeSingle(),
          getSubscriptionStatus({ userId: user.id, signedUpAt: new Date(user.created_at), email: user.email }),
          hasAiConsent(db, user.id),
          db.from("account_deletion_requests" as never).select("user_id").eq("user_id", user.id).maybeSingle(),
        ]);
        if (profile.error) throw profile.error;
        if (deletion.error) throw deletion.error;
        return json({ id: user.id, email: user.email, profile: profile.data ?? {}, entitlement, consented, deletionPending: Boolean(deletion.data), capabilities: mobileCapabilities() });
      }
      if (route === "dashboard") {
        const [quotes, invoices, requests] = await Promise.all([
          db.from("quotes").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("deleted_at", null),
          db.from("invoices").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("deleted_at", null),
          db.from("quote_requests").select("id", { count: "exact", head: true }).eq("user_id", user.id).neq("status", "dismissed"),
        ]);
        for (const result of [quotes, invoices, requests]) if (result.error) throw result.error;
        return json({ quotes: quotes.count, invoices: invoices.count, requests: requests.count });
      }
      if (path.length <= 2) return json(await readCollection(path[0], user.id, request.nextUrl.searchParams, path[1]));
    }

    if (!["POST", "PATCH", "DELETE"].includes(request.method)) throw new MobileError(405, "Unsupported method.");
    const input = await body(request);
    if (route === "billing/apple/verify" && request.method === "POST") return json(await verifyApplePurchase(user.id, text(input.signedTransaction, 64000, true)));
    if (route === "consent") {
      if (input.granted === false) return await action(withdrawAiConsentAction);
      if (input.granted !== true || input.version !== AI_CONSENT_VERSION) throw new MobileError(400, "Review the current AI disclosure first.");
      return await action(recordAiConsentAction);
    }
    if (route === "profile") return await action(() => saveSettings({ status: "idle" }, formData(input)));
    if (route === "request-link") {
      if (input.action === "enable") return await action(enableQuoteRequestLink);
      if (input.action === "disable") return await action(disableQuoteRequestLink);
      if (input.action === "rotate") return await action(rotateQuoteRequestLink);
    }
    if (route === "quotes" && request.method === "POST") {
      const entitlement = await getSubscriptionStatus({ userId: user.id, signedUpAt: new Date(user.created_at), email: user.email });
      if (!canWrite(entitlement)) throw new MobileError(402, "Choose a subscription to create a quote.", "subscription_required");
      const id = uuid(input.operationID);
      const transcript = text(input.transcript, 30000);
      const draft = input.quote_data ? quoteData(input.quote_data) : null;
      if (!draft && !transcript) throw new MobileError(400, "Describe the job or add a quote line.");
      const result = await db.rpc("create_quote_atomic", { p_quote_id: id, p_transcript: transcript, p_data: draft });
      if (result.error) {
        const status = result.error.code === "23505" ? 409 : result.error.code === "22023" ? 400 : 503;
        throw new MobileError(status, status === 409 ? "This draft identifier was already used. Refresh your quotes before retrying." : "Could not confirm the saved draft. Refresh before retrying.");
      }
      return json(result.data, result.data?.alreadySaved ? 200 : 201);
    }
    if (path[0] === "quotes" && path.length === 3) {
      const id = uuid(path[1]);
      switch (path[2]) {
        case "dimensions": {
          const revision = uuid(input.expectedRevision);
          if (!Array.isArray(input.edits) || input.edits.length > 12) throw new MobileError(400, "Review each dimension before confirming.");
          const edits = input.edits.map(raw => {
            const edit = record(raw);
            if (typeof edit.value !== "number" || !Number.isFinite(edit.value) || edit.value <= 0 || edit.value > 1e6) throw new MobileError(400, "Dimensions must be positive numbers.");
            return { key: text(edit.key, 64, true), value: edit.value };
          });
          const { data: current, error } = await db.from("quotes").select("quote_data").eq("id", id).eq("user_id", user.id).is("deleted_at", null).maybeSingle();
          if (error) throw error;
          if (!current) throw new MobileError(404, "Quote not found.");
          return await action(() => confirmDimensions(id, quoteData(current.quote_data), edits, revision));
        }
        case "save": return await action(() => saveQuoteChanges(id, quoteData(input.quote_data), uuid(input.expectedRevision), text(input.transcript, 30000)));
        case "accept": return await action(() => acceptQuote(id));
        case "decline": return await action(() => declineQuote(id));
        case "schedule": {
          const date = text(input.date, 10, true);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) throw new MobileError(400, "Choose a valid date.");
          return await action(() => scheduleJob(id, date));
        }
        case "start": return await action(() => markInProgress(id));
        case "complete": return await action(() => markComplete(id));
        case "invoice": return await action(() => createInvoiceFromQuote(id));
        case "archive": return await action(() => archiveQuote(id));
        case "restore": return await action(() => unarchiveQuote(id));
        case "delete": return await action(() => softDeleteQuote(id));
      }
    }
    if (path[0] === "invoices" && path.length === 3 && path[2] === "paid") return await action(() => markInvoicePaid(uuid(path[1])));
    if (path[0] === "requests" && path.length === 2) {
      if (typeof input.dismissed !== "boolean") throw new MobileError(400, "Choose dismiss or restore.");
      return await action(() => setQuoteRequestDismissed(uuid(path[1]), input.dismissed as boolean));
    }
    if (path[0] === "notes") {
      if (request.method === "DELETE") return await action(() => deleteCalendarNote(uuid(path[1])));
      if (path[1]) return await action(() => updateCalendarNote(uuid(path[1]), text(input.body, 500, true)));
      return await action(() => addCalendarNote(text(input.date, 10, true), text(input.body, 500, true)));
    }
    if (path[0] === "materials") {
      if (path[1] === "import") return await action(() => importMaterials(input.rows as Parameters<typeof importMaterials>[0]));
      if (path[1] === "import-supplier") return await action(() => importSupplierQuoteItems(input.rows as Parameters<typeof importSupplierQuoteItems>[0], input.meta as Parameters<typeof importSupplierQuoteItems>[1]));
      if (path[1] === "scan-quote") return await action(() => createQuoteFromScan(input.lines as Parameters<typeof createQuoteFromScan>[0], input.meta as Parameters<typeof createQuoteFromScan>[1]));
      const form = formData(input);
      if (path[1]) form.set("id", uuid(path[1]));
      if (request.method === "DELETE") return await action(() => deleteMaterial({ ok: true }, form));
      if (path[1]) return await action(() => updateMaterial({ ok: true }, form));
      return await action(() => createMaterial({ ok: true }, form));
    }
    if (path[0] === "invoices" && path[2] === "delete") return await action(() => bulkDeleteInvoices([uuid(path[1])]));
    if (route === "supplier-material") return await action(() => saveSupplierMaterial(input as Parameters<typeof saveSupplierMaterial>[0]));
    if (path[0] === "kits") {
      if (request.method === "DELETE") return await action(() => deleteKit(uuid(path[1])));
      return await action(() => saveKit(input as Parameters<typeof saveKit>[0]));
    }
    throw new MobileError(404, "This operation is not available.");
  } catch (error) {
    if (error instanceof MobileError) return json({ error: error.code, message: error.message }, error.status);
    captureError(error, { route: "api/mobile/v1" });
    return json({ error: "service_unavailable", message: "We could not confirm the result. Refresh before retrying to check whether it was saved." }, 503);
  }
}
