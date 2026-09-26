/**
 * Supplier quote scan (`/app/materials/import-quote`: QuoteImportClient.tsx):
 * step 1 (photograph the quote, "Scan quote", "Reading quote…") and step 2
 * "check the lines", plus the paper quote being scanned. The supplier is
 * generic on purpose: no real merchant names.
 */
import { Camera, CaretLeft, Check, CircleNotch, Receipt, UploadSimple } from "@phosphor-icons/react/dist/ssr";
import { EXAMPLE, formatMoney } from "../demo-script";
import { C, FONT, TONE, rgba } from "../marketing/theme";
import { Accent, AppCanvas, Avatar, BottomNav, Card, GhostButton, H1, Input, MonoLabel, Page, PrimaryButton, SectionLabel, TopScrim } from "./ui";
import { TabBar as NewTabBar, TopBar as NewTopBar } from "./newlook/ui";

/**
 * "old": the page as it looked in the old app. "new": the same page inside
 * the new look, which only gave it a new top bar ("‹ Prices · Prices from a
 * quote") and the new tab bar; the page itself is unchanged.
 */
export type Shell = "old" | "new";

function Chrome({ shell }: { shell: Shell }) {
  return shell === "new" ? (
    <>
      <NewTopBar back="Prices" title="Prices from a quote" />
      <NewTabBar active="prices" />
    </>
  ) : (
    <>
      <TopScrim />
      <Avatar />
      <BottomNav active="materials" />
    </>
  );
}

function ScanLine({
  description,
  quantity,
  unit,
  unitPrice,
  enter = 1,
}: {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  enter?: number;
}) {
  const t = TONE.materials;
  const e = Math.max(0, Math.min(1, enter));
  return (
    <div
      style={{
        borderRadius: 12,
        border: `1px solid ${rgba(t.rgb, 0.22)}`,
        background: "#0f1817",
        padding: 10,
        opacity: e,
        transform: `translateY(${(1 - e) * 10}px)`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 18, height: 18, borderRadius: 4, background: C.brand, display: "grid", placeItems: "center", color: "#111", flexShrink: 0 }}>
          <Check size={12} weight="bold" />
        </div>
        <Input tone="materials" value={description} style={{ flex: 1, minHeight: 34, fontSize: 13.5 }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "0.8fr 0.8fr 1.2fr", gap: 6, marginTop: 6, paddingLeft: 26 }}>
        <Input tone="materials" value={String(quantity)} style={{ minHeight: 32, fontSize: 13 }} />
        <Input tone="materials" value={unit} style={{ minHeight: 32, fontSize: 13 }} />
        <Input tone="materials" value={`$ ${unitPrice.toFixed(2)}`} style={{ minHeight: 32, fontSize: 13 }} />
      </div>
    </div>
  );
}

/**
 * Step 2, "check the lines". `shown` reveals the read lines one by one (the
 * still shows them all); `press` pushes "Create quote".
 */
export function SupplierScanScreen({ shown = 99, press = 0, shell = "old" }: { shown?: number; press?: number; shell?: Shell } = {}) {
  return (
    <>
      <AppCanvas tone="materials" />
      <Page top={shell === "new" ? 128 : 112}>
        {shell === "old" ? (
          <div style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: FONT.mono, fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: C.ink300 }}>
            <CaretLeft size={11} weight="bold" /> Back to materials
          </div>
        ) : null}
        <SectionLabel tone="materials" style={{ marginTop: shell === "old" ? 14 : 0 }}>
          {"// supplier quote"}
        </SectionLabel>
        <H1 style={{ marginTop: 10 }}>
          Scan a supplier <Accent>quote.</Accent>
        </H1>
        <div style={{ marginTop: 8, fontSize: 13.5, lineHeight: 1.55, color: C.ink300 }}>
          The scan reads the prices — you confirm every line before anything is saved.
        </div>
        <Card tone="materials" style={{ marginTop: 16, padding: 16 }}>
          <MonoLabel size={10} color={C.brand} style={{ letterSpacing: "0.25em" }}>
            {"// step 2 — check the lines"}
          </MonoLabel>
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {EXAMPLE.supplierLines.map((line, i) => (
              <ScanLine key={line.description} {...line} enter={shown - i} />
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, fontSize: 13, color: C.ink200 }}>
            <span>3 lines · excl. GST</span>
            <span style={{ fontWeight: 700, color: "#fff", fontVariantNumeric: "tabular-nums" }}>{formatMoney(EXAMPLE.materialsSubtotal)}</span>
          </div>
        </Card>
      </Page>
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
          display: "grid",
          gridTemplateColumns: "1.2fr 1fr",
          gap: 8,
          padding: 8,
          zIndex: 44,
        }}
      >
        <PrimaryButton style={{ fontSize: 14 }} pressed={press}>
          <Receipt size={17} weight="bold" /> Create quote (3)
        </PrimaryButton>
        <GhostButton tone="materials" style={{ fontSize: 13.5 }}>
          <Check size={16} weight="bold" /> Add 3 to library
        </GhostButton>
      </div>
      <Chrome shell={shell} />
    </>
  );
}

/**
 * Step 1, "photos or pdf": the camera on the paper quote, then the photo taken
 * and "Scan quote" reading it. `photo` 0–1 is the shutter (the preview becomes
 * the photo); `reading` shows "Reading quote…" with a line sweeping the photo.
 */
export function SupplierCaptureScreen({
  t,
  photo = 0,
  reading = false,
  press = 0,
  shell = "old",
}: {
  t: number;
  photo?: number;
  reading?: boolean;
  press?: number;
  shell?: Shell;
}) {
  const taken = photo >= 1;
  const sway = taken ? 0 : Math.sin(t * 2.2) * 3;
  const sweep = reading ? (t * 0.9) % 1 : 0.5;
  return (
    <>
      <AppCanvas tone="materials" />
      <Page top={shell === "new" ? 128 : 112}>
        {shell === "old" ? (
          <div style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: FONT.mono, fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: C.ink300 }}>
            <CaretLeft size={11} weight="bold" /> Back to materials
          </div>
        ) : null}
        <SectionLabel tone="materials" style={{ marginTop: shell === "old" ? 14 : 0 }}>
          {"// supplier quote"}
        </SectionLabel>
        <H1 style={{ marginTop: 10 }}>
          Scan a supplier <Accent>quote.</Accent>
        </H1>
        <Card tone="materials" style={{ marginTop: 16, padding: 16 }}>
          <MonoLabel size={10} color={C.brand} style={{ letterSpacing: "0.25em" }}>
            {"// step 1 — photos or pdf"}
          </MonoLabel>
          <div
            style={{
              position: "relative",
              marginTop: 12,
              height: 236,
              borderRadius: 12,
              overflow: "hidden",
              background: taken ? "#0f1817" : "#2b2b28",
              border: `1px solid ${rgba(TONE.materials.rgb, 0.22)}`,
            }}
          >
            <div style={{ position: "absolute", left: 50, top: 14, transform: `translate(${sway}px, ${sway * 0.5}px) rotate(${taken ? -1.5 : -4}deg)` }}>
              <PaperQuote width={236} scan={sweep} />
            </div>
            {!taken ? (
              <div style={{ position: "absolute", inset: 10, borderRadius: 10, border: "2px solid rgba(255,255,255,0.45)" }} />
            ) : null}
            {photo > 0 && photo < 1 ? <div style={{ position: "absolute", inset: 0, background: "#fff", opacity: Math.sin(photo * Math.PI) }} /> : null}
          </div>
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            <GhostButton tone="materials" style={{ fontSize: 13.5 }}>
              <Camera size={16} weight="bold" /> {taken ? "Add a photo" : "Take photo"}
            </GhostButton>
            <GhostButton tone="materials" style={{ fontSize: 13.5 }}>
              <UploadSimple size={16} weight="bold" /> {taken ? "Add photos or a PDF" : "Choose photos or a PDF"}
            </GhostButton>
          </div>
          <PrimaryButton style={{ marginTop: 10, opacity: taken ? 1 : 0.45 }} pressed={press}>
            {reading ? (
              <>
                <span style={{ display: "grid", transform: `rotate(${t * 360}deg)` }}>
                  <CircleNotch size={17} weight="bold" />
                </span>
                Reading quote…
              </>
            ) : (
              "Scan quote"
            )}
          </PrimaryButton>
        </Card>
      </Page>
      <Chrome shell={shell} />
    </>
  );
}

/** The paper supplier quote being photographed (generic merchant). */
export function PaperQuote({ width = 420, scan = 0.5 }: { width?: number; scan?: number }) {
  const s = width / 420;
  const row = (a: string, b: string, c: string, d: string, bold = false) => (
    <div style={{ display: "grid", gridTemplateColumns: "2.2fr 0.7fr 0.9fr 1fr", gap: 6 * s, padding: `${6 * s}px 0`, borderBottom: `${1 * s}px solid #e2e2e2`, fontWeight: bold ? 700 : 400 }}>
      <span>{a}</span>
      <span style={{ textAlign: "right" }}>{b}</span>
      <span style={{ textAlign: "right" }}>{c}</span>
      <span style={{ textAlign: "right" }}>{d}</span>
    </div>
  );
  return (
    <div
      style={{
        position: "relative",
        width,
        padding: 26 * s,
        background: "linear-gradient(180deg, #fbfaf6, #f1efe8)",
        color: "#1b1b1b",
        fontFamily: FONT.body,
        fontSize: 12.5 * s,
        borderRadius: 4 * s,
        boxShadow: "0 30px 60px rgba(0,0,0,0.5)",
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 20 * s, letterSpacing: "-0.03em" }}>YOUR SUPPLIER</div>
          <div style={{ fontSize: 11 * s, color: "#666" }}>Trade counter quote</div>
        </div>
        <div style={{ fontFamily: FONT.mono, fontSize: 11 * s, textAlign: "right", color: "#444" }}>
          QUOTE
          <br />
          No. 20417
        </div>
      </div>
      <div style={{ marginTop: 18 * s, fontFamily: FONT.mono, fontSize: 10 * s, color: "#777", letterSpacing: "0.08em" }}>
        {row("ITEM", "QTY", "UNIT", "AMOUNT", true)}
      </div>
      {EXAMPLE.supplierLines.map((l) => (
        <div key={l.description}>{row(l.description, `${l.quantity} ${l.unit}`, formatMoney(l.unitPrice), formatMoney(l.total))}</div>
      ))}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 * s, fontWeight: 700 }}>
        <span>Total excl. GST</span>
        <span>{formatMoney(EXAMPLE.materialsSubtotal)}</span>
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: `${scan * 100}%`,
          height: 3 * s,
          background: C.brand,
          boxShadow: `0 0 ${18 * s}px ${6 * s}px rgba(255,95,21,0.45)`,
        }}
      />
    </div>
  );
}
