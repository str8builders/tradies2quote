#!/usr/bin/env node
/**
 * Idempotent top-up seed for the App Review demo account.
 *
 * The review notes promise Apple a "fully seeded — every screen has data"
 * demo (demo@tradies2quote.com). Before this script, that state was
 * hand-created production data with no reproducible source — if it was ever
 * wiped, the reviewer would log in to empty screens (Guideline 2.1
 * rejection). This script makes the promise reproducible.
 *
 * Run ON THE VPS from the app directory (uses the app's own env and
 * node_modules; see deploy/README.md for the current layout):
 *   cd /srv/t2q/app
 *   node --env-file=/srv/t2q/app.env scripts/seed-demo-account.mjs
 *
 * Idempotent: quotes, invoices and materials are counted before anything is
 * inserted (seeded ones carry the SEED_TAG in a human-invisible spot: job
 * summary notes, material notes). Clients are matched by name. Job sites,
 * timesheet hours and the clocked-in session use fixed ids (seedId), so a
 * re-run never adds a second copy. Existing hand-made demo data is never
 * touched. Safe to re-run any time.
 *
 * Timesheet (step 6): pinned job sites in Tauranga for three clients, the
 * last finished Monday to Friday of hours across them, and one of those days
 * clocked in and out with its pins and places ("At the Aroha Ngata job").
 * Run it again right before a submission so that week is recent. It leaves
 * the demo's location setting OFF and its AI consent unrecorded (resetting
 * them if a reviewer or a test run turned them on) so the reviewer sees both
 * consent flows and iOS's own prompts, and it clears a clocked-in session
 * left open for more than 12 hours (finishing work would refuse it as too
 * long).
 */
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const SEED_TAG = "t2q-demo-seed-v1";
const DEMO_EMAIL = "demo@tradies2quote.com";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(
    "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing — source .env.local first.",
  );
  process.exit(1);
}
const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Sum-of-rounded totals, mirroring src/lib/quote-defaults computeQuoteTotals. */
function totals(lineItems, markupPct, taxRate) {
  const r2 = (n) => Math.round(n * 100) / 100;
  let materials = 0;
  let labour = 0;
  for (const it of lineItems) {
    const lt = r2(it.quantity * it.unit_price);
    it.line_total = lt;
    if (it.type === "labour") labour += lt;
    else materials += lt;
  }
  materials = r2(materials);
  labour = r2(labour);
  const markup = r2(materials * (markupPct / 100));
  const subtotal = r2(materials + markup + labour);
  const tax = r2(subtotal * (taxRate / 100));
  return {
    materials_subtotal: materials,
    labour_subtotal: labour,
    markup_pct: markupPct,
    markup_amount: markup,
    subtotal_before_tax: subtotal,
    tax_amount: tax,
    total: r2(subtotal + tax),
  };
}

function quoteData(jobSummary, client, lineItems) {
  const t = totals(lineItems, 15, 15);
  return {
    client,
    job_summary: `${jobSummary}`,
    line_items: lineItems,
    ...t,
    currency: "NZD",
    tax_label: "GST",
    tax_rate: 15,
    terms:
      "Quote valid 30 days. 50% deposit on acceptance, balance on completion. Any variations priced before work proceeds.",
    notes: [SEED_TAG],
  };
}

// ── Timesheet helpers ────────────────────────────────────────────────────────

/** The demo business is in Tauranga, New Zealand. */
const ZONE = "Pacific/Auckland";

/**
 * Three clients with pinned job sites (inland Tauranga suburbs: Brookfield,
 * Bethlehem, Greerton). Sarah Mitchell is the same client steps 2 and 3 use.
 */
const SITE_CLIENTS = [
  {
    name: "Sarah Mitchell",
    email: "sarah.mitchell@example.com",
    phone: "+64 21 555 0147",
    address: "42 Harbourview Terrace, Tauranga",
    lat: -37.6975,
    lng: 176.1352,
  },
  {
    name: "Hemi Walker",
    email: "hemi.walker@example.com",
    phone: "+64 21 555 0182",
    address: "18 Kowhai Street, Bethlehem, Tauranga",
    lat: -37.6961,
    lng: 176.1072,
  },
  {
    name: "Aroha Ngata",
    email: "aroha.ngata@example.com",
    phone: "+64 27 555 0126",
    address: "7 Rimu Place, Greerton, Tauranga",
    lat: -37.7279,
    lng: 176.1318,
  },
];

/**
 * The week of hours, Monday (0) to Friday (4). Hours always come from the
 * times (finish - start - break), as in the app. The clocked day is also a
 * finished work_sessions row with its pins.
 */
const WEEK = [
  { day: 0, client: "Hemi Walker", start: "07:00", end: "15:30", breakMinutes: 30, note: "Deck bearers and joists" },
  { day: 1, client: "Hemi Walker", start: "07:00", end: "16:00", breakMinutes: 30, note: "Decking boards down" },
  { day: 2, client: "Sarah Mitchell", start: "07:30", end: "12:00", breakMinutes: 0, note: "Fascia boards replaced" },
  { day: 2, client: "Aroha Ngata", start: "12:45", end: "16:30", breakMinutes: 15, note: "Measured up the fence line" },
  { day: 3, client: "Aroha Ngata", start: "07:00", end: "15:30", breakMinutes: 30, note: null, clocked: true },
  { day: 4, client: "Sarah Mitchell", start: "07:30", end: "14:00", breakMinutes: 30, note: "Primed and painted the gable" },
];

/** A fixed uuid for a seeded row, so a re-run never adds a second copy. */
function seedId(...parts) {
  const hex = createHash("sha256").update([SEED_TAG, ...parts].join("|")).digest("hex");
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** Today in a time zone, "YYYY-MM-DD". */
function todayIn(zone) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** The day `n` days after a "YYYY-MM-DD" key. */
function addDays(key, n) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Monday of the latest Monday to Friday that has finished (this week's at the weekend). */
function lastWorkWeek(today) {
  const [y, m, d] = today.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  const monday = addDays(today, weekday === 0 ? -6 : 1 - weekday);
  return weekday === 6 || weekday === 0 ? monday : addDays(monday, -7);
}

/** A local day and "HH:MM" in a time zone, as an ISO instant. */
function zonedIso(dayKey, time, zone) {
  const [y, m, d] = dayKey.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  const offset = (instant) => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone: zone,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
        .formatToParts(new Date(instant))
        .map((p) => [p.type, p.value]),
    );
    return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second) - instant;
  };
  // Twice, so a daylight-saving change between the guess and the answer settles.
  let utc = wall - offset(wall);
  utc = wall - offset(utc);
  return new Date(utc).toISOString();
}

/** Throw with the next step when the timesheet tables aren't there yet. */
function needsMigration(error, what) {
  if (!error) return;
  throw new Error(
    `${what}: ${error.message ?? error}. Apply supabase/migrations/20260927_time_entries.sql and 20260928_location.sql first.`,
  );
}

async function seedTimesheet(uid) {
  // The hours belong to the demo's own business. If the demo account has
  // joined someone else's team, leave that business's data alone.
  const { data: teamOwner, error: ownerErr } = await admin.rpc("active_team_owner", { p_user: uid });
  if (ownerErr) console.log(`timesheet: team check failed (${ownerErr.message}) — treating the demo as its own business`);
  if (teamOwner && teamOwner !== uid) {
    console.log("timesheet: the demo account is on another business's team — skipped");
    return;
  }
  const owner = uid;

  // Clients, by name (steps 2/3 may already have made Sarah Mitchell).
  const { data: existing, error: clientsErr } = await admin.from("clients").select("id, name, address").eq("user_id", owner);
  if (clientsErr) throw clientsErr;
  const byName = new Map((existing ?? []).map((c) => [String(c.name).trim().toLowerCase(), c]));
  for (const c of SITE_CLIENTS) {
    if (byName.has(c.name.toLowerCase())) continue;
    const { data, error } = await admin
      .from("clients")
      .insert({ user_id: owner, name: c.name, email: c.email, phone: c.phone, address: c.address })
      .select("id, name, address")
      .single();
    if (error) throw error;
    byName.set(c.name.toLowerCase(), data);
    console.log(`client: seeded ${c.name}`);
  }
  const client = (name) => byName.get(name.toLowerCase());

  // Job sites: pinned points, so nothing is looked up. An existing site
  // (the reviewer saved their own spot, say) is left as it is.
  const sites = SITE_CLIENTS.map((c) => ({
    client_id: client(c.name).id,
    owner_id: owner,
    address: client(c.name).address ?? c.address,
    latitude: c.lat,
    longitude: c.lng,
    radius_m: 150,
    source: "pinned",
  }));
  const { error: sitesErr } = await admin.from("job_sites").upsert(sites, { onConflict: "client_id", ignoreDuplicates: true });
  needsMigration(sitesErr, "job_sites");
  console.log(`job sites: ${sites.length} pinned in Tauranga (existing ones untouched)`);

  // A clocked-in session left open for over 12 hours can't be finished (the
  // app refuses a session over 24 hours): clear it so Start work is clean.
  const staleBefore = new Date(Date.now() - 12 * 3600_000).toISOString();
  const { data: stale, error: staleErr } = await admin
    .from("work_sessions")
    .delete()
    .eq("user_id", uid)
    .is("ended_at", null)
    .lt("started_at", staleBefore)
    .select("id");
  needsMigration(staleErr, "work_sessions");
  if ((stale ?? []).length > 0) console.log(`timesheet: cleared ${stale.length} clocked-in session(s) left open`);

  // The week, and the clocked day's session (made first: its hours point at it).
  const monday = lastWorkWeek(todayIn(ZONE));
  const day = (n) => addDays(monday, n);
  const entryId = (w) => seedId("time", uid, day(w.day), w.client, w.start);
  const clocked = WEEK.find((w) => w.clocked);
  const site = SITE_CLIENTS.find((c) => c.name === clocked.client);
  const place = `At the ${clocked.client} job`;
  const sessionId = seedId("session", uid, day(clocked.day));
  const { error: sessionErr } = await admin.from("work_sessions").upsert(
    {
      id: sessionId,
      owner_id: owner,
      user_id: uid,
      client_id: client(clocked.client).id,
      started_at: zonedIso(day(clocked.day), clocked.start, ZONE),
      ended_at: zonedIso(day(clocked.day), clocked.end, ZONE),
      // A few metres from the site's pin, as a phone would put it.
      start_lat: site.lat + 0.00004,
      start_lng: site.lng + 0.00003,
      start_accuracy: 9,
      start_place: place,
      end_lat: site.lat - 0.00003,
      end_lng: site.lng - 0.00005,
      end_accuracy: 12,
      end_place: place,
      source: "tap",
    },
    { onConflict: "id", ignoreDuplicates: true },
  );
  needsMigration(sessionErr, "work_sessions");

  const rows = WEEK.map((w) => ({
    id: entryId(w),
    owner_id: owner,
    user_id: uid,
    client_id: client(w.client).id,
    work_date: day(w.day),
    start_time: w.start,
    end_time: w.end,
    break_minutes: w.breakMinutes,
    note: w.note,
    session_id: w.clocked ? sessionId : null,
  }));
  const { error: hoursErr } = await admin.from("time_entries").upsert(rows, { onConflict: "id", ignoreDuplicates: true });
  needsMigration(hoursErr, "time_entries");
  const { error: linkErr } = await admin
    .from("work_sessions")
    .update({ time_entry_id: entryId(clocked) })
    .eq("id", sessionId)
    .is("time_entry_id", null);
  needsMigration(linkErr, "work_sessions");
  console.log(`timesheet: week of ${monday} (Mon to Fri, ${rows.length} entries, ${clocked.client} clocked in and out)`);

  // "Invoice this week" fills the hourly rate from the labour rate: set the
  // one the seeded quotes use, only when none is saved yet.
  const { data: profile } = await admin.from("profiles").select("default_labour_rate").eq("id", owner).maybeSingle();
  if (profile && !(Number(profile.default_labour_rate) > 0)) {
    const { error } = await admin.from("profiles").update({ default_labour_rate: 85 }).eq("id", owner);
    if (error) throw error;
    console.log("profile: labour rate was empty — set to $85/hr (as on the seeded quotes)");
  }

  // Location stays OFF for the reviewer to turn on (and see iOS's prompts).
  const { data: consent, error: consentErr } = await admin
    .from("location_consents")
    .select("granted, auto_clock")
    .eq("user_id", uid)
    .maybeSingle();
  needsMigration(consentErr, "location_consents");
  if (consent && (consent.granted || consent.auto_clock)) {
    const now = new Date().toISOString();
    const { error } = await admin
      .from("location_consents")
      .update({ granted: false, auto_clock: false, revoked_at: now, updated_at: now })
      .eq("user_id", uid);
    if (error) throw error;
    // As turning it off in the app does: the phone's upload keys stop working.
    await admin.from("location_devices").update({ revoked_at: now }).eq("user_id", uid).is("revoked_at", null);
    console.log("location: was on — turned OFF so the reviewer can turn it on");
  } else {
    console.log("location: off (the reviewer turns it on)");
  }
}

async function main() {
  // 1. Resolve the demo user.
  const { data: userList, error: userErr } = await admin.auth.admin.listUsers({
    perPage: 1000,
  });
  if (userErr) throw userErr;
  const demo = userList.users.find(
    (u) => (u.email ?? "").toLowerCase() === DEMO_EMAIL,
  );
  if (!demo) {
    console.error(
      `Demo user ${DEMO_EMAIL} does not exist in auth.users — create it in the app first (signup), then re-run.`,
    );
    process.exit(1);
  }
  const uid = demo.id;
  console.log(`demo user: ${uid} (confirmed: ${Boolean(demo.email_confirmed_at)})`);
  if (!demo.email_confirmed_at) {
    await admin.auth.admin.updateUserById(uid, { email_confirm: true });
    console.log("→ email was unconfirmed; confirmed it (reviewer login would have failed).");
  }

  // 2. Client (the demo tradie's customer).
  const { data: clients } = await admin
    .from("clients")
    .select("id, name")
    .eq("user_id", uid);
  let clientRow = (clients ?? [])[0] ?? null;
  if (!clientRow) {
    const { data, error } = await admin
      .from("clients")
      .insert({
        user_id: uid,
        name: "Sarah Mitchell",
        email: "sarah.mitchell@example.com",
        phone: "+64 21 555 0147",
        address: "42 Harbourview Terrace, Tauranga",
      })
      .select("id, name")
      .single();
    if (error) throw error;
    clientRow = data;
    console.log("client: seeded Sarah Mitchell");
  } else {
    console.log(`client: exists (${clientRow.name}) — untouched`);
  }
  const clientRef = {
    name: clientRow.name,
    address: "42 Harbourview Terrace, Tauranga",
    email: "sarah.mitchell@example.com",
    phone: "+64 21 555 0147",
  };

  // 3. Quotes — ensure one in each lifecycle state the review notes promise.
  const { data: quotes } = await admin
    .from("quotes")
    .select("id, status")
    .eq("user_id", uid);
  const byStatus = new Map();
  for (const q of quotes ?? []) {
    byStatus.set(q.status, (byStatus.get(q.status) ?? 0) + 1);
  }
  console.log(
    `quotes: ${quotes?.length ?? 0} existing (${[...byStatus.entries()].map(([s, n]) => `${s}:${n}`).join(", ") || "none"})`,
  );

  const WANTED = [
    {
      status: "draft",
      job: "Replace rotten fascia boards and repaint the front gable",
      items: [
        { type: "material", description: "Fascia board H3.1 primed 190x25 (6m lengths)", quantity: 4, unit: "length", unit_price: 68.5 },
        { type: "material", description: "Exterior primer + topcoat (Resene Lumbersider)", quantity: 2, unit: "4L", unit_price: 129.0 },
        { type: "labour", description: "Remove, replace and paint fascia", quantity: 9, unit: "hr", unit_price: 85.0 },
      ],
    },
    {
      status: "sent",
      job: "Build a 3.6m x 2.4m timber deck off the kitchen sliders",
      items: [
        { type: "material", description: "H3.2 140x32 decking boards", quantity: 26, unit: "length", unit_price: 31.2 },
        { type: "material", description: "H3.2 140x45 joists", quantity: 9, unit: "length", unit_price: 42.8 },
        { type: "material", description: "Joist hangers + fixings (galv)", quantity: 1, unit: "lot", unit_price: 186.0 },
        { type: "labour", description: "Deck build incl. bearers, joists, decking", quantity: 18, unit: "hr", unit_price: 85.0 },
      ],
    },
    {
      status: "scheduled",
      job: "Install new internal wall and hang two doors upstairs",
      items: [
        { type: "material", description: "90x45 SG8 framing timber", quantity: 14, unit: "length", unit_price: 18.9 },
        { type: "material", description: "GIB Standard 13mm 2.4x1.2", quantity: 8, unit: "sheet", unit_price: 32.4 },
        { type: "labour", description: "Frame, line, stop and hang doors", quantity: 16, unit: "hr", unit_price: 85.0 },
      ],
    },
    {
      status: "completed",
      job: "Fence repair after storm — replace three panels and a post",
      items: [
        { type: "material", description: "H4 100x100 fence post", quantity: 1, unit: "each", unit_price: 39.5 },
        { type: "material", description: "Paling fence panels (1.8m)", quantity: 3, unit: "panel", unit_price: 84.0 },
        { type: "labour", description: "Dig out, re-set post, fit panels", quantity: 6, unit: "hr", unit_price: 85.0 },
      ],
    },
  ];

  for (const want of WANTED) {
    if ((byStatus.get(want.status) ?? 0) > 0) {
      console.log(`quote[${want.status}]: exists — untouched`);
      continue;
    }
    const qd = quoteData(want.job, clientRef, want.items);
    const now = new Date().toISOString();
    const row = {
      user_id: uid,
      client_id: clientRow.id,
      status: want.status,
      quote_data: qd,
      total_amount: qd.total,
      currency: "NZD",
      ...(want.status !== "draft"
        ? { sent_at: now, public_token: undefined }
        : {}),
      ...(want.status === "completed" ? { completed_at: now } : {}),
    };
    // Strip undefined keys (supabase-js sends them as null otherwise).
    for (const k of Object.keys(row)) if (row[k] === undefined) delete row[k];
    const { error } = await admin.from("quotes").insert(row);
    if (error) throw error;
    console.log(`quote[${want.status}]: seeded — "${want.job.slice(0, 40)}…"`);
  }

  // 4. Invoice — at least one, drafted off a completed quote.
  const { data: invoices } = await admin
    .from("invoices")
    .select("id")
    .eq("user_id", uid)
    .is("deleted_at", null);
  if ((invoices ?? []).length > 0) {
    console.log(`invoices: ${invoices.length} existing — untouched`);
  } else {
    const { data: completed } = await admin
      .from("quotes")
      .select("id, quote_data, total_amount")
      .eq("user_id", uid)
      .eq("status", "completed")
      .limit(1)
      .single();
    if (completed) {
      const qd = completed.quote_data;
      const { error } = await admin.from("invoices").insert({
        user_id: uid,
        quote_id: completed.id,
        invoice_number: "INV-2026-0001",
        status: "sent",
        total_amount: qd.total,
        tax_amount: qd.tax_amount,
        subtotal: qd.subtotal_before_tax,
        currency: "NZD",
        invoice_data: qd,
        due_date: new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10),
        sent_at: new Date().toISOString(),
      });
      if (error) throw error;
      console.log("invoices: seeded INV-2026-0001 (sent)");
    }
  }

  // 5. Materials library — a stocked starter set.
  const { data: mats } = await admin
    .from("materials")
    .select("id")
    .eq("user_id", uid);
  if ((mats ?? []).length >= 6) {
    console.log(`materials: ${mats.length} existing — untouched`);
  } else {
    const STARTER = [
      ["H3.2 140x32 decking board", "length", 31.2],
      ["H3.2 140x45 joist", "length", 42.8],
      ["90x45 SG8 framing timber", "length", 18.9],
      ["GIB Standard 13mm 2.4x1.2", "sheet", 32.4],
      ["H4 100x100 fence post", "each", 39.5],
      ["Galv joist hangers (box 50)", "box", 118.0],
      ["Exterior primer 4L", "each", 96.0],
      ["Decking screws 100x 10g", "box", 24.5],
    ];
    const rows = STARTER.map(([name, unit, price]) => ({
      user_id: uid,
      name,
      unit,
      default_unit_price: price,
      notes: SEED_TAG,
      active: true,
    }));
    const { error } = await admin.from("materials").insert(rows);
    if (error) throw error;
    console.log(`materials: seeded ${rows.length} starter items`);
  }

  // 6. Timesheet: pinned job sites, a week of hours, one clocked session.
  await seedTimesheet(uid);

  // 7. AI consent unrecorded, so the reviewer sees the consent screen (5.1.2(i)).
  const { data: consentRow } = await admin.from("profiles").select("ai_consent_at").eq("id", uid).maybeSingle();
  if (consentRow?.ai_consent_at) {
    const { error } = await admin.from("profiles").update({ ai_consent_at: null, ai_consent_version: null }).eq("id", uid);
    if (error) throw error;
    console.log("AI consent: was recorded — cleared so the reviewer sees the consent screen");
  } else {
    console.log("AI consent: not recorded (the reviewer is asked on the first AI action)");
  }

  console.log("\nDone. Demo account is review-ready (per-screen data present).");
}

main().catch((e) => {
  console.error("seed failed:", e);
  process.exit(1);
});
