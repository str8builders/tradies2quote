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
 * Run ON THE VPS from the repo root (uses the app's own env + node_modules):
 *   cd /home/deploy/tradies2quote
 *   set -a; . ./.env.local; set +a
 *   node scripts/seed-demo-account.mjs
 *
 * Idempotent by marker: every seeded row carries the SEED_TAG in a
 * human-invisible spot (client name / job summary / material notes), and the
 * script counts what already exists before inserting. Existing hand-made
 * demo data is never touched. Safe to re-run any time.
 */
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

  console.log("\nDone. Demo account is review-ready (per-screen data present).");
}

main().catch((e) => {
  console.error("seed failed:", e);
  process.exit(1);
});
