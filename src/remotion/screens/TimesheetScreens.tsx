/**
 * The timesheet (new look: app/timesheet/_components/ClockCard.tsx,
 * TimesheetView.tsx, InvoiceWeekSheet.tsx) for a solo tradie on the web:
 * clocked in on the Sam Taylor job, "Finish work" with the 30-minute break,
 * the day's hours on the week, then "Invoice this week". Travel km come
 * from the route only the iPhone app records, so they're left out. The
 * wording and colours are the app's (globals.css --ui-* tokens); the
 * figures are the example job's ($65 an hour).
 */
import type { CSSProperties, ReactNode } from "react";
import {
  CaretDown,
  CaretLeft,
  CaretRight,
  GearSix,
  House,
  MapPin,
  NavigationArrow,
  Play,
  Plus,
  Receipt,
  Stop,
  Tag,
  Timer,
  Briefcase,
} from "@phosphor-icons/react/dist/ssr";
import { FONT } from "../marketing/theme";

/** The new look's dark tokens. */
export const UI = {
  bg: "#111110",
  surface: "#1B1B1A",
  surface2: "#242422",
  line: "#34332F",
  text: "#F5F4F0",
  muted: "#BDBBB3",
  brand: "#FF5F15",
  brandText: "#FF8A4C",
  brandSoft: "#3A1D0E",
  ok: "#3CCB7F",
  okSoft: "#15301F",
  info: "#58A6FF",
  infoSoft: "#132A45",
} as const;

/** The example day: 7:02am to 3:17pm with a 30-minute break = 7.75 h. */
export const DAY = { started: "7:02am", finished: "3:17pm", hours: 7.75, rate: 65 } as const;
const money = (n: number) => `$${n.toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const LABOUR = Math.round(DAY.hours * DAY.rate * 100) / 100;
const GST = Math.round(LABOUR * 0.15 * 100) / 100;
export const INVOICE_TOTAL = Math.round((LABOUR + GST) * 100) / 100;

const card: CSSProperties = { borderRadius: 16, border: `1px solid ${UI.line}`, background: UI.surface };

function Button({ children, primary, pressed = 0, style }: { children: ReactNode; primary?: boolean; pressed?: number; style?: CSSProperties }) {
  return (
    <div
      style={{
        minHeight: 50,
        borderRadius: 12,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        fontSize: 16,
        fontWeight: 700,
        color: primary ? "#1a0b03" : UI.text,
        background: primary ? UI.brand : UI.surface,
        border: primary ? "none" : `1px solid ${UI.line}`,
        transform: `scale(${1 - pressed * 0.03})`,
        filter: pressed ? `brightness(${1 + pressed * 0.15})` : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function IconTile({ children, tone }: { children: ReactNode; tone: "ok" | "info" }) {
  return (
    <div
      style={{
        width: 52,
        height: 52,
        flexShrink: 0,
        borderRadius: 14,
        display: "grid",
        placeItems: "center",
        background: tone === "ok" ? UI.okSoft : UI.infoSoft,
        color: tone === "ok" ? UI.ok : UI.info,
      }}
    >
      {children}
    </div>
  );
}

/** A small street map with the job's pin (the app draws the real one). */
function SiteMap() {
  return (
    <div style={{ position: "relative", height: 104, borderRadius: 12, overflow: "hidden", background: "#1f2320", border: `1px solid ${UI.line}` }}>
      <svg width="100%" height="104" viewBox="0 0 326 104" preserveAspectRatio="none" aria-hidden>
        <rect width="326" height="104" fill="#1c201d" />
        <path d="M-10 70 C 60 60, 110 88, 180 64 S 290 40, 340 52" stroke="#3a3f39" strokeWidth="14" fill="none" />
        <path d="M-10 70 C 60 60, 110 88, 180 64 S 290 40, 340 52" stroke="#4a5049" strokeWidth="1.5" strokeDasharray="6 6" fill="none" />
        <path d="M120 -10 L 150 120" stroke="#343934" strokeWidth="9" />
        <path d="M250 -10 L 232 120" stroke="#343934" strokeWidth="7" />
        <rect x="20" y="12" width="70" height="34" rx="4" fill="#232924" />
        <rect x="178" y="80" width="40" height="30" rx="4" fill="#232924" />
      </svg>
      <div style={{ position: "absolute", left: "52%", top: 26, transform: "translate(-50%, 0)", color: UI.brand, display: "grid", filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.6))" }}>
        <MapPin size={30} weight="fill" />
      </div>
    </div>
  );
}

function ClockCard({ open, elapsed, press }: { open: boolean; elapsed: string; press: number }) {
  return (
    <div style={{ ...card, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <IconTile tone={open ? "ok" : "info"}>
          <MapPin size={26} weight="duotone" />
        </IconTile>
        <div style={{ flex: 1, minWidth: 0 }}>
          {open ? (
            <>
              <div style={{ fontSize: 18, fontWeight: 700, color: UI.text }}>Working since {DAY.started}</div>
              <div style={{ fontSize: 14, color: UI.muted, fontVariantNumeric: "tabular-nums" }}>{elapsed}</div>
              <div style={{ fontSize: 14, color: UI.text }}>At the Sam Taylor job</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 18, fontWeight: 700, color: UI.text }}>Not clocked in</div>
              <div style={{ fontSize: 14, color: UI.muted }}>Location on</div>
            </>
          )}
        </div>
        <div style={{ width: 44, height: 44, display: "grid", placeItems: "center", color: UI.muted }}>
          <GearSix size={22} weight="duotone" />
        </div>
      </div>
      <div style={{ marginTop: 14 }}>
        {open ? (
          <Button primary pressed={press}>
            <Stop size={18} weight="fill" /> Finish work
          </Button>
        ) : (
          <Button primary>
            <Play size={18} weight="fill" /> Start work
          </Button>
        )}
      </div>
      {open ? (
        <div style={{ marginTop: 12 }}>
          <SiteMap />
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 14, color: UI.muted }}>
            <span>14 Rata St</span>
            <span style={{ display: "flex", alignItems: "center", gap: 6, color: UI.brandText, fontWeight: 600 }}>
              <NavigationArrow size={15} weight="bold" /> Open in Maps
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DayCard({ logged, flash }: { logged: boolean; flash: number }) {
  return (
    <div style={{ ...card, overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${UI.line}` }}>
        <span style={{ fontSize: 17, fontWeight: 700, color: UI.brandText }}>
          Thu 24 Sept <span style={{ color: UI.muted, fontWeight: 400 }}>· today</span>
        </span>
        <span style={{ fontSize: 15, color: UI.muted }}>{logged ? `${DAY.hours} h` : "Working"}</span>
      </div>
      {logged ? (
        <div style={{ padding: "12px 16px 14px", background: `rgba(255, 95, 21, ${0.12 * flash})` }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 17, fontWeight: 700, color: UI.text }}>
            <span>Sam Taylor</span>
            <span>{DAY.hours} h</span>
          </div>
          <div style={{ marginTop: 3, fontSize: 14.5, color: UI.muted }}>
            {DAY.started} to {DAY.finished} · 30 min break · You
          </div>
          <div style={{ marginTop: 6, display: "flex", gap: 14, fontSize: 14.5, color: UI.text }}>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ color: UI.info, display: "grid" }}>
                <MapPin size={16} weight="regular" />
              </span>
              At the Sam Taylor job
            </span>
          </div>
        </div>
      ) : (
        <div style={{ padding: "14px 16px", fontSize: 14.5, color: UI.muted }}>Clocked in at the Sam Taylor job</div>
      )}
    </div>
  );
}

function BottomNav() {
  const item = (icon: ReactNode, label: string, on = false) => (
    <div style={{ flex: 1, display: "grid", placeItems: "center", gap: 3, color: on ? UI.brandText : UI.muted, fontSize: 11, fontWeight: on ? 700 : 500 }}>
      {icon}
      {label}
    </div>
  );
  return (
    <div
      style={{
        position: "absolute",
        left: 10,
        right: 10,
        bottom: 22,
        height: 64,
        zIndex: 40,
        borderRadius: 22,
        border: `1px solid ${UI.line}`,
        background: "rgba(27,27,26,0.96)",
        display: "flex",
        alignItems: "center",
        padding: "0 6px",
      }}
    >
      {item(<House size={22} weight="duotone" />, "Home")}
      {item(<Briefcase size={22} weight="duotone" />, "Jobs")}
      <div style={{ flex: 1, display: "grid", placeItems: "center" }}>
        <div style={{ width: 46, height: 46, borderRadius: 999, background: UI.brand, color: "#1a0b03", display: "grid", placeItems: "center" }}>
          <Plus size={22} weight="bold" />
        </div>
      </div>
      {item(<Tag size={22} weight="duotone" />, "Prices")}
      {item(<Timer size={22} weight="duotone" />, "Timesheet", true)}
    </div>
  );
}

/**
 * The timesheet page. `open` is the clocked-in state; `scroll` moves the page
 * (to bring the day's hours up after finishing); `flash` highlights the new entry.
 */
export function TimesheetPage({
  open,
  elapsed,
  finishPress = 0,
  invoicePress = 0,
  scroll = 0,
  flash = 0,
}: {
  open: boolean;
  elapsed: string;
  finishPress?: number;
  invoicePress?: number;
  scroll?: number;
  flash?: number;
}) {
  return (
    <>
      <div style={{ position: "absolute", inset: 0, background: UI.bg }} />
      <div style={{ position: "absolute", left: 16, right: 16, top: 62, transform: `translateY(${-scroll}px)`, fontFamily: FONT.display }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: 999,
              background: UI.brand,
              color: "#1a0b03",
              display: "grid",
              placeItems: "center",
              fontWeight: 800,
              fontSize: 17,
              boxShadow: `0 0 0 3px ${UI.bg}, 0 0 0 5px ${UI.brand}`,
            }}
          >
            YB
          </div>
          <div style={{ fontSize: 31, fontWeight: 800, letterSpacing: "-0.02em", color: UI.text }}>Timesheet</div>
        </div>
        <div style={{ marginTop: 10, fontSize: 16, lineHeight: 1.4, color: UI.muted }}>Everyone&apos;s hours, and invoice a client for the week.</div>
        <div style={{ marginTop: 16 }}>
          <ClockCard open={open} elapsed={elapsed} press={finishPress} />
        </div>
        <div style={{ marginTop: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {[CaretLeft, CaretRight].map((Icon, i) =>
            i === 0 ? (
              <div key="l" style={{ width: 48, height: 48, borderRadius: 12, border: `1px solid ${UI.line}`, display: "grid", placeItems: "center", color: UI.text }}>
                <Icon size={20} weight="bold" />
              </div>
            ) : null,
          )}
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: UI.text }}>21 to 27 Sept</div>
            <div style={{ fontSize: 14, color: UI.muted }}>This week</div>
          </div>
          <div style={{ width: 48, height: 48, borderRadius: 12, border: `1px solid ${UI.line}`, display: "grid", placeItems: "center", color: UI.text }}>
            <CaretRight size={20} weight="bold" />
          </div>
        </div>
        <div style={{ ...card, marginTop: 14, padding: 16, display: "flex", alignItems: "center", gap: 14 }}>
          <IconTile tone="info">
            <Timer size={26} weight="regular" />
          </IconTile>
          <div>
            <div style={{ fontSize: 14, color: UI.muted }}>Your hours this week</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: UI.text, fontVariantNumeric: "tabular-nums" }}>{open ? "0 h" : `${DAY.hours} h`}</div>
          </div>
        </div>
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          <Button primary>
            <Plus size={18} weight="bold" /> Add hours
          </Button>
          <Button pressed={invoicePress}>
            <Receipt size={18} weight="bold" /> Invoice this week
          </Button>
        </div>
        <div style={{ marginTop: 14 }}>
          <DayCard logged={!open} flash={flash} />
        </div>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 58, zIndex: 30, background: `linear-gradient(180deg, ${UI.bg} 70%, rgba(17,17,16,0))` }} />
      <BottomNav />
    </>
  );
}

function Sheet({ enter, top, children }: { enter: number; top: number; children: ReactNode }) {
  const slide = (1 - enter) * (844 - top);
  return (
    <>
      <div style={{ position: "absolute", inset: 0, zIndex: 60, background: `rgba(0,0,0,${0.6 * enter})` }} />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: top + slide,
          bottom: -slide,
          zIndex: 61,
          borderRadius: "24px 24px 0 0",
          border: `1px solid ${UI.line}`,
          borderBottom: "none",
          background: UI.surface,
          padding: "10px 16px 0",
          fontFamily: FONT.display,
          overflow: "hidden",
        }}
      >
        <div style={{ width: 40, height: 5, borderRadius: 3, background: UI.line, margin: "0 auto 12px" }} />
        {children}
      </div>
    </>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 15, fontWeight: 600, color: UI.text, marginBottom: 8 }}>{children}</div>;
}

function Field({ prefix, value, suffix }: { prefix?: string; value: string; suffix?: string }) {
  return (
    <div
      style={{
        minHeight: 50,
        borderRadius: 12,
        border: `1px solid ${UI.line}`,
        background: UI.bg,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "0 14px",
        fontSize: 17,
        color: UI.text,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {prefix ? <span style={{ color: UI.muted }}>{prefix}</span> : null}
      <span style={{ flex: 1 }}>{value}</span>
      {suffix ? <span style={{ color: UI.muted, fontSize: 15 }}>{suffix}</span> : null}
    </div>
  );
}

/** "Finish work": when, the break (30m picked by `breakOn`), the client's job. */
export function FinishSheet({ enter, breakOn, press, finishing }: { enter: number; breakOn: boolean; press: number; finishing: boolean }) {
  return (
    <Sheet enter={enter} top={346}>
      <div style={{ fontSize: 21, fontWeight: 800, color: UI.text }}>Finish work</div>
      <div style={{ marginTop: 4, fontSize: 15, color: UI.muted }}>Your hours go on the timesheet. You can change them after.</div>
      <div style={{ marginTop: 16 }}>
        <Label>Finished on Thu 24 Sept at</Label>
        <Field value="3:17 pm" />
      </div>
      <div style={{ marginTop: 14 }}>
        <Label>Break</Label>
        <div style={{ display: "flex", gap: 8 }}>
          {[0, 15, 30, 45, 60].map((m) => {
            const on = breakOn ? m === 30 : m === 0;
            return (
              <div
                key={m}
                style={{
                  flex: 1,
                  minHeight: 44,
                  borderRadius: 999,
                  display: "grid",
                  placeItems: "center",
                  fontSize: 15,
                  fontWeight: 600,
                  color: UI.text,
                  border: on ? `2px solid ${UI.brand}` : `1px solid ${UI.line}`,
                  background: on ? UI.brandSoft : UI.bg,
                }}
              >
                {m === 0 ? "None" : `${m}m`}
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ marginTop: 14 }}>
        <div
          style={{
            minHeight: 50,
            borderRadius: 12,
            border: `1px solid ${UI.line}`,
            background: UI.bg,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 14px",
            fontSize: 16,
            color: UI.text,
          }}
        >
          The Sam Taylor job <CaretDown size={18} weight="bold" color={UI.muted} />
        </div>
      </div>
      <div style={{ marginTop: 16 }}>
        <Button primary pressed={press}>
          {finishing ? "Finishing…" : (
            <>
              <Stop size={18} weight="fill" /> Finish work
            </>
          )}
        </Button>
      </div>
    </Sheet>
  );
}

/** "Invoice this week": the client, your labour rate, the line it makes. */
export function InvoiceWeekSheet({ enter, scroll, press }: { enter: number; scroll: number; press: number }) {
  const row = (title: string, detail: string, amount: string) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 14px", borderTop: `1px solid ${UI.line}` }}>
      <div>
        <div style={{ fontSize: 15.5, fontWeight: 700, color: UI.text }}>{title}</div>
        <div style={{ fontSize: 13.5, color: UI.muted }}>{detail}</div>
      </div>
      <div style={{ fontSize: 15.5, fontWeight: 700, color: UI.text, fontVariantNumeric: "tabular-nums" }}>{amount}</div>
    </div>
  );
  return (
    <Sheet enter={enter} top={118}>
      <div style={{ transform: `translateY(${-scroll}px)` }}>
        <div style={{ fontSize: 21, fontWeight: 800, color: UI.text }}>Invoice this week</div>
        <div style={{ marginTop: 2, fontSize: 15, color: UI.muted }}>Hours for 21 to 27 Sept</div>
        <div style={{ marginTop: 16 }}>
          <Label>Client</Label>
          <div
            style={{
              minHeight: 56,
              borderRadius: 12,
              border: `2px solid ${UI.brand}`,
              background: UI.brandSoft,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 16px",
              fontSize: 16,
              color: UI.text,
            }}
          >
            <span style={{ fontWeight: 700 }}>Sam Taylor</span>
            <span style={{ color: UI.muted }}>{DAY.hours} h</span>
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <Label>Hourly rate</Label>
          <Field prefix="$" value={DAY.rate.toFixed(2)} suffix="per hour" />
          <div style={{ marginTop: 6, fontSize: 13.5, color: UI.muted }}>From your labour rate. Change it for this invoice if you need to.</div>
        </div>
        <div style={{ ...card, marginTop: 14, overflow: "hidden" }}>
          <div style={{ marginTop: -1 }}>
            {row("Labour, Thu 24 Sept", `${DAY.hours} h at ${money(DAY.rate)}`, money(LABOUR))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 14px", borderTop: `1px solid ${UI.line}`, fontSize: 13.5, color: UI.muted }}>
            <span>GST 15%</span>
            <span>{money(GST)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "11px 14px", borderTop: `1px solid ${UI.line}`, fontSize: 18, fontWeight: 800, color: UI.text }}>
            <span>Total</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{money(INVOICE_TOTAL)}</span>
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <Button primary pressed={press}>
            <Receipt size={18} weight="bold" /> Create invoice
          </Button>
          <div style={{ marginTop: 8, textAlign: "center", fontSize: 13.5, color: UI.muted }}>It opens as a finished job, ready to send.</div>
        </div>
      </div>
    </Sheet>
  );
}
