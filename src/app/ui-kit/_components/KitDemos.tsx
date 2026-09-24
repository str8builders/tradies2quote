"use client";

import { useRef, useState } from "react";
import {
  ArrowRight,
  CaretLeft,
  DotsThree,
  FileText,
  MagnifyingGlass,
  Plus,
  Receipt,
  Tray,
  X,
} from "@phosphor-icons/react/dist/ssr";
import { BottomActionBar } from "@/components/ui/bottom-action-bar";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button, ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { IconButton } from "@/components/ui/icon-button";
import { ListRow } from "@/components/ui/list-row";
import { Money } from "@/components/ui/money";
import { NumberPad } from "@/components/ui/number-pad";
import { SectionTitle } from "@/components/ui/section-title";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/ui/status-pill";
import { StatusRail } from "@/components/ui/status-rail";
import { NumberField, TextField } from "@/components/ui/text-field";
import { useToast } from "@/components/ui/toast";
import { Toggle } from "@/components/ui/toggle";
import { TopBar } from "@/components/ui/top-bar";
import { JOB_STAGES, nextRailPosition, type RailPosition } from "@/components/ui/lib/job-stages";
import { padValueToNumber } from "@/components/ui/lib/number-input";
import { Demo, KitSection } from "./KitSection";

const POSITIONS: RailPosition[] = [...JOB_STAGES, "complete"];

function ButtonsDemo() {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const save = () => {
    setSaving(true);
    window.setTimeout(() => {
      setSaving(false);
      toast.show("Saved");
    }, 1400);
  };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Demo label="Primary: the one big orange button (56 px)">
        <div className="space-y-3">
          <Button fullWidth icon={<Plus weight="bold" />} onClick={() => toast.show("Just a preview.", { tone: "info" })}>
            New quote
          </Button>
          <Button fullWidth loading={saving} loadingLabel="Saving…" onClick={save}>
            Save (tap to see loading)
          </Button>
          <Button fullWidth disabled>
            Send quote (not ready)
          </Button>
        </div>
      </Demo>
      <Demo label="Secondary, ghost and danger (48 px), and small (40 px, 48 px to tap)">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary">Send invoice</Button>
          <Button variant="ghost" iconEnd={<ArrowRight weight="bold" />}>
            See all jobs
          </Button>
          <Button variant="danger">Delete quote</Button>
          <Button variant="secondary" size="sm">
            Edit
          </Button>
          <ButtonLink href="#buttons" variant="secondary" size="sm">
            A link that looks like a button
          </ButtonLink>
        </div>
      </Demo>
      <Demo label="Icon buttons: 48 × 48 px, always with a spoken name">
        <div className="flex flex-wrap items-center gap-3">
          <IconButton label="Back" icon={<CaretLeft weight="bold" />} />
          <IconButton label="Search" icon={<MagnifyingGlass weight="bold" />} variant="secondary" />
          <IconButton label="More options" icon={<DotsThree weight="bold" />} variant="secondary" />
          <IconButton label="Add a line" icon={<Plus weight="bold" />} variant="primary" />
          <IconButton label="Close" icon={<X weight="bold" />} disabled />
        </div>
      </Demo>
    </div>
  );
}

function CardsDemo() {
  const toast = useToast();
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3">
        <SectionTitle description="Tap a row to open it" action={<Button variant="ghost" size="sm">See all</Button>}>
          Recent jobs
        </SectionTitle>
        <Card padding="none">
          <ul className="divide-y divide-ui-line">
            <li>
              <ListRow
                icon={<FileText weight="bold" />}
                iconTone="brand"
                title="Bathroom reline"
                subtitle="Aroha Ngata · quote ready"
                trailing={<Money amount={3960} />}
                onClick={() => toast.show("Just a preview.", { tone: "info" })}
              />
            </li>
            <li>
              <ListRow
                icon={<Receipt weight="bold" />}
                iconTone="warn"
                title="Fence repair"
                subtitle="Ben Walker · invoice 9 days late"
                trailing={<StatusPill tone="bad">Late</StatusPill>}
                href="#cards"
              />
            </li>
            <li>
              <ListRow title="Labour" subtitle="3 days, plain row (not tappable)" trailing={<Money amount={1680} />} />
            </li>
          </ul>
        </Card>
      </div>
      <Card padding="lg">
        <SectionTitle size="page" as="h3" description="Page headings use Archivo Black, in sentence case.">
          Morning, Mike
        </SectionTitle>
        <p className="mt-4">
          One card style everywhere: surface colour, a hairline edge, 16 px corners, a soft shadow. Body text is 17 px.
        </p>
      </Card>
    </div>
  );
}

function StatusDemo() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Demo label="Status pills: plain words, never colour alone">
        <div className="flex flex-wrap gap-2">
          <StatusPill tone="ok">Paid</StatusPill>
          <StatusPill tone="warn">Needs price</StatusPill>
          <StatusPill tone="bad">9 days late</StatusPill>
          <StatusPill tone="info">Sent</StatusPill>
          <StatusPill>Draft</StatusPill>
        </div>
      </Demo>
      <div className="space-y-3">
        <Callout tone="warn" title="2 items need your price" action={<Button variant="secondary">Price them</Button>}>
          The total goes up once they&apos;re in.
        </Callout>
        <Callout tone="ok" title="Quote sent to Sam Taylor" />
        <Callout tone="info" title="Prices are ex GST">
          GST is added once, at the bottom of the quote.
        </Callout>
        <Callout tone="bad" title="Couldn't send the invoice">
          The phone lost signal. We&apos;ll try again when it&apos;s back.
        </Callout>
      </div>
    </div>
  );
}

function RailDemo() {
  const [position, setPosition] = useState<RailPosition>("Accepted");
  const index = POSITIONS.indexOf(position);
  return (
    <Demo label="Job progress: done, next up, not yet">
      <StatusRail position={position} />
      <p className="mt-4 text-ui-sm text-ui-muted">
        {position === "complete" ? "Paid: every step is done." : `Waiting on: ${position}.`}
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        <Button variant="secondary" size="sm" disabled={index <= 0} onClick={() => setPosition(POSITIONS[index - 1])}>
          Back a step
        </Button>
        <Button variant="secondary" size="sm" disabled={position === "complete"} onClick={() => setPosition(nextRailPosition(position))}>
          Next step
        </Button>
      </div>
    </Demo>
  );
}

function MoneyDemo() {
  return (
    <Demo label="Money: the app's own format, figures line up">
      <ul className="space-y-1 text-ui-lg">
        <li className="flex justify-between gap-4">
          <span className="text-ui-muted">NZD</span>
          <Money amount={4819.88} />
        </li>
        <li className="flex justify-between gap-4">
          <span className="text-ui-muted">AUD</span>
          <Money amount={1240} currency="AUD" />
        </li>
        <li className="flex justify-between gap-4">
          <span className="text-ui-muted">GBP</span>
          <Money amount={107.8} currency="GBP" />
        </li>
        <li className="flex justify-between gap-4">
          <span className="text-ui-muted">Credit</span>
          <Money amount={-20} />
        </li>
      </ul>
    </Demo>
  );
}

function BarsDemo() {
  return (
    <Demo label="Top bar and bottom action bar">
      <div className="overflow-hidden rounded-ui-lg border border-ui-line">
        <TopBar title="Deck at 14 Rata St" subtitle="Sam Taylor" back={{ href: "#bars" }} safeArea={false} />
        <div className="space-y-2 bg-ui-bg p-4 text-ui-muted">
          <p>The page scrolls between the two bars.</p>
          <p>The bottom bar holds the next step, where the thumb is.</p>
        </div>
        <BottomActionBar safeArea={false} hint="Next: book the job with Sam">
          <Button fullWidth>Book the job</Button>
        </BottomActionBar>
      </div>
    </Demo>
  );
}

function SheetDemo() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("Sam Taylor");
  const [qty, setQty] = useState("28");
  const nameRef = useRef<HTMLInputElement>(null);
  const close = () => setOpen(false);
  return (
    <Demo label="Bottom sheet: slides up, Escape or Close shuts it, focus comes back here">
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Open a sheet
      </Button>
      <BottomSheet
        open={open}
        onClose={close}
        title="Change the client"
        description="Made-up details. Nothing is saved."
        initialFocusRef={nameRef}
        footer={
          <div className="flex flex-col gap-2">
            <Button
              fullWidth
              onClick={() => {
                close();
                toast.show(`Client set to ${name || "no name"}`);
              }}
            >
              Save
            </Button>
            <Button variant="ghost" fullWidth onClick={close}>
              Cancel
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <TextField ref={nameRef} label="Client name" value={name} onChange={(e) => setName(e.target.value)} />
          <NumberField label="Joist hangers" suffix="each" value={qty} onValueChange={setQty} decimals={0} />
        </div>
      </BottomSheet>
    </Demo>
  );
}

function PadDemo() {
  const [value, setValue] = useState("");
  const amount = padValueToNumber(value);
  return (
    <Demo label="Number pad: 64 px keys, one point, two decimals">
      <p aria-live="polite" className="mb-3 rounded-ui-md border-2 border-ui-line-strong bg-ui-bg px-4 py-2 text-ui-2xl font-bold tabular-nums">
        {value ? `$${value}` : <span className="text-ui-faint">$0.00</span>}
      </p>
      <NumberPad value={value} onChange={setValue} label="Demo number pad" />
      <p className="mt-3 text-ui-sm text-ui-muted">
        As a number: {amount === null ? "nothing yet" : <Money amount={amount} />}
      </p>
    </Demo>
  );
}

function FieldsDemo() {
  const [client, setClient] = useState("");
  const [price, setPrice] = useState("3.85");
  const [area, setArea] = useState("25.9");
  return (
    <Demo label="Fields: big, labelled, errors in words">
      <div className="space-y-5">
        <TextField
          label="Client name"
          placeholder="For example, Sam Taylor"
          hint="As it should appear on the quote."
          value={client}
          onChange={(e) => setClient(e.target.value)}
          error={client.trim() === "" ? "Add the client's name to send the quote." : undefined}
        />
        <NumberField label="Price each (ex GST)" prefix="$" value={price} onValueChange={setPrice} />
        <NumberField label="Deck area" suffix="m²" value={area} onValueChange={setArea} decimals={1} />
        <TextField label="Quote number" value="Q-2026-4F2A" readOnly disabled />
      </div>
    </Demo>
  );
}

function ChoicesDemo() {
  const [remember, setRemember] = useState(true);
  const [texts, setTexts] = useState(false);
  const [show, setShow] = useState<"all" | "unpaid" | "paid">("unpaid");
  return (
    <Demo label="Switches and choices">
      <div className="space-y-4">
        <Toggle checked={remember} onChange={setRemember} label="Remember for next time" />
        <Toggle
          checked={texts}
          onChange={setTexts}
          label="Text me when a client says yes"
          description="One text per accepted quote."
        />
        <Toggle checked={false} onChange={() => {}} label="Card payments (coming later)" disabled />
        <SegmentedControl
          label="Show"
          options={[
            { value: "all", label: "All" },
            { value: "unpaid", label: "Unpaid" },
            { value: "paid", label: "Paid" },
          ]}
          value={show}
          onChange={setShow}
        />
      </div>
    </Demo>
  );
}

function FeedbackDemo() {
  const toast = useToast();
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Demo label="Empty state: always a way forward">
        <EmptyState
          icon={<Tray weight="bold" />}
          title="No jobs yet"
          action={<Button onClick={() => toast.show("Just a preview.", { tone: "info" })}>New quote</Button>}
        >
          Your first quote takes about a minute. Just say the job.
        </EmptyState>
      </Demo>
      <Demo label="Loading placeholders">
        <div aria-busy="true" aria-label="Loading jobs" className="space-y-4">
          {[0, 1, 2].map((row) => (
            <div key={row} className="flex items-center gap-3">
              <Skeleton shape="circle" className="h-10 w-10" />
              <div className="flex-1 space-y-2">
                <Skeleton shape="line" className="w-3/4" />
                <Skeleton shape="line" className="w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </Demo>
      <Demo label="Toasts: short confirmations, read out politely">
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" size="sm" onClick={() => toast.show("Booked for Tue 30 Sep")}>
            Done
          </Button>
          <Button variant="secondary" size="sm" onClick={() => toast.show("Quote sent to Sam Taylor", { tone: "info" })}>
            Info
          </Button>
          <Button variant="secondary" size="sm" onClick={() => toast.show("2 items still need a price", { tone: "warn" })}>
            Warning
          </Button>
          <Button variant="secondary" size="sm" onClick={() => toast.show("Couldn't send. Check your signal.", { tone: "bad" })}>
            Problem
          </Button>
        </div>
      </Demo>
    </div>
  );
}

/** Every part of the kit, section by section. Fictional data; nothing is saved. */
export function KitDemos() {
  return (
    <>
      <KitSection id="buttons" title="Buttons" description="Three sizes. The orange one is the next step, and there is one per screen.">
        <ButtonsDemo />
      </KitSection>
      <KitSection id="cards" title="Cards, rows and titles" description="One card style. Rows are at least 64 px tall when you can tap them.">
        <CardsDemo />
      </KitSection>
      <KitSection id="status" title="Status and messages" description="What needs attention, in plain words, with the fix right there.">
        <StatusDemo />
      </KitSection>
      <KitSection id="progress" title="Job progress and money" description="Every job shows how far along it is and what's next.">
        <div className="grid gap-4 lg:grid-cols-2">
          <RailDemo />
          <MoneyDemo />
        </div>
      </KitSection>
      <KitSection id="bars" title="Bars and sheets" description="The way back at the top, the next step at the bottom, extra detail in a sheet.">
        <div className="grid gap-4 lg:grid-cols-2">
          <BarsDemo />
          <SheetDemo />
        </div>
      </KitSection>
      <KitSection id="entry" title="Typing numbers and words" description="Big targets for gloves: keys 64 px, fields 56 px, 20 px text.">
        <div className="grid gap-4 lg:grid-cols-2">
          <PadDemo />
          <FieldsDemo />
        </div>
      </KitSection>
      <KitSection id="choices" title="Switches and choices" description="On/off is written next to every switch, not just shown in colour.">
        <ChoicesDemo />
      </KitSection>
      <KitSection id="feedback" title="Empty, loading and toasts">
        <FeedbackDemo />
      </KitSection>
    </>
  );
}
