import "server-only";
import { resolveTaxLabel, resolveTaxRate } from "@/lib/quote-defaults";
import { createClient } from "@/lib/supabase/server";
import { getTeamContext } from "@/lib/team";
import { routeKm } from "@/lib/location/geo";
import { workedTime } from "@/lib/timesheet/hours";
import { addDays } from "@/lib/timesheet/week";
import { nameFromEmail } from "./people";
import type { TimesheetClient, TimesheetData, TimesheetEntry, TimesheetPerson } from "./types";

type Db = Awaited<ReturnType<typeof createClient>>;

const ENTRY_COLUMNS = "id, owner_id, user_id, client_id, work_date, start_time, end_time, break_minutes, note, invoice_id, session_id";

const hhmm = (value: unknown) => String(value ?? "").slice(0, 5);

/** The business owner for this person (their active team's owner, or themselves). */
export async function businessOwnerFor(userId: string): Promise<string> {
  try {
    return (await getTeamContext(userId)).clientOwnerId;
  } catch {
    return userId;
  }
}

async function teamPeople(db: Db, userId: string, canInvoice: boolean): Promise<Map<string, string>> {
  const names = new Map<string, string>([[userId, "You"]]);
  if (!canInvoice) return names;
  try {
    const { data } = await db.rpc("team_roster");
    const members = ((data as { members?: Array<{ user_id: string; email: string | null }> } | null)?.members ?? []);
    for (const m of members) if (m.user_id !== userId) names.set(m.user_id, nameFromEmail(m.email));
  } catch {
    // No team, or it couldn't be read: hours still show, as "Team member".
  }
  return names;
}

/**
 * One week of the timesheet for the signed-in person: the business owner
 * gets the whole team's hours, anyone else their own (RLS says the same).
 * With the clients to pick from, and the rate and tax for invoicing.
 */
export async function loadTimesheet({
  userId,
  weekStart,
  today,
}: {
  userId: string;
  weekStart: string;
  today: string;
}): Promise<TimesheetData> {
  const db = await createClient();
  const ownerId = await businessOwnerFor(userId);
  const canInvoice = ownerId === userId;
  const weekEnd = addDays(weekStart, 6);

  let entriesQuery = db
    .from("time_entries")
    .select(ENTRY_COLUMNS)
    .gte("work_date", weekStart)
    .lte("work_date", weekEnd)
    .order("work_date", { ascending: true })
    .order("start_time", { ascending: true });
  entriesQuery = canInvoice ? entriesQuery.eq("owner_id", userId) : entriesQuery.eq("user_id", userId);

  const [entriesResult, clientsResult, profileResult, names] = await Promise.all([
    entriesQuery,
    db.from("clients").select("id, name, email, address, phone").eq("user_id", ownerId).order("name"),
    db.from("profiles").select("default_labour_rate, tax_rate, tax_label, currency, country").eq("id", ownerId).maybeSingle(),
    teamPeople(db, userId, canInvoice),
  ]);

  const rows = (entriesResult.data ?? []) as Array<Record<string, unknown>>;
  const clients: TimesheetClient[] = ((clientsResult.data ?? []) as Array<Record<string, unknown>>).map((c) => ({
    id: String(c.id),
    name: String(c.name ?? "").trim() || "Unnamed client",
    email: (c.email as string | null) ?? null,
    address: (c.address as string | null) ?? null,
    phone: (c.phone as string | null) ?? null,
  }));
  const clientName = new Map(clients.map((c) => [c.id, c.name]));

  // Which invoices are live (a deleted or cancelled one frees its hours).
  const invoiceIds = [...new Set(rows.map((r) => r.invoice_id).filter((v): v is string => typeof v === "string"))];
  const live = new Map<string, string>();
  if (invoiceIds.length > 0) {
    const { data } = await db.from("invoices").select("id, invoice_number, status, deleted_at").in("id", invoiceIds);
    for (const inv of (data ?? []) as Array<Record<string, unknown>>) {
      if (!inv.deleted_at && inv.status !== "cancelled") live.set(String(inv.id), String(inv.invoice_number ?? "Invoice"));
    }
  }

  // Pins and kilometres for hours made by clocking in and out.
  const sessions = await sessionFacts(db, rows.map((r) => r.session_id).filter((v): v is string => typeof v === "string"));

  const entries: TimesheetEntry[] = rows.map((r) => {
    const start = hhmm(r.start_time);
    const finish = hhmm(r.end_time);
    const breakMinutes = Number(r.break_minutes) || 0;
    const worked = workedTime(start, finish, breakMinutes);
    const invoiceId = typeof r.invoice_id === "string" && live.has(r.invoice_id) ? r.invoice_id : null;
    const who = String(r.user_id);
    return {
      id: String(r.id),
      workDate: String(r.work_date),
      start,
      finish,
      breakMinutes,
      hours: worked.ok ? worked.hours : 0,
      note: (r.note as string | null) ?? null,
      clientId: (r.client_id as string | null) ?? null,
      clientName: r.client_id ? (clientName.get(String(r.client_id)) ?? "Client") : null,
      userId: who,
      person: names.get(who) ?? "Team member",
      mine: who === userId,
      invoice: invoiceId ? { id: invoiceId, number: live.get(invoiceId)! } : null,
      pins: typeof r.session_id === "string" ? (sessions.get(r.session_id)?.pins ?? null) : null,
      km: typeof r.session_id === "string" ? (sessions.get(r.session_id)?.km ?? null) : null,
    };
  });

  const people: TimesheetPerson[] = [...names.entries()].map(([id, name]) => ({ userId: id, name }));
  const profile = (profileResult.data ?? {}) as Record<string, unknown>;
  const country = (profile.country as string | null) ?? null;
  const currency = ((profile.currency as string | null) ?? "NZD").trim() || "NZD";
  const rate = Number(profile.default_labour_rate);

  return {
    weekStart,
    today,
    entries,
    clients,
    canInvoice,
    people,
    labourRate: Number.isFinite(rate) && rate > 0 ? rate : 0,
    currency,
    taxLabel: resolveTaxLabel(profile.tax_label as string | null, country, currency),
    taxRate: resolveTaxRate(profile.tax_rate, country, currency),
    failed: Boolean(entriesResult.error),
    travelRate: null,
  };
}

/**
 * For each clocked session: its start and finish pins, and the kilometres
 * along its route (points the person's location setting allowed).
 */
export async function sessionFacts(
  db: Db,
  ids: readonly string[],
): Promise<Map<string, { pins: { start: string | null; end: string | null }; km: number | null }>> {
  const out = new Map<string, { pins: { start: string | null; end: string | null }; km: number | null }>();
  if (ids.length === 0) return out;
  const [sessionsResult, pointsResult] = await Promise.all([
    db.from("work_sessions").select("id, start_place, end_place").in("id", ids),
    db
      .from("location_points")
      .select("session_id, recorded_at, latitude, longitude, accuracy")
      .in("session_id", ids)
      .order("recorded_at", { ascending: true })
      .limit(20000),
  ]);
  const bySession = new Map<string, Array<{ t: number; lat: number; lng: number; acc: number | null }>>();
  for (const p of pointsResult.data ?? []) {
    const list = bySession.get(p.session_id) ?? [];
    list.push({ t: Date.parse(p.recorded_at), lat: p.latitude, lng: p.longitude, acc: p.accuracy });
    bySession.set(p.session_id, list);
  }
  for (const s of sessionsResult.data ?? []) {
    const points = bySession.get(s.id) ?? [];
    out.set(s.id, {
      pins: { start: s.start_place, end: s.end_place },
      km: points.length > 1 ? routeKm(points) : null,
    });
  }
  return out;
}
