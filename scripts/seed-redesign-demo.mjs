#!/usr/bin/env node
/**
 * Fill a DEMO account with made-up jobs in every stage — for screenshots,
 * automated run-throughs and the owner's own tour of the new look.
 *
 *   node --env-file=/srv/t2q/app.env scripts/seed-redesign-demo.mjs --email you+demo@gmail.com [--reset]
 *
 * Safety:
 *   - Refuses any email without "+demo@" in it, so it can never touch a real
 *     customer account, and the account must have confirmed its email.
 *   - --reset deletes ONLY that demo account's quotes, invoices, clients and
 *     materials before seeding again.
 *   - Every name, address and email below is invented; client emails use
 *     example.com, which never delivers.
 *   - Needs NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and
 *     SUPABASE_SERVICE_ROLE_KEY; prints ids and counts only.
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "node:crypto";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, "").split("=");
    return [k, v.length ? v.join("=") : true];
  }),
);
const email = String(args.email ?? "").trim().toLowerCase();
if (!/^[^@\s]+\+demo@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('Refusing: pass --email=<address with "+demo@">, e.g. you+demo@gmail.com');
  process.exit(2);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(2);
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

// ── money: integer cents, half-up — same results as src/lib/quote-defaults computeQuoteTotals
const cents = (n) => Math.round(Number(n) * 100);
const dollars = (c) => c / 100;
function totals(lines, markupPct, taxRate) {
  let mat = 0;
  let lab = 0;
  for (const l of lines) {
    const lt = Math.round(l.quantity * cents(l.unit_price));
    if (l.type === "labour") lab += lt;
    else mat += lt;
  }
  const markup = Math.round((mat * markupPct) / 100);
  const sub = mat + markup + lab;
  const tax = Math.round((sub * taxRate) / 100);
  return {
    materials_subtotal: dollars(mat),
    labour_subtotal: dollars(lab),
    markup_pct: markupPct,
    markup_amount: dollars(markup),
    subtotal_before_tax: dollars(sub),
    tax_rate: taxRate,
    tax_amount: dollars(tax),
    total: dollars(sub + tax),
  };
}
const day = 86_400_000;
const at = (offsetDays, hour = 9) => {
  const d = new Date(Date.now() + offsetDays * day);
  d.setUTCHours(hour - 12, 0, 0, 0); // ~NZ morning
  return d.toISOString();
};
const token = () => randomBytes(24).toString("base64url");

async function main() {
  // Find the demo user (service role admin API).
  let user = null;
  for (let page = 1; page <= 10 && !user; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    user = data.users.find((u) => (u.email ?? "").toLowerCase() === email) ?? null;
    if (data.users.length < 200) break;
  }
  if (!user) throw new Error("No account with that email. Sign up and confirm it first.");
  if (!user.email_confirmed_at) throw new Error("That account hasn't confirmed its email yet.");
  const uid = user.id;
  console.log(`demo user ${uid}`);

  if (args.reset) {
    const { data: qs } = await db.from("quotes").select("id").eq("user_id", uid);
    const ids = (qs ?? []).map((q) => q.id);
    if (ids.length) {
      await db.from("invoices").delete().eq("user_id", uid);
      await db.from("quote_items").delete().in("quote_id", ids);
      await db.from("quote_events").delete().in("quote_id", ids);
      await db.from("quotes").delete().eq("user_id", uid);
    }
    await db.from("clients").delete().eq("user_id", uid);
    await db.from("materials").delete().eq("user_id", uid);
    console.log(`reset: removed ${ids.length} quotes and their invoices, clients and materials`);
  }

  const MARKUP = 15;
  const TAX = 15;
  const { error: pErr } = await db.from("profiles").upsert({
    id: uid,
    business_name: "Taylor Carpentry (demo)",
    email,
    phone: "021 000 0142",
    address: "12 Totara Ave, Tauranga",
    country: "NZ",
    currency: "NZD",
    default_labour_rate: 75,
    default_markup_pct: MARKUP,
    tax_label: "GST",
    tax_rate: TAX,
    gst_number: "000-000-000",
  });
  if (pErr) throw pErr;

  const library = [
    ["Pine decking 140×32 H3.2", "m", 8.9, "Decking"],
    ["Joist 190×45 H3.2", "m", 12.4, "Framing"],
    ["Bearer 140×70 H4", "m", 16.5, "Framing"],
    ["Pile 125×125 H5 1.2 m", "each", 28, "Foundations"],
    ["Joist hanger 190 mm", "each", 3.85, "Fixings"],
    ["Decking screws 10g 65 mm (1000)", "box", 89, "Fixings"],
    ["GIB Standard 10 mm 2400×1200", "sheet", 24.5, "Linings"],
    ["GIB Aqualine 10 mm 2400×1200", "sheet", 42.5, "Linings"],
    ["Exterior stain 10 L", "each", 189, "Finishes"],
    ["Concrete 20 kg bag", "bag", 11.2, "Concrete"],
  ].map(([name, unit, price, category]) => ({
    user_id: uid,
    name,
    unit,
    default_unit_price: price,
    category,
    country: "NZ",
    is_ai_estimated: false,
    price_source: "user_library",
    price_confidence: "high",
  }));
  const { error: mErr } = await db.from("materials").upsert(library, { onConflict: "user_id,name" });
  if (mErr) throw mErr;

  const people = {
    sam: { name: "Sam Taylor", email: "sam.taylor@example.com", phone: "021 000 0101", address: "14 Rata St, Tauranga" },
    aroha: { name: "Aroha Ngata", email: "aroha.ngata@example.com", phone: "021 000 0102", address: "7 Kowhai Rd, Bethlehem" },
    ben: { name: "Ben Walker", email: "ben.walker@example.com", phone: "021 000 0103", address: "22 Miro Pl, Otumoetai" },
    priya: { name: "Priya Shah", email: "priya.shah@example.com", phone: "021 000 0104", address: "3 Harbour View, Mount Maunganui" },
    tom: { name: "Tom Rewi", email: "tom.rewi@example.com", phone: "021 000 0105", address: "55 Seaview Tce, Papamoa" },
    lucy: { name: "Lucy Chen", email: "lucy.chen@example.com", phone: "021 000 0106", address: "9 Beach Rd, Waihi Beach" },
  };
  const clientIds = {};
  for (const [k, c] of Object.entries(people)) {
    const { data, error } = await db.from("clients").insert({ user_id: uid, ...c }).select("id").single();
    if (error) throw error;
    clientIds[k] = data.id;
  }

  const L = (type, description, quantity, unit, unit_price) => ({ type, description, quantity, unit, unit_price });
  const jobs = [
    { who: "aroha", status: "draft", created: -1, summary: "Bathroom reline at 7 Kowhai Rd",
      lines: [L("material", "GIB Aqualine 10 mm 2400×1200", 14, "sheet", 42.5), L("material", "Waterproof membrane kit", 1, "each", 0), L("labour", "Reline and stop", 16, "hour", 75)] },
    { who: "lucy", status: "draft", created: 0, summary: "Fence repair at 9 Beach Rd",
      lines: [L("material", "Fence palings 150×19", 40, "each", 3.2), L("material", "Rails 100×50 H3.2", 6, "length", 24), L("labour", "Replace palings and rails", 6, "hour", 75)] },
    { who: "priya", status: "sent", created: -6, sent: -4, summary: "Pergola at 3 Harbour View",
      lines: [L("material", "Posts 125×125 H4", 4, "length", 68), L("material", "Rafters 190×45 H3.2", 8, "length", 49.6), L("labour", "Build pergola", 2, "day", 600)] },
    { who: "tom", status: "viewed", created: -3, sent: -2, viewed: -1, summary: "Deck steps at 55 Seaview Tce",
      lines: [L("material", "Pine decking 140×32 H3.2", 18, "m", 8.9), L("material", "Stringers 240×45 H3.2", 3, "length", 42), L("labour", "Build steps", 7, "hour", 75)] },
    { who: "sam", status: "accepted", created: -9, sent: -7, viewed: -6, accepted: -2, summary: "New deck at 14 Rata St",
      lines: [L("material", "Pine decking 140×32 H3.2", 226.8, "m", 8.9), L("material", "Joist 190×45 H3.2", 67.2, "m", 12.4), L("material", "Joist hanger 190 mm", 28, "each", 3.85), L("labour", "Build the deck", 3, "day", 600)] },
    { who: "ben", status: "scheduled", created: -12, sent: -11, viewed: -10, accepted: -8, scheduled: 5, summary: "Boundary fence at 22 Miro Pl",
      lines: [L("material", "Fence posts 100×100 H4", 12, "length", 38), L("material", "Concrete 20 kg bag", 24, "bag", 11.2), L("labour", "Build fence", 2, "day", 600)] },
    { who: "priya", status: "in_progress", created: -15, sent: -14, viewed: -13, accepted: -12, scheduled: -1, started: -1, summary: "Kitchen wall at 3 Harbour View",
      lines: [L("material", "GIB Standard 10 mm 2400×1200", 10, "sheet", 24.5), L("material", "Studs 90×45 SG8", 14, "length", 21), L("labour", "Frame and line wall", 12, "hour", 75)] },
    { who: "tom", status: "completed", created: -25, sent: -24, viewed: -23, accepted: -22, scheduled: -8, started: -6, completed: -3, invoice: { status: "sent", sent: -3, due: 4 },
      summary: "Retaining wall at 55 Seaview Tce",
      lines: [L("material", "Posts 150×150 H5", 8, "length", 96), L("material", "Rails 200×50 H4", 14, "length", 52), L("labour", "Build retaining wall", 3, "day", 600)] },
    { who: "ben", status: "completed", created: -40, sent: -39, viewed: -38, accepted: -37, scheduled: -25, started: -24, completed: -20, invoice: { status: "overdue", sent: -19, due: -9 },
      summary: "Fence repair at 22 Miro Pl",
      lines: [L("material", "Fence palings 150×19", 60, "each", 3.2), L("labour", "Repair fence", 11, "hour", 75)] },
    { who: "lucy", status: "completed", created: -45, sent: -44, viewed: -44, accepted: -43, scheduled: -35, started: -34, completed: -30, invoice: { status: "paid", sent: -30, due: -23, paid: -25 },
      summary: "Deck oil at 9 Beach Rd",
      lines: [L("material", "Exterior stain 10 L", 2, "each", 189), L("labour", "Sand and oil deck", 1, "day", 600)] },
  ];

  let made = 0;
  for (const j of jobs) {
    const client = people[j.who];
    const lines = j.lines.map((l) => ({
      id: randomUUID(),
      ...l,
      line_total: dollars(Math.round(l.quantity * cents(l.unit_price))),
    }));
    const t = totals(lines, MARKUP, TAX);
    const quote_data = {
      client,
      job_summary: j.summary,
      line_items: lines,
      ...t,
      tax_label: "GST",
      currency: "NZD",
      terms: "Quote valid for 30 days. 50% deposit before materials are ordered.",
      meta: { demo_seed: true },
    };
    const sent = j.sent != null;
    const row = {
      user_id: uid,
      client_id: clientIds[j.who],
      status: j.status,
      quote_data,
      total_amount: t.total,
      currency: "NZD",
      voice_transcript: `${j.summary}. Made-up demo job.`,
      created_at: at(j.created),
      public_token: sent ? token() : null,
      sent_at: sent ? at(j.sent) : null,
      expires_at: sent ? at(j.sent + 30) : null,
      viewed_at: j.viewed != null ? at(j.viewed, 18) : null,
      accepted_at: j.accepted != null ? at(j.accepted, 19) : null,
      accepted_name: j.accepted != null ? client.name : null,
      accepted_total: j.accepted != null ? t.total : null,
      accepted_quote_version: j.accepted != null ? 1 : null,
      scheduled_for: j.scheduled != null ? at(j.scheduled, 7) : null,
      started_at: j.started != null ? at(j.started, 7) : null,
      completed_at: j.completed != null ? at(j.completed, 16) : null,
    };
    const { data: q, error } = await db.from("quotes").insert(row).select("id").single();
    if (error) throw error;
    const items = lines.map((l) => ({
      quote_id: q.id, type: l.type, description: l.description, quantity: l.quantity,
      unit: l.unit, unit_price: l.unit_price, line_total: l.line_total,
    }));
    const { error: iErr } = await db.from("quote_items").insert(items);
    if (iErr) throw iErr;
    if (j.invoice) {
      const invId = randomUUID();
      const { error: invErr } = await db.from("invoices").insert({
        id: invId,
        user_id: uid,
        quote_id: q.id,
        invoice_number: `INV-${invId.slice(0, 8).toUpperCase()}`,
        status: j.invoice.status,
        subtotal: t.subtotal_before_tax,
        tax_amount: t.tax_amount,
        total_amount: t.total,
        currency: "NZD",
        invoice_data: quote_data,
        due_date: at(j.invoice.due).slice(0, 10),
        sent_at: at(j.invoice.sent, 17),
        paid_at: j.invoice.paid != null ? at(j.invoice.paid, 12) : null,
      });
      if (invErr) throw invErr;
    }
    made++;
  }
  console.log(`seeded: ${library.length} priced materials, ${Object.keys(people).length} clients, ${made} jobs`);
}

main().catch((e) => {
  console.error("seed failed:", e?.code ?? "", e?.message ?? e);
  process.exit(1);
});
