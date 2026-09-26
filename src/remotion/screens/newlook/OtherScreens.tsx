/**
 * New-look Prices (app/app/materials/_newlook/PricesScreen.tsx) and Client
 * requests (app/app/requests/_newlook/RequestsView.tsx), in the app's words.
 */
import type { ReactNode } from "react";
import { Barcode, Camera, FileText, Lightning, MagnifyingGlass, Plus, UploadSimple } from "@phosphor-icons/react/dist/ssr";
import { EXAMPLE } from "../../demo-script";
import { Button, Card, Muted, NL, NL_FONT, Page, Pill, TabBar, TopBar, money } from "./ui";

function Avatar() {
  return (
    <div
      style={{
        width: 44,
        height: 44,
        borderRadius: 999,
        background: NL.brand,
        color: NL.onBrand,
        display: "grid",
        placeItems: "center",
        fontWeight: 700,
        fontSize: 16,
        boxShadow: `0 0 0 3px ${NL.bg}, 0 0 0 5px ${NL.brand}`,
        flexShrink: 0,
      }}
    >
      {EXAMPLE.initials}
    </div>
  );
}

/** A tab's own top bar: your photo, the title, a line under it. */
function TabTop({ title, description }: { title: string; description: string }) {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Avatar />
        <div style={{ fontFamily: NL_FONT.display, fontSize: 30, color: NL.text }}>{title}</div>
      </div>
      <Muted style={{ marginTop: 8 }}>{description}</Muted>
    </>
  );
}

const LIST = EXAMPLE.supplierLines;

/** "Your prices", with the ways to add them; `press` pushes "Scan a supplier quote". */
export function PricesScreen({ press = 0 }: { press?: number }) {
  return (
    <>
      <Page top={64}>
        <TabTop title="Your prices" description="Materials on a new quote fill in from here. Add a price once and it’s remembered." />
        <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 8 }}>
          <Button icon={<Plus size={20} weight="bold" />}>Add a price</Button>
          <Button variant="secondary" icon={<Barcode size={18} weight="bold" />}>
            Scan barcode
          </Button>
          <Button variant="secondary" icon={<Camera size={18} weight="bold" />} pressed={press} style={{ background: press ? NL.brandSoft : NL.surface2 }}>
            Scan a supplier quote
          </Button>
          <Button variant="secondary" icon={<UploadSimple size={18} weight="bold" />}>
            Import a price list
          </Button>
          <Button variant="secondary" icon={<Lightning size={18} weight="bold" />}>
            Quick start
          </Button>
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, margin: "24px 0 10px" }}>Your list</div>
        <div style={{ minHeight: 50, borderRadius: 12, border: `1px solid ${NL.line}`, background: NL.bg, display: "flex", alignItems: "center", gap: 8, padding: "0 14px", color: NL.faint, fontSize: 16 }}>
          <MagnifyingGlass size={18} weight="bold" /> Search your prices
        </div>
        <Card style={{ marginTop: 12, padding: 0, overflow: "hidden" }}>
          {LIST.map((l, i) => (
            <div key={l.description} style={{ display: "flex", justifyContent: "space-between", padding: "13px 14px", borderBottom: i < LIST.length - 1 ? `1px solid ${NL.line}` : "none" }}>
              <span style={{ fontSize: 16, fontWeight: 600 }}>{l.description}</span>
              <span style={{ fontSize: 15, color: NL.muted, fontVariantNumeric: "tabular-nums" }}>
                {money(l.unitPrice)} / {l.unit}
              </span>
            </div>
          ))}
        </Card>
      </Page>
      <TabBar active="prices" />
    </>
  );
}

/** "Client requests": the new request as a card, its draft ready to review. */
export function ClientRequestsScreen({ arrive = 1, press = 0, children }: { arrive?: number; press?: number; children?: ReactNode }) {
  return (
    <>
      <Page top={130}>
        <Muted>Jobs clients send through your request link. Each one is a draft quote: open it, check the numbers, then send it.</Muted>
        <div style={{ marginTop: 16, opacity: arrive, transform: `translateY(${(1 - arrive) * 18}px)` }}>
          <Card style={{ padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
              <div>
                <div style={{ fontSize: 19, fontWeight: 600 }}>{EXAMPLE.client}</div>
                <div style={{ marginTop: 2, fontSize: 15, color: NL.muted }}>{EXAMPLE.clientEmail}</div>
              </div>
              <Pill tone="info">New</Pill>
            </div>
            <div style={{ marginTop: 14 }}>
              <Pill tone="ok">Draft ready to review</Pill>
            </div>
            <div style={{ marginTop: 14, fontSize: 17, lineHeight: 1.5 }}>{EXAMPLE.request}</div>
            <div style={{ marginTop: 12, fontSize: 14, color: NL.muted }}>Received today, 9:41am</div>
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
              <Button variant="secondary" icon={<FileText size={18} weight="bold" />} pressed={press} style={{ background: press ? NL.brandSoft : NL.surface2 }}>
                Open draft quote
              </Button>
              <Button variant="secondary">Dismiss</Button>
            </div>
          </Card>
        </div>
      </Page>
      <TopBar title="Client requests" />
      {children}
    </>
  );
}
