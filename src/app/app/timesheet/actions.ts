"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { captureError } from "@/lib/observability";
import { resolveTaxLabel, resolveTaxRate } from "@/lib/quote-defaults";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { NOTE_MAX, workedTime } from "@/lib/timesheet/hours";
import { buildTimesheetInvoice, type BillableEntry } from "@/lib/timesheet/invoice";
import { addDays, parseDayKey, weekLabel, weekStart as mondayOf } from "@/lib/timesheet/week";
import { businessOwnerFor } from "./_lib/load";
import { nameFromEmail } from "./_lib/people";

export type TimesheetResult = { ok: true } | { ok: false; error: string };
export type InvoiceResult = { ok: true; quoteId: string } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PATH = "/app/timesheet";

async function signedIn() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export interface EntryInput {
  id?: string | null;
  workDate: string;
  start: string;
  finish: string;
  breakMinutes: number;
  clientId?: string | null;
  /** A new client typed on the sheet: saved to the business's client book first. */
  newClientName?: string | null;
  note?: string | null;
}

/**
 * Add or change your own hours. The business they belong to is worked out
 * here (your team's owner, or you); the database checks it again, and only
 * lets you change your own unbilled rows.
 */
export async function saveTimeEntry(input: EntryInput): Promise<TimesheetResult> {
  const workDate = parseDayKey(input?.workDate);
  if (!workDate) return { ok: false, error: "Pick the day you worked." };
  const worked = workedTime(String(input.start ?? ""), String(input.finish ?? ""), Number(input.breakMinutes));
  if (!worked.ok) return worked;
  const note = String(input.note ?? "").replace(/\s+/g, " ").trim() || null;
  if (note && note.length > NOTE_MAX) return { ok: false, error: `Keep the note to ${NOTE_MAX} characters.` };
  if (input.id && !UUID.test(input.id)) return { ok: false, error: "That entry can't be found." };
  if (input.clientId && !UUID.test(input.clientId)) return { ok: false, error: "Pick a client from the list." };

  const { supabase, user } = await signedIn();
  const ownerId = await businessOwnerFor(user.id);

  let clientId = input.clientId || null;
  const newName = String(input.newClientName ?? "").replace(/\s+/g, " ").trim();
  if (!clientId && newName) {
    if (newName.length > 150) return { ok: false, error: "Keep the client's name under 150 characters." };
    const { data, error } = await supabase.rpc("save_client_contact", { p_data: { name: newName } });
    if (error || !data) {
      captureError(error ?? new Error("save_client_contact returned nothing"), { route: "timesheet/save-client" });
      return { ok: false, error: "Couldn't save the new client. Try again." };
    }
    clientId = String((data as { id: string }).id);
  }

  const row = {
    work_date: workDate,
    start_time: String(input.start),
    end_time: String(input.finish),
    break_minutes: Number(input.breakMinutes),
    client_id: clientId,
    note,
  };
  const result = input.id
    ? await supabase
        .from("time_entries")
        .update({ ...row, updated_at: new Date().toISOString() })
        .eq("id", input.id)
        .eq("user_id", user.id)
        .select("id")
    : await supabase.from("time_entries").insert({ ...row, owner_id: ownerId, user_id: user.id }).select("id");
  if (result.error) {
    console.error("[timesheet/save] failed", result.error);
    captureError(result.error, { route: "timesheet/save" });
    return { ok: false, error: "Couldn't save those hours. Check your signal and try again." };
  }
  if (!Array.isArray(result.data) || result.data.length === 0) {
    return { ok: false, error: "Those hours are on an invoice now, so they can't be changed." };
  }
  revalidatePath(PATH);
  return { ok: true };
}

/** Remove your own unbilled hours. */
export async function deleteTimeEntry(id: string): Promise<TimesheetResult> {
  if (!UUID.test(String(id))) return { ok: false, error: "That entry can't be found." };
  const { supabase, user } = await signedIn();
  const { data, error } = await supabase.from("time_entries").delete().eq("id", id).eq("user_id", user.id).select("id");
  if (error) {
    captureError(error, { route: "timesheet/delete" });
    return { ok: false, error: "Couldn't remove those hours. Try again." };
  }
  if (!Array.isArray(data) || data.length === 0) {
    return { ok: false, error: "Those hours are on an invoice now, so they can't be removed." };
  }
  revalidatePath(PATH);
  return { ok: true };
}

/**
 * The owner bills a client for a week: every unbilled hour for that client
 * that week (the whole team's), one line per day at the rate given. Saved
 * as a finished job with its invoice, so it's sent and marked paid from the
 * job page like any other invoice.
 */
export async function createTimesheetInvoice(input: {
  clientId: string;
  weekStart: string;
  rate: number;
}): Promise<InvoiceResult> {
  const start = parseDayKey(input?.weekStart);
  if (!start || mondayOf(start) !== start) return { ok: false, error: "Pick a week." };
  if (!UUID.test(String(input.clientId))) return { ok: false, error: "Pick a client." };

  const { supabase, user } = await signedIn();
  if ((await businessOwnerFor(user.id)) !== user.id) {
    return { ok: false, error: "Only the business owner can invoice hours." };
  }

  const [entriesResult, clientResult, profileResult, rosterResult] = await Promise.all([
    supabase
      .from("time_entries")
      .select("id, user_id, work_date, start_time, end_time, break_minutes, note, invoice_id")
      .eq("owner_id", user.id)
      .eq("client_id", input.clientId)
      .gte("work_date", start)
      .lte("work_date", addDays(start, 6)),
    supabase.from("clients").select("name, email, address, phone").eq("id", input.clientId).eq("user_id", user.id).maybeSingle(),
    supabase.from("profiles").select("tax_rate, tax_label, currency, country").eq("id", user.id).maybeSingle(),
    supabase.rpc("team_roster"),
  ]);
  if (entriesResult.error || clientResult.error) {
    captureError(entriesResult.error ?? clientResult.error, { route: "timesheet/invoice-load" });
    return { ok: false, error: "Couldn't load those hours. Check your signal and try again." };
  }
  if (!clientResult.data) return { ok: false, error: "That client isn't in your client list." };

  // Hours already on a live invoice stay out.
  const rows = (entriesResult.data ?? []) as Array<Record<string, unknown>>;
  const invoiceIds = [...new Set(rows.map((r) => r.invoice_id).filter((v): v is string => typeof v === "string"))];
  const billed = new Set<string>();
  if (invoiceIds.length > 0) {
    const { data } = await supabase.from("invoices").select("id, status, deleted_at").in("id", invoiceIds);
    for (const inv of (data ?? []) as Array<Record<string, unknown>>) {
      if (!inv.deleted_at && inv.status !== "cancelled") billed.add(String(inv.id));
    }
  }
  const members = ((rosterResult.data as { members?: Array<{ user_id: string; email: string | null }> } | null)?.members ?? []);
  const person = (id: string) =>
    id === user.id ? "you" : nameFromEmail(members.find((m) => m.user_id === id)?.email ?? null);

  const entries: BillableEntry[] = [];
  for (const r of rows) {
    if (typeof r.invoice_id === "string" && billed.has(r.invoice_id)) continue;
    const worked = workedTime(String(r.start_time).slice(0, 5), String(r.end_time).slice(0, 5), Number(r.break_minutes) || 0);
    if (!worked.ok) continue;
    entries.push({
      id: String(r.id),
      workDate: String(r.work_date),
      hours: worked.hours,
      note: (r.note as string | null) ?? null,
      person: person(String(r.user_id)),
    });
  }

  const profile = (profileResult.data ?? {}) as Record<string, unknown>;
  const country = (profile.country as string | null) ?? null;
  const currency = ((profile.currency as string | null) ?? "NZD").trim() || "NZD";
  const client = clientResult.data as { name: string; email: string | null; address: string | null; phone: string | null };
  const built = buildTimesheetInvoice({
    entries,
    rate: Number(input.rate),
    client: { name: client.name, email: client.email, address: client.address, phone: client.phone },
    period: weekLabel(start),
    currency,
    taxLabel: resolveTaxLabel(profile.tax_label as string | null, country, currency),
    taxRate: resolveTaxRate(profile.tax_rate, country, currency),
  });
  if (!built.ok) return built;

  const { data, error } = await supabase.rpc("create_timesheet_invoice", {
    p_entry_ids: built.entryIds,
    p_client_id: input.clientId,
    p_quote_data: built.quoteData as unknown as Json,
  });
  if (error || !data) {
    console.error("[timesheet/invoice] failed", error);
    captureError(error ?? new Error("create_timesheet_invoice returned nothing"), { route: "timesheet/invoice" });
    const message = error?.message ?? "";
    return {
      ok: false,
      error: /already invoiced/i.test(message)
        ? "Some of those hours were just invoiced. Refresh and try again."
        : "Couldn't make the invoice. Try again in a minute.",
    };
  }
  revalidatePath(PATH);
  revalidatePath("/app/jobs");
  revalidatePath("/app");
  return { ok: true, quoteId: String((data as { quote_id: string }).quote_id) };
}
