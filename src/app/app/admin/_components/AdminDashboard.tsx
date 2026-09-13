"use client";

import { formatNZShortDate } from "@/lib/format-date";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMounted } from "@/lib/use-mounted";
import {
  ArrowClockwise,
  ArrowSquareOut,
  CheckCircle,
  CurrencyDollar,
  Plugs,
  TrendUp,
  Warning,
  WarningCircle,
} from "@phosphor-icons/react";
import type { AdminOverview } from "@/lib/admin/overview";
import type { ConnectorCard } from "@/lib/admin/connectors";

/**
 * Owner Ops dashboard — client shell.
 *
 * Renders the server-built overview, then quietly re-polls
 * /api/admin/overview every 30s for a live feed. A manual refresh
 * button is always available. Nothing here is editable — it's a
 * read-only founder cockpit for "what's making money / running out".
 */

interface Props {
  initial: AdminOverview;
}

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-NZ", {
      style: "currency",
      currency,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

// Stable, timezone-pinned absolute date — deterministic across server (UTC) and
// the visitor's browser, so it's safe to render during SSR + first paint.
function nzShortDate(iso: string): string {
  // Engine-independent: Intl month names differ between Node and WebKit.
  return formatNZShortDate(iso);
}

function relTime(iso: string, mounted: boolean): string {
  if (!mounted) return nzShortDate(iso); // stable until mounted — no Date.now() in SSR
  const then = new Date(iso).getTime();
  const secs = Math.round((Date.now() - then) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return nzShortDate(iso);
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="t2q-card-pro p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400">
        {label}
      </p>
      <p className="mt-1 font-display text-2xl uppercase tracking-tight text-white">
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-ink-400">{hint}</p> : null}
    </div>
  );
}

export function AdminDashboard({ initial }: Props) {
  // Relative timestamps read Date.now(); gate them so SSR + first paint render a
  // stable absolute date, then swap to "5m ago" after mount.
  const mounted = useMounted();
  const [data, setData] = useState<AdminOverview>(initial);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/admin/overview", { cache: "no-store" });
      if (!res.ok) throw new Error(`Refresh failed (${res.status})`);
      const next = (await res.json()) as AdminOverview;
      setData(next);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    timer.current = setInterval(refresh, 30_000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [refresh]);

  const { money: m, growth: g, connectors } = data;

  return (
    <div className="space-y-10">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="t2q-section-label-pro mb-2">{"// ops · live"}</div>
          <h1 className="font-display text-3xl uppercase tracking-tight sm:text-4xl">
            Ops <span className="text-brand">cockpit.</span>
          </h1>
          <p className="mt-2 text-sm text-ink-400">
            Updated {relTime(data.generatedAt, mounted)} · auto-refresh 30s
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          className="t2q-btn-ghost-pro inline-flex items-center gap-2 px-4 py-2 text-sm disabled:opacity-60"
        >
          <ArrowClockwise
            size={16}
            weight="bold"
            className={refreshing ? "animate-spin" : ""}
          />
          Refresh
        </button>
      </header>

      {fetchError ? (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-600">
          <WarningCircle size={18} weight="bold" />
          {fetchError}
        </div>
      ) : null}

      {/* ── MONEY ──────────────────────────────────────────────── */}
      <section>
        <SectionHeader icon={CurrencyDollar} title="Money" tint="brand" />
        {!m.stripeConfigured ? (
          <EmptyNote text="Stripe isn't configured in this environment." />
        ) : m.error ? (
          <ErrorNote text={m.error} />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <Stat
                label="MRR"
                value={money(m.mrr, m.currency)}
                hint="active + trialing"
              />
              <Stat label="Active subs" value={String(m.activeSubs)} />
              <Stat label="Trialing" value={String(m.trialingSubs)} />
              <Stat
                label="Past due"
                value={String(m.pastDueSubs)}
                hint={m.pastDueSubs > 0 ? "needs attention" : undefined}
              />
              <Stat
                label="Balance avail."
                value={
                  m.balanceAvailable === null
                    ? "—"
                    : money(m.balanceAvailable, m.currency)
                }
              />
              <Stat
                label="Pending"
                value={
                  m.balancePending === null
                    ? "—"
                    : money(m.balancePending, m.currency)
                }
              />
              <Stat label="Canceled" value={String(m.canceledSubs)} />
            </div>

            {m.recentPayments.length > 0 ? (
              <div className="t2q-card-pro mt-4 p-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400">
                  Recent payments
                </p>
                <ul className="mt-3 divide-y divide-ink-700/40">
                  {m.recentPayments.map((p, i) => (
                    <li
                      key={`${p.created}-${i}`}
                      className="flex items-center justify-between gap-3 py-2 text-sm"
                    >
                      <span className="min-w-0 flex-1 truncate text-ink-300">
                        {p.email ?? "—"}
                      </span>
                      <span className="shrink-0 font-semibold text-white">
                        {money(p.amount, p.currency)}
                      </span>
                      <span className="w-16 shrink-0 text-right text-xs text-ink-400">
                        {relTime(p.created, mounted)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </section>

      {/* ── GROWTH ─────────────────────────────────────────────── */}
      <section>
        <SectionHeader icon={TrendUp} title="Growth" tint="hivis" />
        {g.error ? (
          <ErrorNote text={g.error} />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <Stat label="Total users" value={String(g.totalUsers)} />
              <Stat label="New · 7d" value={String(g.newUsers7d)} />
              <Stat label="New · 30d" value={String(g.newUsers30d)} />
              <Stat label="In trial" value={String(g.inTrial)} />
              <Stat label="Paying" value={String(g.paying)} />
              <Stat label="Quotes · 24h" value={String(g.quotesLast24h)} />
              <Stat label="Quotes · 7d" value={String(g.quotesLast7d)} />
            </div>

            {/* The "running out" feed */}
            <div className="mt-4">
              <p className="t2q-section-label-pro mb-2">
                {"// trials ending ≤ 3 days"}
              </p>
              {g.expiringSoon.length === 0 ? (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-600">
                  <CheckCircle size={18} weight="fill" />
                  No trials ending in the next 3 days.
                </div>
              ) : (
                <ul className="space-y-2">
                  {g.expiringSoon.map((t) => (
                    <li
                      key={t.email}
                      className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm"
                    >
                      <span className="inline-flex min-w-0 items-center gap-2">
                        <Warning
                          size={16}
                          weight="fill"
                          className="shrink-0 text-amber-600"
                        />
                        <span className="truncate text-white">{t.email}</span>
                      </span>
                      <span className="shrink-0 font-mono text-xs uppercase tracking-[0.15em] text-amber-600">
                        {t.daysLeft === 1
                          ? "1 day left"
                          : `${t.daysLeft} days left`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </section>

      {/* ── CONNECTORS ─────────────────────────────────────────── */}
      <section>
        <SectionHeader icon={Plugs} title="Connectors" tint="brand" />
        <div className="grid gap-3 sm:grid-cols-2">
          {connectors.map((c) => (
            <ConnectorTile key={c.id} c={c} />
          ))}
        </div>
      </section>
    </div>
  );
}

function ConnectorTile({ c }: { c: ConnectorCard }) {
  const ok = c.status === "ok";
  const pct =
    c.spend && c.spend.pctOfCap !== null
      ? Math.max(0, Math.min(1.2, c.spend.pctOfCap))
      : null;
  const barColor =
    pct === null
      ? "bg-ink-500"
      : pct >= 1
        ? "bg-red-500"
        : pct >= 0.7
          ? "bg-amber-500"
          : "bg-emerald-500";

  return (
    <div className="t2q-card-pro flex flex-col p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-base uppercase tracking-tight text-white">
            {c.label}
          </p>
          <p className="mt-0.5 text-xs text-ink-400">{c.purpose}</p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.15em] ${
            ok
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
              : "border-amber-500/40 bg-amber-500/10 text-amber-600"
          }`}
        >
          {ok ? (
            <CheckCircle size={11} weight="fill" />
          ) : (
            <WarningCircle size={11} weight="fill" />
          )}
          {ok ? "Configured" : "Missing"}
        </span>
      </div>

      {c.spend ? (
        <div className="mt-3">
          <div className="flex items-baseline justify-between">
            <span className="font-semibold text-white">
              {money(c.spend.amount, c.spend.currency)}
            </span>
            <span className="text-xs text-ink-400">
              {c.spend.periodLabel}
              {c.spend.capNZD ? ` · cap NZ$${c.spend.capNZD}` : ""}
            </span>
          </div>
          {pct !== null ? (
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-ink-700/50">
              <div
                className={`h-full ${barColor}`}
                style={{ width: `${Math.min(100, pct * 100)}%` }}
              />
            </div>
          ) : null}
        </div>
      ) : c.note ? (
        <p className="mt-3 text-xs leading-relaxed text-ink-400">{c.note}</p>
      ) : null}

      <a
        href={c.billingUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-brand hover:underline"
      >
        Billing console
        <ArrowSquareOut size={12} weight="bold" />
      </a>
      <p className="mt-1.5 text-[11px] leading-snug text-ink-500">
        {c.topUpHint}
      </p>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  tint,
}: {
  icon: typeof CurrencyDollar;
  title: string;
  tint: "brand" | "hivis";
}) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span
        aria-hidden="true"
        className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border ${
          tint === "brand"
            ? "border-brand/30 bg-brand/10 text-brand"
            : "border-hivis/40 bg-hivis/10 text-hivis"
        }`}
      >
        <Icon size={18} weight="bold" />
      </span>
      <h2 className="font-display text-xl uppercase tracking-tight text-white">
        {title}
      </h2>
    </div>
  );
}

function EmptyNote({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-ink-700/50 bg-ink-900/30 px-4 py-3 text-sm text-ink-400">
      {text}
    </div>
  );
}

function ErrorNote({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-500">
      <WarningCircle size={18} weight="bold" />
      {text}
    </div>
  );
}
