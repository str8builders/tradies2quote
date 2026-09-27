/**
 * The new-look job page (app/app/quotes/preview/[id]/_v2): the generating
 * panel, then JobScreen with its status rail, total card and "What's in the
 * job", and the sheets that move the job along: "Change this line", "Send to
 * Sam", "Send the invoice to Sam", "Mark as paid?" and "More tools". Hints,
 * pills and buttons follow job-view.ts for each stage; the example job's
 * figures (24 m² × $110, 24 hr × $65, $4,830 with GST).
 */
import type { ReactNode } from "react";
import {
  Barcode,
  CaretDown,
  CaretRight,
  Check,
  CheckCircle,
  EnvelopeSimple,
  LinkSimple,
  PaperPlaneTilt,
  Plus,
  Receipt,
} from "@phosphor-icons/react/dist/ssr";
import { EXAMPLE } from "../../demo-script";
import { BottomBar, Button, Card, Field, Muted, NL, Page, Pill, Row, SectionTitle, Sheet, StatusRail, TopBar, money, type Tone } from "./ui";
import { Tap } from "../ui";

export type LineView = { description: string; qty: number; unit: string; price: number; flash?: number; badge?: string };

const DECK: LineView = { description: "Decking & fixings", qty: 24, unit: "m²", price: 110 };
const LABOUR_FINAL: LineView = { description: "Site preparation & installation", qty: 24, unit: "hr", price: 65 };
/** The AI's draft labour: 26 hr at the default $60 (the tradie makes it 24 hr at their $65 in Check). */
export const LABOUR_DRAFT: LineView = { ...LABOUR_FINAL, qty: 26, price: 60 };
export { DECK, LABOUR_FINAL };

export type JobStage = "draft" | "sent" | "accepted" | "done" | "invoiced" | "paid";

/** job-view.ts, per stage: the rail's current step, the hint, the pill and the buttons. */
const STAGE: Record<JobStage, { rail: number; hint: string; pill: string; tone: Tone; main: string | null; secondary?: string }> = {
  draft: { rail: 1, hint: "Next: send it to Sam.", pill: "Draft", tone: "neutral", main: "Send to Sam" },
  sent: { rail: 2, hint: "Sent 23 Sept. Waiting for Sam to say yes.", pill: "Sent 23 Sept", tone: "info", main: "Send a reminder", secondary: "They said yes" },
  accepted: { rail: 3, hint: "Sam said yes on 24 Sept. Next: book a day for the job.", pill: "Accepted 24 Sept", tone: "ok", main: "Book the job" },
  done: { rail: 5, hint: "Job done. Next: send the invoice.", pill: "Done", tone: "ok", main: "Send invoice" },
  invoiced: { rail: 5, hint: "Invoice sent. Due 8 Oct. Mark it paid when the money’s in.", pill: "Invoice sent", tone: "info", main: "Mark as paid", secondary: "Send a reminder" },
  paid: { rail: 6, hint: "Paid on 8 Oct. All done.", pill: "Paid 8 Oct", tone: "ok", main: null },
};

/** The generating panel: "Writing your quote…", then "Your quote is ready". */
export function GeneratingScreen({ t, elapsed, done }: { t: number; elapsed: number; done: boolean }) {
  return (
    <>
      <Page top={134}>
        <StatusRail current={0} />
        <Card style={{ marginTop: 24, padding: 22, textAlign: "center" }}>
          <div style={{ display: "grid", placeItems: "center", height: 64 }}>
            {done ? (
              <div style={{ color: NL.ok, display: "grid" }}>
                <CheckCircle size={56} weight="fill" />
              </div>
            ) : (
              <div style={{ width: 44, height: 44, borderRadius: 999, border: `4px solid ${NL.line}`, borderTopColor: NL.brand, transform: `rotate(${t * 360}deg)` }} />
            )}
          </div>
          <div style={{ marginTop: 12, fontSize: 20, fontWeight: 700 }}>{done ? "Your quote is ready" : "Writing your quote…"}</div>
          <Muted style={{ marginTop: 6 }}>{done ? "Opening your review." : "Turning your job details into materials, labour and a total for you to check."}</Muted>
          {!done ? <Muted size={14} style={{ marginTop: 10, fontVariantNumeric: "tabular-nums" }}>{`0:${String(elapsed).padStart(2, "0")} elapsed`}</Muted> : null}
        </Card>
      </Page>
      <TopBar back="Back" title="New quote" subtitle={`Quote ${EXAMPLE.quoteNumber}`} />
    </>
  );
}

function LineRow({ line, last = false, highlight = 0 }: { line: LineView; last?: boolean; highlight?: number }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "12px 14px",
        borderBottom: last ? "none" : `1px solid ${NL.line}`,
        background: `rgba(255, 95, 21, ${0.14 * Math.max(highlight, line.flash ?? 0)})`,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 17, fontWeight: 600, color: NL.text }}>{line.description}</div>
        <div style={{ fontSize: 15, color: NL.muted, fontVariantNumeric: "tabular-nums" }}>
          {line.qty} {line.unit} × {money(line.price)}
          {line.badge ? <span style={{ marginLeft: 8 }}><Pill tone="info">{line.badge}</Pill></span> : null}
        </div>
      </div>
      <div style={{ fontSize: 17, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{money(line.qty * line.price)}</div>
      <CaretRight size={16} weight="bold" color={NL.faint} />
    </div>
  );
}

function Group({ name, lines, highlight = 0 }: { name: string; lines: LineView[]; highlight?: number }) {
  const subtotal = lines.reduce((s, l) => s + l.qty * l.price, 0);
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 600, color: NL.muted, marginBottom: 6 }}>
        <span>{name}</span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{money(subtotal)}</span>
      </div>
      <div style={{ borderRadius: 16, border: `1px solid ${NL.line}`, background: NL.surface, overflow: "hidden" }}>
        {lines.map((l, i) => (
          <LineRow key={l.description} line={l} last={i === lines.length - 1} highlight={highlight} />
        ))}
      </div>
    </div>
  );
}

/** Who the quote is for (the example's Sam Taylor unless given). */
export type JobClient = { name: string; email: string };
const SAM: JobClient = { name: EXAMPLE.client, email: EXAMPLE.clientEmail };

/**
 * The job page. `labour` null leaves the job with just its materials (the
 * T2QCAL hand-off makes a one-line draft). `client` null is a draft nobody's
 * been picked for yet (what T2QCAL's Send to a quote makes): the page says
 * so the way job-view.ts does ("Next: add who the quote is for…", "No
 * client details yet", "Send the quote").
 */
export function JobScreen({
  stage,
  labour = LABOUR_FINAL,
  materials = DECK,
  scroll = 0,
  pressMain = 0,
  labourHighlight = 0,
  scanPress = 0,
  total,
  title = EXAMPLE.job,
  client = SAM,
}: {
  stage: JobStage;
  labour?: LineView | null;
  materials?: LineView;
  scroll?: number;
  pressMain?: number;
  labourHighlight?: number;
  scanPress?: number;
  total?: number;
  title?: string;
  client?: JobClient | null;
}) {
  const s = STAGE[stage];
  const noClient = stage === "draft" && !client;
  const hint = noClient ? "Next: add who the quote is for, then send it." : s.hint;
  const main = noClient ? "Send the quote" : s.main;
  const before = (labour ? labour.qty * labour.price : 0) + materials.qty * materials.price;
  const sum = total ?? Math.round(before * 1.15 * 100) / 100;
  const locked = stage !== "draft";
  return (
    <>
      <Page top={130} scroll={scroll}>
        <StatusRail current={s.rail} />
        <Muted size={15} style={{ marginTop: 10 }}>
          {hint}
        </Muted>
        <Card style={{ marginTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
            <div>
              <div style={{ fontSize: 14, color: NL.muted }}>Total incl. GST</div>
              <div style={{ fontSize: 38, fontWeight: 700, letterSpacing: "-0.01em", fontVariantNumeric: "tabular-nums" }}>{money(sum)}</div>
            </div>
            <Pill tone={s.tone}>{s.pill}</Pill>
          </div>
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${NL.line}`, display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 36, color: NL.brandText, fontWeight: 600, fontSize: 16 }}>
            How it adds up <CaretDown size={16} weight="bold" />
          </div>
        </Card>
        <SectionTitle>What’s in the job</SectionTitle>
        {labour ? <Group name="Labour" lines={[labour]} highlight={labourHighlight} /> : null}
        <Group name="Materials" lines={[materials]} />
        {!locked ? (
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
            <Button variant="secondary" icon={<Plus size={18} weight="bold" />}>
              Add a line
            </Button>
            <Button variant="secondary" icon={<Barcode size={18} weight="bold" />} pressed={scanPress}>
              Scan barcode
            </Button>
          </div>
        ) : null}
        <SectionTitle>Client</SectionTitle>
        <Card>
          {client ? (
            <Row title={client.name} subtitle={client.email} trailing={<Button variant="ghost">Edit</Button>} />
          ) : (
            <>
              <Muted>No client details yet.</Muted>
              <Button variant="secondary" style={{ marginTop: 12 }}>
                Add the client
              </Button>
            </>
          )}
        </Card>
      </Page>
      <TopBar title={title} subtitle={client?.name} more />
      {main ? (
        <BottomBar>
          {s.secondary ? <Button variant="secondary">{s.secondary}</Button> : null}
          <Button pressed={pressMain} icon={stage === "draft" ? <PaperPlaneTilt size={20} weight="bold" /> : stage === "done" ? <Receipt size={20} weight="bold" /> : undefined}>
            {main}
          </Button>
        </BottomBar>
      ) : (
        <BottomBar>
          <div style={{ minHeight: 56, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 18, fontWeight: 600, color: NL.ok }}>
            <CheckCircle size={24} weight="fill" /> Paid. Nice work.
          </div>
        </BottomBar>
      )}
    </>
  );
}

/** Where the bottom bar's main button sits (one button, or with a secondary above it). */
export const MAIN_BUTTON_Y = 844 - 34 - 28;

/** "Change this line" for the labour line: the kind, what it is, how many, the price. */
export function LineSheet({ enter, qty, price, focus, press }: { enter: number; qty: string; price: string; focus: "qty" | "price" | null; press: number }) {
  return (
    <Sheet
      enter={enter}
      top={156}
      title="Change this line"
      footer={
        <>
          <Button variant="ghost" style={{ color: NL.bad }}>
            Delete this line
          </Button>
          <Button pressed={press}>Save</Button>
        </>
      }
    >
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>What kind of line?</div>
      <div style={{ display: "flex", borderRadius: 12, border: `1px solid ${NL.line}`, background: NL.bg, padding: 3 }}>
        {["Material", "Labour", "Other"].map((k) => (
          <div
            key={k}
            style={{
              flex: 1,
              minHeight: 42,
              borderRadius: 9,
              display: "grid",
              placeItems: "center",
              fontSize: 15,
              fontWeight: 600,
              color: k === "Labour" ? NL.onBrand : NL.muted,
              background: k === "Labour" ? NL.brand : "transparent",
            }}
          >
            {k}
          </div>
        ))}
      </div>
      <Field label="What is it?" value="Site preparation & installation" style={{ marginTop: 14 }} />
      <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="How many?" value={qty} focused={focus === "qty"} />
        <Field label="Unit" value="hr" />
      </div>
      <Field label="Price per hour" prefix="$" value={price} focused={focus === "price"} style={{ marginTop: 14 }} />
    </Sheet>
  );
}

/** "Send to Sam": email or text; then "Sent to Sam". */
export function SendSheet({ enter, sent, press }: { enter: number; sent: boolean; press: number }) {
  if (sent) {
    return (
      <Sheet
        enter={enter}
        top={470}
        title="Sent to Sam"
        description="They’ll get an email with the quote."
        footer={
          <>
            <Button variant="secondary" icon={<LinkSimple size={18} weight="bold" />}>
              Copy the link
            </Button>
            <Button>Done</Button>
          </>
        }
      >
        <Muted size={16}>The link lets them see the quote and accept it. Copy it to send another way too.</Muted>
      </Sheet>
    );
  }
  return (
    <Sheet
      enter={enter}
      top={520}
      title="Send to Sam"
      description="Pick how they get it."
      footer={
        <Button icon={<EnvelopeSimple size={20} weight="bold" />} pressed={press}>
          Send by email
        </Button>
      }
    >
      {/* The example client has only an email address (no mobile is shown, so none is made up). */}
      <Card style={{ padding: "4px 14px" }}>
        <Row icon={<EnvelopeSimple size={22} weight="bold" />} tone="brand" title="Email" subtitle={EXAMPLE.clientEmail} />
      </Card>
    </Sheet>
  );
}

/** "Send the invoice to Sam". */
export function InvoiceSheet({ enter, press }: { enter: number; press: number }) {
  return (
    <Sheet
      enter={enter}
      top={540}
      title="Send the invoice to Sam"
      description="Due 7 days after you send it."
      footer={
        <Button icon={<Receipt size={20} weight="bold" />} pressed={press}>
          Send invoice
        </Button>
      }
    >
      <div style={{ fontSize: 30, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{money(EXAMPLE.total)}</div>
      <Muted size={16}>to {EXAMPLE.clientEmail}</Muted>
    </Sheet>
  );
}

/** "Mark as paid?" */
export function MarkPaidSheet({ enter, press }: { enter: number; press: number }) {
  return (
    <Sheet
      enter={enter}
      top={620}
      title="Mark as paid?"
      description="Only once the money is in your account."
      footer={
        <Button icon={<Check size={20} weight="bold" />} pressed={press}>
          Yes, it’s paid
        </Button>
      }
    />
  );
}

/** "More tools" opened on "How the numbers were worked out" (the T2QCAL line's record). */
export function MoreToolsSheet({
  enter,
  rows,
  line = "Decking & fixings",
  tool = "Deck subframe",
}: {
  enter: number;
  rows: ReadonlyArray<readonly [string, string]>;
  /** The quote line the working belongs to, and the T2QCAL calculator that made it. */
  line?: string;
  tool?: string;
}) {
  return (
    <Sheet enter={enter} top={170} title="More tools" description="Everything else for this job.">
      <div style={{ fontSize: 18, fontWeight: 700 }}>How the numbers were worked out</div>
      <div style={{ marginTop: 10, fontSize: 17, fontWeight: 600 }}>{line}</div>
      <div style={{ marginTop: 10, paddingTop: 12, borderTop: `1px solid ${NL.line}` }}>
        {/* As T2QCALWorking draws it in the new look: sentence case, orange, semibold. */}
        <div style={{ fontSize: 15, fontWeight: 600, color: NL.brandText }}>T2QCAL calculation record</div>
        <div style={{ marginTop: 4, fontSize: 17, color: NL.text }}>{tool}</div>
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 7 }}>
          {rows.map(([label, value]) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: 15 }}>
              <span style={{ color: NL.muted }}>{label}</span>
              <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums", color: NL.text }}>{value}</span>
            </div>
          ))}
        </div>
      </div>
    </Sheet>
  );
}

export function TapAt({ tap }: { tap: { x: number; y: number; p: number } | null }): ReactNode {
  return tap ? <Tap {...tap} /> : null;
}
