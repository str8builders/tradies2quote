"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowCounterClockwise,
  Briefcase,
  Check,
  Clock,
  DotsThree,
  FileText,
  House,
  Microphone,
  Pause,
  Plus,
  Tag,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";
import { BottomActionBar } from "@/components/ui/bottom-action-bar";
import { BottomSheet, SheetPanel } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { cx } from "@/components/ui/cx";
import { ListRow } from "@/components/ui/list-row";
import { Money } from "@/components/ui/money";
import { NumberPad } from "@/components/ui/number-pad";
import { Screen } from "@/components/ui/screen";
import { SectionTitle } from "@/components/ui/section-title";
import { StatusPill } from "@/components/ui/status-pill";
import { StatusRail } from "@/components/ui/status-rail";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { Toggle } from "@/components/ui/toggle";
import { TopBar } from "@/components/ui/top-bar";
import { ICON_CHIP, PRESS, TAP, type IconTone } from "@/components/ui/styles";
import { nextRailPosition } from "@/components/ui/lib/job-stages";
import { currencySymbol, padValueToNumber } from "@/components/ui/lib/number-input";
import { useReducedMotion } from "@/components/ui/lib/use-reduced-motion";
import { round2 } from "@/lib/quote-defaults";
import { PhoneFrame } from "./PhoneFrame";
import {
  DECK_JOB,
  JOB_STEPS,
  TRANSCRIPT,
  totalWithGst,
  type ExampleLine,
} from "./example-data";

// ── Shared bits ──────────────────────────────────────────────────────────────

const TABS: Array<{ label: string; icon: Icon; main?: boolean }> = [
  { label: "Home", icon: House },
  { label: "Jobs", icon: Briefcase },
  { label: "New", icon: Plus, main: true },
  { label: "Prices", icon: Tag },
  { label: "More", icon: DotsThree },
];

/** Example only: the planned bottom bar (Home · Jobs · New · Prices · More). */
function ExampleTabBar({ current, onPick }: { current: string; onPick: () => void }) {
  return (
    <nav
      aria-label="Main"
      className="sticky bottom-0 z-20 grid grid-cols-5 border-t border-ui-line bg-ui-bg px-1 pt-1.5 pb-2"
    >
      {TABS.map(({ label, icon: TabIcon, main }) => {
        const isCurrent = label === current;
        return (
          <button
            key={label}
            type="button"
            aria-current={isCurrent ? "page" : undefined}
            onClick={onPick}
            className={cx(
              "ui-focus-ring flex min-h-14 flex-col items-center justify-end gap-0.5 rounded-ui-md pb-1 text-ui-xs font-semibold",
              TAP,
              isCurrent ? "text-ui-brand-text" : "text-ui-muted",
            )}
          >
            {main ? (
              <span className="-mt-5 inline-flex h-12 w-12 items-center justify-center rounded-ui-lg bg-ui-brand text-[1.5rem] text-ui-on-brand shadow-ui-raised">
                <TabIcon aria-hidden="true" weight="bold" />
              </span>
            ) : (
              <TabIcon aria-hidden="true" weight={isCurrent ? "fill" : "regular"} className="text-[1.5rem]" />
            )}
            {label}
          </button>
        );
      })}
    </nav>
  );
}

function TodoCard({
  icon,
  tone,
  title,
  detail,
  action,
}: {
  icon: ReactNode;
  tone: IconTone;
  title: ReactNode;
  detail: ReactNode;
  action: ReactNode;
}) {
  return (
    <Card as="li" className="flex gap-3">
      <span
        aria-hidden="true"
        className={cx(
          "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-ui-md text-[1.375rem]",
          ICON_CHIP[tone],
        )}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        <p className="text-ui-sm text-ui-muted">{detail}</p>
        <div className="mt-3">{action}</div>
      </div>
    </Card>
  );
}

// ── 1. Home: today's to-do list ─────────────────────────────────────────────

function HomeScreen() {
  const toast = useToast();
  const preview = () => toast.show("Just a preview. Nothing opens from here.", { tone: "info" });
  return (
    <Screen height="fill">
      <div className="flex-1 space-y-5 px-4 pt-6 pb-6">
        <SectionTitle size="page" description="3 things need you today">
          Morning, Mike
        </SectionTitle>
        <ul aria-label="To do today" className="space-y-3">
          <TodoCard
            icon={<FileText weight="bold" />}
            tone="brand"
            title="Bathroom quote is ready"
            detail={
              <>
                Aroha Ngata · <Money amount={3960} />
              </>
            }
            action={
              <Button size="md" onClick={preview}>
                Check and send
              </Button>
            }
          />
          <TodoCard
            icon={<Check weight="bold" />}
            tone="ok"
            title="Deck at 14 Rata St is done"
            detail={
              <>
                Sam Taylor · <Money amount={4830} />
              </>
            }
            action={
              <Button variant="secondary" onClick={preview}>
                Send invoice
              </Button>
            }
          />
          <TodoCard
            icon={<Clock weight="bold" />}
            tone="warn"
            title={
              <>
                <Money amount={1240} /> is 9 days late
              </>
            }
            detail="Ben Walker · fence repair"
            action={
              <Button variant="secondary" onClick={preview}>
                Send a reminder
              </Button>
            }
          />
        </ul>
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <p className="text-ui-sm text-ui-muted">Owed to you</p>
            <Money amount={6070} className="mt-1 block text-ui-xl font-semibold" />
            <p className="mt-1 text-ui-xs text-ui-faint">3 invoices</p>
          </Card>
          <Card>
            <p className="text-ui-sm text-ui-muted">Paid this month</p>
            <Money amount={12480} className="mt-1 block text-ui-xl font-semibold" />
            <p className="mt-1 text-ui-xs text-ui-faint">7 jobs</p>
          </Card>
        </div>
      </div>
      <ExampleTabBar current="Home" onPick={preview} />
    </Screen>
  );
}

// ── 2. New quote: recording ──────────────────────────────────────────────────

const BAR_COUNT = 24;
/** Deterministic resting shape, so server and phone render the same bars. */
const RESTING_LEVELS = Array.from({ length: BAR_COUNT }, (_, i) =>
  Number((0.3 + 0.5 * Math.abs(Math.sin(i * 0.9))).toFixed(3)),
);
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

function RecordScreen() {
  const toast = useToast();
  const reduced = useReducedMotion();
  const [listening, setListening] = useState(true);
  const [shown, setShown] = useState(1);
  const [seconds, setSeconds] = useState(42);
  const [levels, setLevels] = useState<number[]>(RESTING_LEVELS);
  const live = listening && !reduced;

  // Stand-in for the real microphone: the bars wander and words arrive.
  useEffect(() => {
    if (!live) return;
    const words = window.setInterval(
      () => setShown((n) => (n >= TRANSCRIPT.length + 8 ? 1 : n + 1)),
      420,
    );
    const clock = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    const meter = window.setInterval(
      () => setLevels((prev) => prev.map((level) => clamp(level + (Math.random() - 0.5) * 0.55, 0.12, 1))),
      140,
    );
    return () => {
      window.clearInterval(words);
      window.clearInterval(clock);
      window.clearInterval(meter);
    };
  }, [live]);

  const visibleWords = reduced ? TRANSCRIPT.length : Math.min(shown, TRANSCRIPT.length);
  const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const bars = listening ? levels : levels.map(() => 0.12);

  return (
    <Screen height="fill">
      <TopBar title="New quote" back={{ href: "#screens", label: "Cancel" }} safeArea={false} />
      <div className="flex flex-1 flex-col items-center gap-5 px-4 pt-6 pb-6">
        <p className="text-center text-ui-muted">Say the job like you&apos;d tell a mate.</p>
        <button
          type="button"
          onClick={() => setListening((on) => !on)}
          aria-label={listening ? "Pause recording" : "Carry on recording"}
          className={cx(
            "ui-focus-ring mt-2 inline-flex h-30 w-30 items-center justify-center rounded-full bg-ui-brand text-[3rem] text-ui-on-brand shadow-[0_0_0_12px_var(--ui-brand-soft),0_0_0_26px_var(--ui-surface)]",
            TAP,
            PRESS,
          )}
        >
          {listening ? <Microphone aria-hidden="true" weight="fill" /> : <Pause aria-hidden="true" weight="fill" />}
        </button>
        <div aria-hidden="true" className="mt-4 flex h-12 items-center gap-1">
          {bars.map((level, i) => (
            <span
              key={i}
              className="h-full w-1.5 origin-center rounded-full bg-ui-brand-text transition-transform duration-ui-fast ease-ui-out motion-reduce:transition-none"
              style={{ transform: `scaleY(${level})` }}
            />
          ))}
        </div>
        <p className="font-semibold tabular-nums">
          {listening ? "I'm listening" : "Paused"} · {time}
        </p>
        <Card className="w-full text-ui-lg">
          <p>
            {TRANSCRIPT.slice(0, visibleWords).map((word, i) => (
              <span key={i} className="animate-ui-fade-in motion-reduce:animate-none">
                {i > 0 ? " " : ""}
                {word.mark ? (
                  <mark className="rounded-ui-sm bg-ui-mark px-1 text-ui-on-mark">{word.text}</mark>
                ) : (
                  word.text
                )}
              </span>
            ))}
          </p>
        </Card>
      </div>
      <BottomActionBar safeArea={false}>
        <Button
          variant="ghost"
          fullWidth
          icon={<ArrowCounterClockwise weight="bold" />}
          onClick={() => {
            setShown(1);
            setSeconds(0);
            setListening(true);
            toast.show("Started again. Say the job from the top.", { tone: "info" });
          }}
        >
          Start again
        </Button>
        <Button fullWidth onClick={() => toast.show("Writing up your quote…", { tone: "info" })}>
          Done, write it up
        </Button>
      </BottomActionBar>
    </Screen>
  );
}

// ── Pricing (sheet on the job page, and the fourth example) ─────────────────

interface Pricing {
  item: ExampleLine | undefined;
  index: number;
  count: number;
  value: string;
  setValue: (value: string) => void;
  remember: boolean;
  setRemember: (value: boolean) => void;
  lineTotal: number | null;
  canSave: boolean;
  last: boolean;
  saveAndNext: () => void;
}

function usePricing(
  items: ExampleLine[],
  onDone: (prices: Record<string, number>, remember: boolean) => void,
  prefill: boolean,
): Pricing {
  const startValue = (i: number) => (prefill ? (items[i]?.typed ?? "") : "");
  const [index, setIndex] = useState(0);
  const [value, setValue] = useState(() => startValue(0));
  const [remember, setRemember] = useState(true);
  const [saved, setSaved] = useState<Record<string, number>>({});
  const item = items[index];
  const amount = padValueToNumber(value);
  const last = index >= items.length - 1;
  const saveAndNext = () => {
    if (!item || amount === null || amount <= 0) return;
    const next = { ...saved, [item.id]: amount };
    if (last) {
      onDone(next, remember);
      setIndex(0);
      setSaved({});
      setValue(startValue(0));
      return;
    }
    setSaved(next);
    setIndex(index + 1);
    setValue(startValue(index + 1));
  };
  return {
    item,
    index,
    count: items.length,
    value,
    setValue,
    remember,
    setRemember,
    lineTotal: item && amount !== null ? round2(amount * item.qty) : null,
    canSave: amount !== null && amount > 0,
    last,
    saveAndNext,
  };
}

function PriceKeypadBody({ pricing }: { pricing: Pricing }) {
  const { item } = pricing;
  if (!item) return null;
  return (
    <div className="space-y-4">
      <p className="font-semibold">
        {item.title} · {item.unit}
      </p>
      <div
        aria-live="polite"
        aria-atomic="true"
        className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-ui-md border-2 border-ui-brand bg-ui-bg px-4 py-2"
      >
        <span
          className={cx(
            "text-ui-display font-bold tabular-nums",
            pricing.value ? "text-ui-text" : "text-ui-faint",
          )}
        >
          {currencySymbol("NZD")}
          {pricing.value || "0.00"}
        </span>
        <span className="ml-auto text-ui-sm text-ui-muted">
          × {item.qty} = {pricing.lineTotal === null ? "…" : <Money amount={pricing.lineTotal} />}
        </span>
      </div>
      <NumberPad value={pricing.value} onChange={pricing.setValue} label={`Price for ${item.title}`} />
      <Toggle checked={pricing.remember} onChange={pricing.setRemember} label="Remember for next time" />
    </div>
  );
}

function PriceFooter({ pricing }: { pricing: Pricing }) {
  return (
    <Button fullWidth disabled={!pricing.canSave} onClick={pricing.saveAndNext}>
      {pricing.last ? "Save and finish" : "Save and next"}
    </Button>
  );
}

function PricingSheet({
  items,
  onClose,
  onDone,
}: {
  items: ExampleLine[];
  onClose: () => void;
  onDone: (prices: Record<string, number>, remember: boolean) => void;
}) {
  const pricing = usePricing(items, onDone, false);
  return (
    <BottomSheet
      open
      onClose={onClose}
      title="What do you pay for this?"
      description={`${pricing.index + 1} of ${pricing.count}`}
      footer={<PriceFooter pricing={pricing} />}
    >
      <PriceKeypadBody pricing={pricing} />
    </BottomSheet>
  );
}

// ── 3. Job page ──────────────────────────────────────────────────────────────

type JobPosition = keyof typeof JOB_STEPS | "complete";

function JobScreen() {
  const toast = useToast();
  const [position, setPosition] = useState<JobPosition>("Booked");
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [pricingIds, setPricingIds] = useState<string[] | null>(null);
  const [sessionKey, setSessionKey] = useState(0);

  const lines = DECK_JOB.lines.map((line) => ({ ...line, price: line.price ?? prices[line.id] ?? null }));
  const unpriced = lines.filter((line) => line.price === null);
  const total = totalWithGst(lines);
  const step = position === "complete" ? null : JOB_STEPS[position];

  const openPricing = (firstId?: string) => {
    const ids = unpriced.map((line) => line.id);
    setPricingIds(firstId ? [firstId, ...ids.filter((id) => id !== firstId)] : ids);
    setSessionKey((k) => k + 1);
  };
  const pricingItems = (pricingIds ?? [])
    .map((id) => DECK_JOB.lines.find((line) => line.id === id))
    .filter((line): line is ExampleLine => Boolean(line));

  return (
    <Screen height="fill">
      <TopBar title={DECK_JOB.title} subtitle={DECK_JOB.client} back={{ href: "#screens" }} safeArea={false} />
      <div className="flex-1 space-y-4 px-4 py-5">
        <StatusRail position={position} />
        <Card>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-ui-sm text-ui-muted">Total incl. GST</p>
              <Money amount={total} className="block text-ui-display font-bold" />
            </div>
            <StatusPill tone={position === "complete" ? "ok" : "neutral"}>
              {position === "complete" ? "Paid" : DECK_JOB.acceptedOn}
            </StatusPill>
          </div>
        </Card>
        {unpriced.length > 0 ? (
          <Callout
            tone="warn"
            title={`${unpriced.length} ${unpriced.length === 1 ? "item needs" : "items need"} your price`}
            action={
              <Button variant="secondary" onClick={() => openPricing()}>
                Price them
              </Button>
            }
          >
            The total goes up once they&apos;re in.
          </Callout>
        ) : null}
        <SectionTitle>What&apos;s in the job</SectionTitle>
        <Card padding="none">
          <ul className="divide-y divide-ui-line">
            {lines.map((line) => (
              <li key={line.id}>
                {line.price === null ? (
                  <ListRow
                    title={line.title}
                    subtitle={line.detail}
                    trailing={<StatusPill tone="warn">Add price</StatusPill>}
                    onClick={() => openPricing(line.id)}
                  />
                ) : (
                  <ListRow
                    title={line.title}
                    subtitle={line.detail}
                    trailing={<Money amount={round2(line.qty * line.price)} />}
                  />
                )}
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <BottomActionBar safeArea={false}>
        {step ? (
          <Button
            fullWidth
            onClick={() => {
              toast.show(step.toast);
              setPosition(nextRailPosition(position) as JobPosition);
            }}
          >
            {step.button}
          </Button>
        ) : (
          <>
            <Button fullWidth disabled>
              All paid
            </Button>
            <Button
              variant="ghost"
              fullWidth
              onClick={() => {
                setPosition("Booked");
                setPrices({});
              }}
            >
              Reset the demo
            </Button>
          </>
        )}
      </BottomActionBar>
      {pricingIds ? (
        <PricingSheet
          key={sessionKey}
          items={pricingItems}
          onClose={() => setPricingIds(null)}
          onDone={(saved, remember) => {
            setPrices((current) => ({ ...current, ...saved }));
            setPricingIds(null);
            toast.show(remember ? "Prices saved for next time" : "Prices added to this job");
          }}
        />
      ) : null}
    </Screen>
  );
}

// ── 4. Price keypad sheet (shown open) ──────────────────────────────────────

function PriceSheetPreview() {
  const toast = useToast();
  const items = DECK_JOB.lines.filter((line) => line.price === null);
  const pricing = usePricing(
    items,
    (_saved, remember) => toast.show(remember ? "Prices saved for next time" : "Prices added to this job"),
    true,
  );
  return (
    <div className="relative h-full">
      <Screen height="fill" aria-hidden="true" inert>
        <TopBar title={DECK_JOB.title} subtitle={DECK_JOB.client} safeArea={false} />
        <div className="space-y-4 px-4 py-5">
          <StatusRail position="Booked" animate={false} />
          <Card>
            <p className="text-ui-sm text-ui-muted">Total incl. GST</p>
            <Money amount={totalWithGst(DECK_JOB.lines)} className="block text-ui-display font-bold" />
          </Card>
        </div>
      </Screen>
      <div aria-hidden="true" className="absolute inset-0 z-30 bg-ui-scrim" />
      <div className="absolute inset-x-0 top-6 bottom-0 z-40 flex flex-col justify-end">
        <SheetPanel
          fit="container"
          title="What do you pay for this?"
          description={`${pricing.index + 1} of ${pricing.count}`}
          footer={<PriceFooter pricing={pricing} />}
        >
          <PriceKeypadBody pricing={pricing} />
        </SheetPanel>
      </div>
    </div>
  );
}

/** The four example screens, each in its own phone frame with its own toasts. */
export function ExampleScreens() {
  return (
    <div className="grid justify-items-center gap-x-8 gap-y-12 lg:grid-cols-2">
      <PhoneFrame
        screenshotId="screen-home"
        title="Home: today's to-do list"
        caption="Opens on what needs doing. Each card is one tap to the action."
      >
        <ToastProvider bottomOffset="5.5rem">
          <HomeScreen />
        </ToastProvider>
      </PhoneFrame>
      <PhoneFrame
        screenshotId="screen-record"
        title="New quote: just talk"
        caption="Big mic, bars that move with your voice, and the sizes it caught highlighted."
      >
        <ToastProvider bottomOffset="9rem">
          <RecordScreen />
        </ToastProvider>
      </PhoneFrame>
      <PhoneFrame
        screenshotId="screen-job"
        title="Job page: the next step is the big button"
        caption="Tap the orange button: the progress line moves and the button becomes the next job. “Price them” opens the price keypad."
      >
        <ToastProvider bottomOffset="6rem">
          <JobScreen />
        </ToastProvider>
      </PhoneFrame>
      <PhoneFrame
        screenshotId="screen-price"
        title="Pricing: type it once"
        caption="A big keypad walks through each item without a price, and remembers it for next time."
      >
        <ToastProvider bottomOffset="6rem">
          <PriceSheetPreview />
        </ToastProvider>
      </PhoneFrame>
    </div>
  );
}
