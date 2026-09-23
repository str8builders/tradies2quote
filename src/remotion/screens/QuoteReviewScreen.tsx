/**
 * Quote generation and the quote review page (`/app/quotes/preview/[id]`:
 * page.tsx, QuoteGenerator, QuoteEditor, QuoteReviewSection, StickyActionBar).
 */
import type { CSSProperties, ReactNode } from "react";
import {
  ArrowLeft,
  Calculator,
  ChatCircleText,
  Check,
  CheckCircle,
  EnvelopeSimple,
  FloppyDisk,
  Plus,
  Trash,
} from "@phosphor-icons/react/dist/ssr";
import { EXAMPLE, formatMoney, lineTotal } from "../demo-script";
import { C, FONT } from "../marketing/theme";
import {
  Accent,
  AppCanvas,
  Avatar,
  BottomNav,
  Card,
  FieldLabel,
  GhostButton,
  H1,
  Input,
  Page,
  Pill,
  PrimaryButton,
  ReviewSection,
  SectionLabel,
  Tap,
  TopScrim,
  TotalsRow,
} from "./ui";
import { TapeGauge } from "./TapeGauge";

/* ─── Generation ─────────────────────────────────────────────────────────── */

export function GeneratingCard({ progress, complete, elapsed }: { progress: number; complete: boolean; elapsed: string }) {
  const step = (label: string, state: "done" | "current" | "todo") => (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        fontSize: 11.5,
        fontWeight: state === "current" ? 700 : 500,
        color: state === "done" ? "#9fe1bb" : state === "current" ? "#ffd0a0" : "#81928c",
      }}
    >
      {state === "done" ? <Check size={13} weight="bold" /> : null}
      {label}
    </div>
  );
  return (
    <Card style={{ minHeight: 340, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 24 }}>
      <TapeGauge progress={progress} width={300} />
      <div style={{ display: "flex", justifyContent: "space-between", width: 300, marginTop: 14 }}>
        {step("Job saved", "done")}
        {step("Writing quote", complete ? "done" : "current")}
        {step("Ready to review", complete ? "current" : "todo")}
      </div>
      <div style={{ marginTop: 24, fontSize: 24, fontWeight: 600, letterSpacing: "-0.04em" }}>
        {complete ? "Your quote is ready." : "Writing your quote…"}
      </div>
      <div style={{ marginTop: 12, maxWidth: 290, fontSize: 14, lineHeight: 1.55, color: C.ink300 }}>
        {complete ? "Opening your review." : "Turning your job details into materials, labour and a total for you to check."}
      </div>
      <div style={{ marginTop: 16, fontSize: 12, color: "#A3A3A3", fontVariantNumeric: "tabular-nums" }}>{elapsed} elapsed</div>
    </Card>
  );
}

export function GeneratingScreen({ progress, complete, elapsed }: { progress: number; complete: boolean; elapsed: string }) {
  return (
    <>
      <AppCanvas />
      <Page top={112}>
        <SectionLabel>{"// step 2 of 3"}</SectionLabel>
        <H1 style={{ marginTop: 10, marginBottom: 18 }}>
          Building your <Accent>quote.</Accent>
        </H1>
        <GeneratingCard progress={progress} complete={complete} elapsed={elapsed} />
      </Page>
      <TopScrim />
      <Avatar />
      <BottomNav active="quotes" />
    </>
  );
}

/* ─── Review page ────────────────────────────────────────────────────────── */

export type Field = "qty" | "price";

export interface LineView {
  /** 0 = not yet dropped in, 1 = in place. */
  enter: number;
  quantity: number;
  unitPrice: number;
  /** Field being edited and exactly what it shows (always the committed value). */
  editing?: { field: Field; text: string; selected: boolean } | null;
  /** 0..1 review tick. */
  checked?: number;
  /** Brief highlight when the line total recalculates. */
  flash?: number;
  badge?: "library" | "calculated" | null;
}

export interface ReviewPageProps {
  scroll?: number;
  status?: "draft" | "sent" | "accepted";
  total: number;
  lineCount?: number;
  breakdown?: { open: number; materials: number; markup: number; labour: number; subtotal: number; gst: number } | null;
  decking?: LineView | null;
  labour?: LineView | null;
  sticky?: { saved?: boolean; sent?: boolean } | null;
  tap?: { x: number; y: number; p: number } | null;
  /** Page content that replaces the line sections (invoice cards etc.). */
  after?: ReactNode;
  showSections?: boolean;
  header?: boolean;
}

/** The app's number inputs show the raw value ("60", "110"), no forced decimals. */
function num(value: number) {
  return String(value);
}

function LineCard({ line, description, unit, view }: { line: "decking" | "labour"; description: string; unit: string; view: LineView }) {
  const enter = view.enter;
  const checked = view.checked ?? 0;
  const qtyEdit = view.editing?.field === "qty" ? view.editing : null;
  const priceEdit = view.editing?.field === "price" ? view.editing : null;
  const badge = view.badge;
  return (
    <div
      style={{
        position: "relative",
        border: `1px solid ${C.ink700}`,
        borderLeft: checked > 0 ? `4px solid rgba(16, 185, 129, ${0.7 * checked})` : `1px solid ${C.ink700}`,
        borderRadius: 3,
        background: C.ink900,
        padding: 8,
        opacity: Math.min(1, enter * 1.4),
        transform: `translateY(${(1 - enter) * -26}px) scale(${0.96 + 0.04 * enter})`,
      }}
    >
      {badge || checked > 0 ? (
        <div style={{ display: "flex", gap: 6, marginBottom: 6, minHeight: 18 }}>
          {badge === "library" ? <Badge color={C.brand} bg="rgba(255,95,21,0.15)">From your library</Badge> : null}
          {badge === "calculated" ? (
            <Badge color="#93c5fd" bg="rgba(59,130,246,0.15)">
              <Calculator size={10} weight="bold" /> Calculated takeoff
            </Badge>
          ) : null}
          {checked > 0 ? (
            <Badge color={C.emerald300} bg="rgba(16,185,129,0.15)" style={{ opacity: checked, transform: `scale(${0.8 + 0.2 * checked})` }}>
              <Check size={10} weight="bold" /> Checked
            </Badge>
          ) : null}
        </div>
      ) : null}
      <div style={{ display: "flex", gap: 8 }}>
        <Input value={description} style={{ flex: 1, minHeight: 36, fontSize: 14 }} />
        <div
          style={{
            width: 38,
            height: 36,
            borderRadius: 3,
            border: `1px solid ${C.ink700}`,
            display: "grid",
            placeItems: "center",
            color: C.ink400,
          }}
        >
          <Trash size={15} weight="bold" />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 6 }}>
        <div>
          <FieldLabel>Qty</FieldLabel>
          <Input
            value={qtyEdit ? qtyEdit.text : num(view.quantity)}
            focused={Boolean(qtyEdit)}
            selected={Boolean(qtyEdit?.selected)}
            caret={Boolean(qtyEdit && !qtyEdit.selected)}
            style={{ marginTop: 4, minHeight: 34 }}
            textStyle={{ fontVariantNumeric: "tabular-nums" }}
          />
        </div>
        <div>
          <FieldLabel>Unit</FieldLabel>
          <Input value={unit} style={{ marginTop: 4, minHeight: 34 }} />
        </div>
        <div>
          <FieldLabel>Unit price</FieldLabel>
          <Input
            value={priceEdit ? priceEdit.text : num(view.unitPrice)}
            focused={Boolean(priceEdit)}
            selected={Boolean(priceEdit?.selected)}
            caret={Boolean(priceEdit && !priceEdit.selected)}
            style={{ marginTop: 4, minHeight: 34 }}
            textStyle={{ fontVariantNumeric: "tabular-nums" }}
          />
        </div>
      </div>
      <div
        data-line={line}
        style={{
          marginTop: 6,
          textAlign: "right",
          fontFamily: FONT.mono,
          fontSize: 11.5,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: C.ink300,
        }}
      >
        Line total:{" "}
        <span
          style={{
            color: "#ffffff",
            fontWeight: 600,
            borderRadius: 3,
            padding: "1px 3px",
            background: view.flash ? `rgba(255, 234, 0, ${0.35 * view.flash})` : "transparent",
          }}
        >
          {formatMoney(lineTotal(view.quantity, view.unitPrice))}
        </span>
      </div>
    </div>
  );
}

function Badge({ children, color, bg, style }: { children: ReactNode; color: string; bg: string; style?: CSSProperties }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        borderRadius: 3,
        background: bg,
        color,
        padding: "2px 6px",
        fontFamily: FONT.mono,
        fontSize: 9.5,
        fontWeight: 500,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

function ItemsCard({ title, accent, addLabel, children }: { title: string; accent: boolean; addLabel: string; children: ReactNode }) {
  return (
    <Card style={{ padding: 14, boxShadow: "none" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: "-0.04em", color: accent ? C.brand : "#ffffff" }}>{title}</div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            fontFamily: FONT.mono,
            fontSize: 10.5,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: C.ink300,
          }}
        >
          <Plus size={12} weight="bold" />
          {addLabel}
        </div>
      </div>
      {children}
    </Card>
  );
}

export function QuoteTotalCard({ total, lineCount = 2, breakdown }: { total: number; lineCount?: number; breakdown?: ReviewPageProps["breakdown"] }) {
  const open = breakdown?.open ?? 0;
  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.mint }}>Quote total</div>
          <div style={{ marginTop: 4, fontSize: 36, fontWeight: 600, letterSpacing: "-0.04em", fontVariantNumeric: "tabular-nums" }}>
            {formatMoney(total)}
          </div>
          <div style={{ marginTop: 4, fontSize: 12, color: C.ink300 }}>NZD · includes GST</div>
        </div>
        <div style={{ textAlign: "right", fontSize: 14, color: C.ink200 }}>
          <div style={{ fontWeight: 600 }}>{EXAMPLE.client}</div>
          <div style={{ marginTop: 4, fontSize: 12, color: "#A3A3A3" }}>
            {lineCount} line{lineCount === 1 ? "" : "s"} · {EXAMPLE.quoteNumber}
          </div>
        </div>
      </div>
      <div style={{ marginTop: 14, fontSize: 14, lineHeight: 1.55, color: C.ink300 }}>{EXAMPLE.jobSummary}</div>
      <div style={{ marginTop: 14, borderTop: "1px solid #c5d6c52b" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 42, paddingTop: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.peach }}>Price breakdown</span>
          <span style={{ fontSize: 22, fontWeight: 400, color: C.peach, transform: `rotate(${45 * open}deg)` }}>+</span>
        </div>
        {breakdown && open > 0 ? (
          <div style={{ overflow: "hidden", maxHeight: 190 * open, opacity: open }}>
            <TotalsRow label="Materials subtotal" value={formatMoney(breakdown.materials)} />
            <TotalsRow label={`Markup (${EXAMPLE.markupPct}%)`} value={formatMoney(breakdown.markup)} />
            <TotalsRow label="Labour subtotal" value={formatMoney(breakdown.labour)} />
            <TotalsRow label="Subtotal (excl. GST)" value={formatMoney(breakdown.subtotal)} divider />
            <TotalsRow label={`GST (${EXAMPLE.gstRate}%)`} value={formatMoney(breakdown.gst)} />
          </div>
        ) : null}
      </div>
    </Card>
  );
}

export function StickyActions({ saved, sent }: { saved?: boolean; sent?: boolean }) {
  return (
    <div
      style={{
        position: "absolute",
        left: 12,
        right: 12,
        bottom: 102,
        height: 62,
        borderRadius: 22,
        border: "1px solid #ffffff14",
        background: "rgba(18, 22, 22, 0.94)",
        boxShadow: "0 12px 30px #0008",
        display: "grid",
        gridTemplateColumns: "1fr 1.15fr 1fr",
        gap: 8,
        padding: 8,
        zIndex: 44,
      }}
    >
      <GhostButton style={{ fontSize: 14 }}>
        {saved ? <CheckCircle size={17} weight="fill" color={C.emerald300} /> : <FloppyDisk size={17} weight="bold" />}
        {saved ? "Saved" : "Save"}
      </GhostButton>
      <PrimaryButton style={{ fontSize: 14 }}>
        {sent ? <CheckCircle size={17} weight="fill" /> : <EnvelopeSimple size={17} weight="bold" />}
        {sent ? "Sent" : "Email"}
      </PrimaryButton>
      <GhostButton style={{ fontSize: 14 }}>
        <ChatCircleText size={17} weight="bold" />
        Text
      </GhostButton>
    </div>
  );
}

export function ReviewHeader({ status = "draft" }: { status?: "draft" | "sent" | "accepted" }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          height: 36,
          padding: "0 13px",
          borderRadius: 8,
          border: "1.5px solid rgba(255,95,21,0.55)",
          background: "rgba(255,95,21,0.08)",
          color: C.brand,
          fontFamily: FONT.mono,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
        }}
      >
        <ArrowLeft size={13} weight="bold" /> Back to quotes
      </div>
      <SectionLabel style={{ marginTop: 16 }}>{"// step 2 of 3"}</SectionLabel>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10 }}>
        <H1>
          Review your <Accent>quote.</Accent>
        </H1>
        <Pill kind={status}>{status}</Pill>
      </div>
      <div style={{ marginTop: 10, fontSize: 14, lineHeight: 1.55, color: C.ink300 }}>
        Check the total, open any section to edit, then save and send.
      </div>
    </div>
  );
}

export function QuoteReviewScreen({
  scroll = 0,
  status = "draft",
  total,
  lineCount = 2,
  breakdown = null,
  decking = null,
  labour = null,
  sticky = null,
  tap = null,
  after = null,
  showSections = true,
  header = true,
}: ReviewPageProps) {
  const [deckLine, labourLine] = EXAMPLE.lines;
  const materialsCount = decking && decking.enter > 0 ? 1 : 0;
  const labourCount = labour && labour.enter > 0 ? 1 : 0;
  return (
    <>
      <AppCanvas />
      <Page scroll={scroll} top={112}>
        {header ? <ReviewHeader status={status} /> : null}
        <QuoteTotalCard total={total} lineCount={lineCount} breakdown={breakdown} />
        {showSections ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
            <ReviewSection
              title="Materials"
              summary={`${materialsCount} item${materialsCount === 1 ? "" : "s"} · ${formatMoney(decking && decking.enter > 0 ? lineTotal(decking.quantity, decking.unitPrice) : 0)}`}
            >
              <ItemsCard title="Materials" accent addLabel="Add material">
                {decking ? <LineCard line="decking" description={deckLine.description} unit={deckLine.unit} view={decking} /> : <EmptyLine />}
              </ItemsCard>
            </ReviewSection>
            <ReviewSection
              title="Labour"
              summary={`${labourCount} item${labourCount === 1 ? "" : "s"} · ${formatMoney(labour && labour.enter > 0 ? lineTotal(labour.quantity, labour.unitPrice) : 0)}`}
            >
              <ItemsCard title="Labour" accent={false} addLabel="Add labour">
                {labour ? <LineCard line="labour" description={labourLine.description} unit={labourLine.unit} view={labour} /> : <EmptyLine />}
              </ItemsCard>
            </ReviewSection>
          </div>
        ) : null}
        {after}
      </Page>
      <TopScrim />
      <Avatar />
      {sticky ? <StickyActions saved={sticky.saved} sent={sticky.sent} /> : null}
      <BottomNav active="quotes" />
      {tap ? <Tap x={tap.x} y={tap.y} p={tap.p} /> : null}
    </>
  );
}

function EmptyLine() {
  return <div style={{ height: 150 }} />;
}

