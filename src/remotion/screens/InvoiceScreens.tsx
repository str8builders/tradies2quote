/**
 * Invoicing: the quote's invoice card (`InvoiceDraftCard.tsx`) from "Ready to
 * invoice." through a draft to paid, and the invoices list
 * (`/app/invoices`: "Money in." with status tiles and rows).
 */
import type { CSSProperties, ReactNode } from "react";
import { Check, CheckCircle, EnvelopeSimple, Receipt } from "@phosphor-icons/react/dist/ssr";
import { EXAMPLE, formatMoney } from "../demo-script";
import { C, FONT } from "../marketing/theme";
import { AppCanvas, Avatar, BottomNav, Card, GhostButton, H1, MonoLabel, Page, PageIntro, Pill, PrimaryButton, Tap, TopScrim } from "./ui";

export type InvoiceStage = "ready" | "draft" | "paid";

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ borderRadius: 12, border: "1px solid #ffffff14", background: "#ffffff06", padding: "10px 12px" }}>
      <MonoLabel size={9.5} color="#A3A3A3">
        {label}
      </MonoLabel>
      <div style={{ marginTop: 4, fontSize: 16, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}

/** The invoice card on the quote page, in each of its stages. */
export function InvoiceCard({ stage, press = 0, paidFlash = 0 }: { stage: InvoiceStage; press?: number; paidFlash?: number }) {
  return (
    <Card tone="invoices" style={{ padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <MonoLabel size={10.5} color="#bddcf5">
          {"// invoice"}
        </MonoLabel>
        {stage === "draft" ? <Pill kind="neutral">draft</Pill> : null}
        {stage === "paid" ? (
          <Pill kind="paid" style={{ transform: `scale(${1 + 0.25 * paidFlash})` }}>
            paid
          </Pill>
        ) : null}
      </div>
      {stage === "ready" ? (
        <>
          <H1 size={24} style={{ marginTop: 10 }}>
            Ready to invoice.
          </H1>
          <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.55, color: C.ink300 }}>
            Generate a draft invoice from this quote. Nothing is sent until you say so.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 14 }}>
            <Tile label="Subtotal" value={formatMoney(EXAMPLE.subtotal)} />
            <Tile label="Tax" value={formatMoney(EXAMPLE.gst)} />
            <Tile label="Total" value={formatMoney(EXAMPLE.total)} />
            <Tile label="Due" value="In 7 days" />
          </div>
          <PrimaryButton style={{ marginTop: 16, minHeight: 48, fontSize: 15 }} pressed={press}>
            <Receipt size={18} weight="bold" /> Create draft invoice
          </PrimaryButton>
        </>
      ) : (
        <>
          <H1 size={30} style={{ marginTop: 10, letterSpacing: "-0.03em" }}>
            {EXAMPLE.invoiceNumber}
          </H1>
          <div style={{ marginTop: 6, fontSize: 14, color: C.ink200 }}>
            Total <span style={{ fontWeight: 700, color: "#fff" }}>{formatMoney(EXAMPLE.total)}</span>
            {stage === "paid" ? " · Paid in full" : " · Due in 7 days"}
          </div>
          <div style={{ marginTop: 4, fontSize: 13, color: "#A3A3A3" }}>
            {EXAMPLE.client} · {EXAMPLE.quoteNumber}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 16 }}>
            <PrimaryButton style={{ fontSize: 14 }}>
              <EnvelopeSimple size={17} weight="bold" /> Send invoice
            </PrimaryButton>
            <GhostButton tone="invoices" style={{ fontSize: 14, transform: `scale(${1 - press * 0.03})` }}>
              <Check size={16} weight="bold" /> Mark as paid
            </GhostButton>
          </div>
          {stage === "paid" ? (
            <div
              style={{
                marginTop: 14,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontFamily: FONT.mono,
                fontSize: 11,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: C.emerald300,
              }}
            >
              <CheckCircle size={14} weight="fill" /> {"// marked paid"}
            </div>
          ) : null}
        </>
      )}
      <div style={{ marginTop: 14, fontSize: 12, lineHeight: 1.5, color: "#A3A3A3" }}>
        Drafts live in your records. Send by email + PDF; mark paid when the money lands.
      </div>
    </Card>
  );
}

/** The accepted quote with its invoice card, as the tradie sees it. */
export function InvoiceQuoteScreen({ stage, press = 0, paidFlash = 0, tap = null, scroll = 0 }: { stage: InvoiceStage; press?: number; paidFlash?: number; tap?: { x: number; y: number; p: number } | null; scroll?: number }) {
  return (
    <>
      <AppCanvas tone="invoices" />
      <Page top={112} scroll={scroll}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <MonoLabel size={10.5} color="#bddcf5">
            {EXAMPLE.quoteNumber}
          </MonoLabel>
          <Pill kind="accepted">accepted</Pill>
        </div>
        <H1 style={{ marginTop: 10 }}>{EXAMPLE.job}</H1>
        <div style={{ marginTop: 6, fontSize: 14, color: C.ink300 }}>
          {EXAMPLE.client} · accepted {EXAMPLE.accepted}
        </div>
        <Card tone="invoices" style={{ marginTop: 16, padding: "16px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.mint }}>Quote total</div>
            <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums" }}>{formatMoney(EXAMPLE.total)}</div>
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: C.ink300 }}>NZD · includes GST · signed by {EXAMPLE.client}</div>
        </Card>
        <div style={{ marginTop: 14 }}>
          <InvoiceCard stage={stage} press={press} paidFlash={paidFlash} />
        </div>
      </Page>
      <TopScrim />
      <Avatar />
      <BottomNav active="invoices" />
      {tap ? <Tap x={tap.x} y={tap.y} p={tap.p} /> : null}
    </>
  );
}

const TILE_TONES: Record<string, { border: string; bg: string; color: string }> = {
  All: { border: "rgba(255,95,21,0.4)", bg: "rgba(255,95,21,0.1)", color: C.brand },
  Draft: { border: C.ink600, bg: C.ink800, color: C.ink300 },
  Sent: { border: "rgba(59,130,246,0.4)", bg: "rgba(59,130,246,0.1)", color: C.blue300 },
  Paid: { border: "rgba(16,185,129,0.4)", bg: "rgba(16,185,129,0.1)", color: C.emerald300 },
  Overdue: { border: "rgba(239,68,68,0.4)", bg: "rgba(239,68,68,0.1)", color: "#fca5a5" },
  Cancelled: { border: C.ink600, bg: C.ink800, color: C.ink300 },
};

function StatusTile({ label, count, active }: { label: string; count: number; active?: boolean }) {
  const t = TILE_TONES[label];
  const style: CSSProperties = {
    borderRadius: 3,
    border: `1px solid ${t.border}`,
    background: t.bg,
    padding: "10px 12px",
    boxShadow: active ? `0 0 0 2px #0A0A0A, 0 0 0 4px ${C.brand}` : undefined,
  };
  return (
    <div style={style}>
      <div style={{ fontSize: 22, fontWeight: 700, color: "#fff" }}>{count}</div>
      <MonoLabel size={9.5} color={t.color} style={{ marginTop: 2, letterSpacing: "0.16em" }}>
        {label}
      </MonoLabel>
    </div>
  );
}

function InvoiceRow({ status, extra }: { status: "draft" | "paid"; extra?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 0" }}>
      <Receipt size={22} weight="duotone" color={C.brand} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em" }}>{EXAMPLE.invoiceNumber}</div>
        <div style={{ fontSize: 13, color: C.ink200 }}>{EXAMPLE.client}</div>
        <div style={{ fontFamily: FONT.mono, fontSize: 10, letterSpacing: "0.14em", color: "#A3A3A3", marginTop: 2, textTransform: "uppercase" }}>
          {status === "paid" ? `${EXAMPLE.accepted} · Paid ${EXAMPLE.paid}` : `${EXAMPLE.accepted} · Due in 7 days`}
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 16, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{formatMoney(EXAMPLE.total)}</div>
        <Pill kind={status === "paid" ? "paid" : "neutral"} style={{ marginTop: 4 }}>
          {status}
        </Pill>
      </div>
      {extra}
    </div>
  );
}

export function InvoicesListScreen({ scroll = 0 }: { scroll?: number }) {
  return (
    <>
      <AppCanvas tone="invoices" />
      <Page top={112} scroll={scroll}>
        <PageIntro
          tone="invoices"
          eyebrow="// invoices"
          title="Money in."
          body="Every invoice you've ever drafted, sent or marked paid. Filter by status with the tiles below."
        />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 16 }}>
          <StatusTile label="All" count={1} active />
          <StatusTile label="Draft" count={0} />
          <StatusTile label="Sent" count={0} />
          <StatusTile label="Paid" count={1} />
          <StatusTile label="Overdue" count={0} />
          <StatusTile label="Cancelled" count={0} />
        </div>
        <Card tone="invoices" style={{ marginTop: 16, padding: "14px 20px" }}>
          <MonoLabel size={10} color="#A3A3A3">
            {"// 1 invoice"}
          </MonoLabel>
          <InvoiceRow status="paid" />
        </Card>
      </Page>
      <TopScrim />
      <Avatar />
      <BottomNav active="invoices" />
    </>
  );
}
