import "server-only";

/**
 * Admin connector registry — the founder-facing list of every external
 * service tradies2Quote depends on, plus whatever live signal we can
 * legitimately read for each one.
 *
 * Two kinds of signal:
 *   1. PRESENCE — is the service's key actually set in this environment?
 *      Always readable (we just probe `process.env`), never leaks the
 *      secret value, only a boolean.
 *   2. LIVE SPEND — only OpenAI and Anthropic expose an org-cost API, and
 *      only to an ADMIN-scoped key (sk-admin… / sk-ant-admin…). The
 *      normal request key can't read costs. So those fetchers are wired
 *      but stay dormant until the matching ADMIN env var is added — the
 *      card then lights up automatically, no redeploy of logic needed.
 *
 * Caps (`monthlyCapNZD`) are YOUR budget line for each service so the
 * dashboard can colour a card amber/red as it approaches the ceiling.
 * Tune them here or override per-connector via env (e.g.
 * OPENAI_MONTHLY_CAP_NZD). They are advisory only — nothing enforces them.
 */

export type ConnectorStatus = "ok" | "missing" | "error";

export interface ConnectorSpend {
  /** Human label for the window the amount covers, e.g. "month to date". */
  periodLabel: string;
  /** Spend in the connector's own billing currency. */
  amount: number;
  currency: string;
  /** Your configured monthly budget (NZD), if any. */
  capNZD: number | null;
  /** amount-as-fraction-of-cap, 0..1+, null when no cap or FX unknown. */
  pctOfCap: number | null;
}

export interface ConnectorCard {
  id: string;
  label: string;
  /** One-line "what it powers" so the dashboard explains itself. */
  purpose: string;
  /** Is the primary key for this service present in the environment? */
  configured: boolean;
  status: ConnectorStatus;
  /** Deep link to the provider's billing / top-up console. */
  billingUrl: string;
  /** Short instruction shown under the card, e.g. how to top up. */
  topUpHint: string;
  /** Live spend, when an admin-scoped cost API is reachable. */
  spend: ConnectorSpend | null;
  /** Operator note — e.g. "Add OPENAI_ADMIN_KEY to see live spend". */
  note: string | null;
}

interface ConnectorDef {
  id: string;
  label: string;
  purpose: string;
  /** Env var(s) whose presence means "configured". First one is primary. */
  envKeys: string[];
  billingUrl: string;
  topUpHint: string;
  /** Default monthly budget in NZD; env override key checked first. */
  defaultCapNZD: number | null;
  capEnvKey?: string;
  /** Optional live-cost fetcher (admin-key gated). */
  fetchSpend?: (capNZD: number | null) => Promise<
    | { ok: true; spend: ConnectorSpend }
    | { ok: false; note: string }
  >;
}

/** First day of the current month at 00:00 UTC, as a Date. */
function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
}

/**
 * OpenAI organization costs (admin key required).
 * GET /v1/organization/costs?start_time=<unix>&limit=...
 * Returns buckets, each with results[].amount.{value,currency}.
 */
async function fetchOpenAISpend(
  capNZD: number | null,
): Promise<
  { ok: true; spend: ConnectorSpend } | { ok: false; note: string }
> {
  const adminKey = process.env.OPENAI_ADMIN_KEY;
  if (!adminKey) {
    return {
      ok: false,
      note: "Add OPENAI_ADMIN_KEY (an sk-admin-… key) to show live spend.",
    };
  }
  try {
    const now = new Date();
    const start = Math.floor(monthStart(now).getTime() / 1000);
    const url = `https://api.openai.com/v1/organization/costs?start_time=${start}&limit=180`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${adminKey}` },
      cache: "no-store",
    });
    if (!res.ok) {
      return { ok: false, note: `OpenAI cost API ${res.status}.` };
    }
    const json = (await res.json()) as {
      data?: { results?: { amount?: { value?: number; currency?: string } }[] }[];
    };
    let total = 0;
    let currency = "USD";
    for (const bucket of json.data ?? []) {
      for (const r of bucket.results ?? []) {
        if (typeof r.amount?.value === "number") total += r.amount.value;
        if (r.amount?.currency) currency = r.amount.currency.toUpperCase();
      }
    }
    return {
      ok: true,
      spend: spendFrom(total, currency, capNZD),
    };
  } catch (err) {
    return {
      ok: false,
      note: err instanceof Error ? err.message : "OpenAI cost fetch failed.",
    };
  }
}

/**
 * Anthropic organization cost report (admin key required).
 * GET /v1/organizations/cost_report?starting_at=<ISO date>
 * Headers: x-api-key + anthropic-version. Sums data[].results[].amount.
 */
async function fetchAnthropicSpend(
  capNZD: number | null,
): Promise<
  { ok: true; spend: ConnectorSpend } | { ok: false; note: string }
> {
  const adminKey = process.env.ANTHROPIC_ADMIN_KEY;
  if (!adminKey) {
    return {
      ok: false,
      note: "Add ANTHROPIC_ADMIN_KEY (an sk-ant-admin-… key) to show live spend.",
    };
  }
  try {
    const now = new Date();
    const startISO = monthStart(now).toISOString().slice(0, 10);
    const url = `https://api.anthropic.com/v1/organizations/cost_report?starting_at=${startISO}`;
    const res = await fetch(url, {
      headers: {
        "x-api-key": adminKey,
        "anthropic-version": "2023-06-01",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      return { ok: false, note: `Anthropic cost API ${res.status}.` };
    }
    const json = (await res.json()) as {
      data?: {
        results?: { amount?: number | string; currency?: string }[];
      }[];
    };
    let total = 0;
    let currency = "USD";
    for (const bucket of json.data ?? []) {
      for (const r of bucket.results ?? []) {
        const v =
          typeof r.amount === "string" ? parseFloat(r.amount) : r.amount ?? 0;
        if (!Number.isNaN(v)) total += v;
        if (r.currency) currency = r.currency.toUpperCase();
      }
    }
    return { ok: true, spend: spendFrom(total, currency, capNZD) };
  } catch (err) {
    return {
      ok: false,
      note: err instanceof Error ? err.message : "Anthropic cost fetch failed.",
    };
  }
}

/**
 * Twilio account balance (works with the NORMAL account SID + auth token —
 * no extra admin key needed). This is credit REMAINING, not month spend,
 * so the card shows it with periodLabel "credit remaining" and no cap
 * gauge (a low number is the warning, not a high one).
 */
async function fetchTwilioBalance(): Promise<
  { ok: true; spend: ConnectorSpend } | { ok: false; note: string }
> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    return { ok: false, note: "Twilio keys missing." };
  }
  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Balance.json`,
      {
        headers: {
          Authorization:
            "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
        },
        cache: "no-store",
      },
    );
    if (!res.ok) {
      return { ok: false, note: `Twilio balance API ${res.status}.` };
    }
    const json = (await res.json()) as {
      balance?: string;
      currency?: string;
    };
    const amount = parseFloat(json.balance ?? "");
    if (Number.isNaN(amount)) {
      return { ok: false, note: "Twilio returned no balance." };
    }
    return {
      ok: true,
      spend: {
        periodLabel: "credit remaining",
        amount,
        currency: (json.currency ?? "USD").toUpperCase(),
        capNZD: null,
        pctOfCap: null,
      },
    };
  } catch (err) {
    return {
      ok: false,
      note: err instanceof Error ? err.message : "Twilio balance fetch failed.",
    };
  }
}

/** Rough USD→NZD only used to colour the cap gauge, never shown as money. */
const USD_TO_NZD = 1.65;

function spendFrom(
  amount: number,
  currency: string,
  capNZD: number | null,
): ConnectorSpend {
  let pctOfCap: number | null = null;
  if (capNZD && capNZD > 0) {
    const amountNZD = currency === "NZD" ? amount : amount * USD_TO_NZD;
    pctOfCap = amountNZD / capNZD;
  }
  return { periodLabel: "month to date", amount, currency, capNZD, pctOfCap };
}

/**
 * The registry. Order is the display order on the dashboard.
 * Stripe and Supabase are intentionally NOT given a `fetchSpend` here —
 * Stripe revenue/balance is surfaced in the dedicated Money section of
 * the overview, and Supabase usage isn't exposed to a service-role key.
 */
const CONNECTORS: ConnectorDef[] = [
  {
    id: "openai",
    label: "OpenAI",
    purpose: "Voice transcription (Whisper / gpt-4o-transcribe).",
    envKeys: ["OPENAI_API_KEY"],
    billingUrl:
      "https://platform.openai.com/settings/organization/billing/overview",
    topUpHint: "Prepaid credits — top up before they hit $0 or calls 429.",
    defaultCapNZD: 100,
    capEnvKey: "OPENAI_MONTHLY_CAP_NZD",
    fetchSpend: fetchOpenAISpend,
  },
  {
    id: "anthropic",
    label: "Anthropic",
    purpose: "Quote generation, cleanup, drawing scan, supplier extract.",
    envKeys: ["ANTHROPIC_API_KEY"],
    billingUrl: "https://console.anthropic.com/settings/billing",
    topUpHint: "Prepaid credits / auto-reload — keep a buffer above $0.",
    defaultCapNZD: 200,
    capEnvKey: "ANTHROPIC_MONTHLY_CAP_NZD",
    fetchSpend: fetchAnthropicSpend,
  },
  {
    id: "stripe",
    label: "Stripe",
    purpose: "Subscriptions, checkout, billing portal (your revenue).",
    envKeys: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_ID"],
    billingUrl: "https://dashboard.stripe.com/",
    topUpHint: "Payout account — no top-up needed; see Money section above.",
    defaultCapNZD: null,
  },
  {
    id: "supabase",
    label: "Supabase (self-hosted)",
    purpose: "Auth, Postgres database, file storage — runs on your VPS.",
    envKeys: ["SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_URL"],
    billingUrl: "https://my.contabo.com/",
    topUpHint:
      "No subscription — self-hosted on the VPS. Watch disk space; daily backups land in /var/backups/tradies2quote.",
    defaultCapNZD: null,
  },
  {
    id: "resend",
    label: "Resend",
    purpose: "Transactional + lifecycle email (trial nudges, quote send).",
    envKeys: ["RESEND_API_KEY"],
    billingUrl: "https://resend.com/settings/billing",
    topUpHint: "Free tier ~3,000 emails/mo — upgrade before you hit the cap.",
    defaultCapNZD: null,
  },
  {
    id: "twilio",
    label: "Twilio",
    purpose: "SMS (quote/invoice notifications to clients).",
    envKeys: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"],
    billingUrl: "https://console.twilio.com/us1/billing/manage-billing/billing-overview",
    topUpHint: "Prepaid credit — the card shows what's left; top up before $0.",
    defaultCapNZD: null,
    fetchSpend: fetchTwilioBalance,
  },
  {
    id: "vps",
    label: "VPS hosting (Contabo)",
    purpose: "The server everything runs on — app, Supabase, Caddy, backups.",
    envKeys: [],
    billingUrl: "https://my.contabo.com/",
    topUpHint:
      "Monthly invoice — keep the payment method valid; if this lapses the whole site goes down.",
    defaultCapNZD: null,
  },
  {
    id: "domain",
    label: "Domain — tradies2quote.com",
    purpose: "Your web address (registered at Name.com).",
    envKeys: [],
    billingUrl: "https://www.name.com/account/domain",
    topUpHint:
      "Renews 8 May 2027 — keep auto-renew on and the card valid, or the site and email links die.",
    defaultCapNZD: null,
  },
  {
    id: "webpush",
    label: "Web Push",
    purpose: "Browser push notifications (VAPID keypair).",
    envKeys: ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"],
    billingUrl:
      "https://developer.mozilla.org/en-US/docs/Web/API/Push_API", // no billing — keypair lives in env
    topUpHint: "No cost — just needs the VAPID keypair set.",
    defaultCapNZD: null,
  },
];

function capFor(def: ConnectorDef): number | null {
  if (def.capEnvKey) {
    const raw = process.env[def.capEnvKey];
    if (raw && !Number.isNaN(Number(raw))) return Number(raw);
  }
  return def.defaultCapNZD;
}

/**
 * Build the connector cards. Probes env presence for each, then (in
 * parallel) attempts any wired live-cost fetcher. Never throws — a
 * failing fetcher degrades that card to a note, the rest still render.
 */
export async function buildConnectorCards(): Promise<ConnectorCard[]> {
  return Promise.all(
    CONNECTORS.map(async (def): Promise<ConnectorCard> => {
      // "Configured" means every listed env key is present (an empty
      // envKeys list — e.g. Vercel — is treated as always-configured).
      const configured =
        def.envKeys.length === 0 ||
        def.envKeys.every((k) => Boolean(process.env[k]));
      const capNZD = capFor(def);

      let spend: ConnectorSpend | null = null;
      let note: string | null = null;
      const status: ConnectorStatus = configured ? "ok" : "missing";

      if (!configured) {
        note = `Not configured — missing ${def.envKeys
          .filter((k) => !process.env[k])
          .join(", ")}.`;
      } else if (def.fetchSpend) {
        const result = await def.fetchSpend(capNZD);
        if (result.ok) {
          spend = result.spend;
        } else {
          note = result.note;
        }
      }

      return {
        id: def.id,
        label: def.label,
        purpose: def.purpose,
        configured,
        status,
        billingUrl: def.billingUrl,
        topUpHint: def.topUpHint,
        spend,
        note,
      };
    }),
  );
}
