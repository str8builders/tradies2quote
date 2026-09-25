import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Icon } from "@phosphor-icons/react";
import {
  CalendarCheck,
  CaretRight,
  ChatCircleText,
  Check,
  CheckCircle,
  Clock,
  FileText,
  HandCoins,
  Microphone,
  PaperPlaneTilt,
  Plus,
  Receipt,
  Ruler,
  Scan,
} from "@phosphor-icons/react/dist/ssr";
import { Button, ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { cx } from "@/components/ui/cx";
import { EmptyState } from "@/components/ui/empty-state";
import { IconTile } from "@/components/ui/icon-tile";
import { Money } from "@/components/ui/money";
import { SectionTitle } from "@/components/ui/section-title";
import { Skeleton } from "@/components/ui/skeleton";
import { ICON_CHIP, PRESS, TAP, TONE_STRIPE, UI_TEXT, type IconTone } from "@/components/ui/styles";
import { NEW_QUOTE_PATH } from "../lib/app-nav";
import { T2QCAL_HREF } from "../shell/T2QCALLink";
import { countOf } from "../lib/dates";
import { HOME_TODO_LIMIT, type MoneyTotal, type Todo, type TodoKind } from "../lib/home-todos";
import { jobsHref } from "../lib/job-board";
import { nextSetupStep, setupProgress, type SetupStep } from "../lib/setup-steps";
import { dismissSetupCard } from "./actions";
import { RevealMore } from "./RevealMore";

// ── To-do cards ──────────────────────────────────────────────────────────────

const KIND_ICON: Readonly<Record<TodoKind, Icon>> = {
  overdue: Clock,
  request: ChatCircleText,
  invoice: Receipt,
  book: CalendarCheck,
  follow_up: PaperPlaneTilt,
  draft: FileText,
};

function domId(key: string): string {
  return `todo-${key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

/** One thing to do: what happened, who and how much, and one button. */
export function TodoCard({ todo, primary }: { todo: Todo; primary: boolean }) {
  const KindIcon = KIND_ICON[todo.kind];
  const titleId = domId(todo.key);
  return (
    <Card as="li" className="relative flex gap-3 overflow-hidden" data-kind={todo.kind}>
      <span aria-hidden="true" className={cx("absolute inset-y-4 left-0 w-1 rounded-r-full", TONE_STRIPE[todo.tone])} />
      <IconTile icon={<KindIcon weight="duotone" />} tone={todo.tone} />
      <div className="min-w-0 flex-1">
        <p id={titleId} className="font-semibold break-words">
          {todo.title}
        </p>
        <p className="text-ui-sm break-words text-ui-muted">{todo.detail}</p>
        <div className="mt-3">
          <ButtonLink
            href={todo.action.href}
            variant={primary ? "primary" : "secondary"}
            size="md"
            aria-describedby={titleId}
          >
            {todo.action.label}
          </ButtonLink>
        </div>
      </div>
    </Card>
  );
}

/**
 * The to-do list: the first six cards, the rest one tap away. The first
 * card's button is the screen's one orange button.
 */
export function TodoList({ todos }: { todos: readonly Todo[] }) {
  const first = todos.slice(0, HOME_TODO_LIMIT);
  const rest = todos.slice(HOME_TODO_LIMIT);
  return (
    <section aria-labelledby="home-todo-title" data-testid="home-todos">
      <SectionTitle id="home-todo-title">Needs you today</SectionTitle>
      <ul className="mt-3 space-y-3">
        {first.map((todo, i) => (
          <TodoCard key={todo.key} todo={todo} primary={i === 0} />
        ))}
      </ul>
      {rest.length > 0 ? (
        <RevealMore label={`Show ${rest.length} more`}>
          <ul className="mt-3 space-y-3">
            {rest.map((todo) => (
              <TodoCard key={todo.key} todo={todo} primary={false} />
            ))}
          </ul>
        </RevealMore>
      ) : null}
    </section>
  );
}

/** Nothing to do: say so, and offer the next useful step. */
export function HomeEmpty({ hasJobs }: { hasJobs: boolean }) {
  return (
    <EmptyState
      icon={hasJobs ? <CheckCircle weight="duotone" /> : <FileText weight="duotone" />}
      title={hasJobs ? "All caught up" : "No jobs yet"}
      action={
        <ButtonLink href={NEW_QUOTE_PATH} icon={<Plus weight="bold" />} fullWidth>
          New quote
        </ButtonLink>
      }
    >
      {hasJobs
        ? "New requests, replies and payments show up here."
        : "Make your first quote and it shows up here, all the way to paid."}
    </EmptyState>
  );
}

// ── Setup card ───────────────────────────────────────────────────────────────

function SetupRow({ step, index, next }: { step: SetupStep; index: number; next: boolean }) {
  return (
    <li>
      <Link
        href={step.href}
        data-step={step.id}
        data-done={step.done ? "true" : "false"}
        className={cx(
          "ui-focus-ring flex min-h-16 items-center gap-3 rounded-ui-md px-3 py-2 text-ui-text no-underline hover:bg-ui-surface-2",
          TAP,
          next ? "border-2 border-ui-brand bg-ui-brand-soft" : "border border-ui-line",
        )}
      >
        <span
          aria-hidden="true"
          className={cx(
            "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-semibold",
            step.done ? "bg-ui-ok-soft text-ui-ok" : "border-2 border-ui-line-strong text-ui-muted",
          )}
        >
          {step.done ? <Check weight="bold" className="text-[1.25rem]" /> : index + 1}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{step.label}</span>
          <span className="block text-ui-sm text-ui-muted">{step.hint}</span>
        </span>
        <span className="sr-only">{step.done ? "Done." : next ? "Next step." : "Not done yet."}</span>
        <CaretRight aria-hidden="true" weight="bold" className="shrink-0 text-[1.25rem] text-ui-faint" />
      </Link>
    </li>
  );
}

/**
 * First visit: three steps, ticked from real data, each one tap to where
 * it's done. Instead of the welcome video and the coachmark tour. Gone once
 * all three are done, or when hidden on this device.
 */
export function SetupCard({ steps }: { steps: readonly SetupStep[] }) {
  const next = nextSetupStep(steps);
  return (
    <Card as="section" padding="lg" aria-labelledby="setup-title" data-testid="setup-card">
      <SectionTitle id="setup-title" description={`Three quick things and you're ready to quote. ${setupProgress(steps)}.`}>
        Get set up
      </SectionTitle>
      <ol className="mt-4 space-y-2">
        {steps.map((step, i) => (
          <SetupRow key={step.id} step={step} index={i} next={step === next} />
        ))}
      </ol>
      <form action={dismissSetupCard} className="mt-3">
        <Button type="submit" variant="ghost" size="sm">
          Hide this
        </Button>
      </form>
    </Card>
  );
}

// ── Money tiles ──────────────────────────────────────────────────────────────

function otherCurrencies(n: number): string {
  if (n === 0) return "";
  return n === 1 ? ", and 1 in another currency" : `, and ${n} in other currencies`;
}

const MONEY_TILE = {
  owed: { icon: HandCoins, tone: "brand", amount: "text-ui-brand-text" },
  paid: { icon: CheckCircle, tone: "ok", amount: "text-ui-ok" },
} as const;

function MoneyTile({
  href,
  label,
  total,
  detail,
  kind,
}: {
  href: string;
  label: string;
  total: MoneyTotal;
  detail: string;
  kind: keyof typeof MONEY_TILE;
}) {
  const look = MONEY_TILE[kind];
  const TileIcon = look.icon;
  return (
    <Link
      href={href}
      data-money={kind}
      className={cx(
        "ui-focus-ring block min-h-12 rounded-ui-lg border border-ui-line bg-ui-surface p-4 no-underline shadow-ui-card hover:bg-ui-surface-2",
        TAP,
        UI_TEXT,
      )}
    >
      <span className="flex items-center gap-2">
        <IconTile icon={<TileIcon weight="duotone" />} tone={look.tone} size="sm" />
        <span className="text-ui-sm text-ui-muted">{label}</span>
      </span>
      <Money
        amount={total.amount}
        currency={total.currency}
        className={cx(
          "ui-heading mt-2 block text-ui-lg break-words tabular-nums sm:text-ui-xl",
          total.amount > 0 ? look.amount : "text-ui-text",
        )}
      />
      <span className="mt-1 block text-ui-xs text-ui-faint">
        {detail}
        {otherCurrencies(total.otherCurrencies)}
      </span>
    </Link>
  );
}

/** Owed to you (sent and overdue invoices) and paid this month. */
export function MoneyTiles({ owed, paidThisMonth }: { owed: MoneyTotal; paidThisMonth: MoneyTotal }) {
  return (
    <section aria-label="Money" data-testid="money-tiles" className="grid grid-cols-2 gap-3">
      <MoneyTile
        kind="owed"
        href={jobsHref("unpaid")}
        label="Owed to you"
        total={owed}
        detail={owed.count ? `${countOf(owed.count, "invoice")} out` : "Nothing owed"}
      />
      <MoneyTile
        kind="paid"
        href={jobsHref("done")}
        label="Paid this month"
        total={paidThisMonth}
        detail={paidThisMonth.count ? `${countOf(paidThisMonth.count, "invoice")} paid` : "Nothing yet"}
      />
    </section>
  );
}

// ── Hero and quick actions ───────────────────────────────────────────────────

/** The worksite photo behind the hero. Decorative; the words say it all. */
export const HERO_PHOTO = "/images/worksite.webp";

/**
 * The top of Home: a worksite photo fading into the page, with today's
 * weather in the corner and what needs you in big type, plus what's owed.
 */
export function HomeHero({
  summary,
  weather,
  owed,
}: {
  summary: string;
  weather?: ReactNode;
  owed: MoneyTotal | null;
}) {
  return (
    <section
      aria-labelledby="home-summary"
      data-testid="home-hero"
      className={cx(
        "relative isolate flex min-h-48 flex-col justify-between gap-6 overflow-hidden rounded-ui-xl border border-ui-line p-4 shadow-ui-card sm:min-h-56 sm:p-5",
        UI_TEXT,
      )}
    >
      <Image
        src={HERO_PHOTO}
        alt=""
        fill
        sizes="(min-width: 672px) 640px, 100vw"
        loading="eager"
        fetchPriority="high"
        className="-z-20 object-cover object-[center_30%]"
      />
      <div aria-hidden="true" className="ui-hero-scrim absolute inset-0 -z-10" />
      <div className="min-h-9">{weather}</div>
      <div>
        <h2 id="home-summary" className="ui-heading text-ui-xl text-ui-text">
          {summary}
        </h2>
        {owed && owed.amount > 0 ? (
          <p className="mt-1 text-ui-sm font-semibold text-ui-text">
            <Money amount={owed.amount} currency={owed.currency} /> owed to you
          </p>
        ) : null}
      </div>
    </section>
  );
}

type QuickAction =
  | { href: string; label: string; kind: "talk" }
  | { href: string; label: string; kind: "t2qcal" }
  | { href: string; label: string; kind: "tile"; icon: Icon; tone: IconTone };

const QUICK_ACTIONS: readonly QuickAction[] = [
  { href: `${NEW_QUOTE_PATH}?start=talk`, label: "Talk a quote", kind: "talk" },
  { href: T2QCAL_HREF, label: "Calculators", kind: "t2qcal" },
  { href: "/t2qcal/measure", label: "Measure", kind: "tile", icon: Ruler, tone: "info" },
  { href: "/app/materials/import-quote", label: "Scan a doc", kind: "tile", icon: Scan, tone: "ok" },
];

const QUICK_TILE = "aspect-square w-full max-w-16 rounded-ui-lg";

function QuickTile({ action }: { action: QuickAction }) {
  if (action.kind === "t2qcal") {
    return (
      <Image
        src="/t2qcal/native-icon.png"
        alt=""
        width={64}
        height={64}
        className={cx(QUICK_TILE, "border border-ui-line")}
      />
    );
  }
  if (action.kind === "talk") {
    return (
      <span
        aria-hidden="true"
        className={cx(
          QUICK_TILE,
          "ui-brand-gradient inline-flex items-center justify-center text-[1.875rem] text-ui-on-brand shadow-ui-raised",
        )}
      >
        <Microphone weight="fill" />
      </span>
    );
  }
  const TileIcon = action.icon;
  return (
    <span
      aria-hidden="true"
      className={cx(QUICK_TILE, "inline-flex items-center justify-center text-[1.875rem]", ICON_CHIP[action.tone])}
    >
      <TileIcon weight="duotone" />
    </span>
  );
}

/**
 * Four big buttons under the hero: talk a quote (straight to the mic),
 * T2QCAL's calculators and measuring, and scanning a supplier document.
 * Each a coloured tile with its name under it.
 */
export function QuickActions() {
  return (
    <nav aria-label="Quick actions" data-testid="home-quick" className={UI_TEXT}>
      <ul className="grid grid-cols-4 gap-2 sm:gap-3">
        {QUICK_ACTIONS.map((action) => (
          <li key={action.href}>
            <Link
              href={action.href}
              data-quick={action.kind === "tile" ? action.tone : action.kind}
              className={cx(
                "ui-focus-ring flex min-h-12 flex-col items-center gap-1.5 rounded-ui-lg p-1 text-center text-ui-xs font-semibold text-ui-text no-underline",
                TAP,
                PRESS,
              )}
            >
              <QuickTile action={action} />
              <span>{action.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// ── The screen ───────────────────────────────────────────────────────────────

export interface HomeViewProps {
  /** "3 things need you today", in the hero. */
  summary: string;
  /** The weather chip (streams in on its own), or nothing. */
  weather?: ReactNode;
  /** The setup steps while the card shows, else null. */
  setup: readonly SetupStep[] | null;
  todos: readonly Todo[];
  hasJobs: boolean;
  tiles: { owed: MoneyTotal; paidThisMonth: MoneyTotal } | null;
  /** The jobs could not be read: say so rather than show a wrong board. */
  failed: boolean;
}

/**
 * The new-look Home under the top bar: the photo hero, four quick actions,
 * then what needs doing today, most urgent first, and the money. The New
 * quote action is the raised (+) at the thumb; "Talk a quote" opens the
 * mic directly.
 */
export function HomeView({ summary, weather, setup, todos, hasJobs, tiles, failed }: HomeViewProps) {
  return (
    <div className="space-y-6">
      <HomeHero summary={summary} weather={weather} owed={tiles?.owed ?? null} />
      <QuickActions />
      {failed ? (
        <Callout
          tone="bad"
          title="Couldn't load your jobs"
          action={
            <ButtonLink href="/app" variant="secondary">
              Try again
            </ButtonLink>
          }
        >
          Check your signal, then try again.
        </Callout>
      ) : null}
      {setup ? <SetupCard steps={setup} /> : null}
      {failed ? null : todos.length > 0 ? (
        <TodoList todos={todos} />
      ) : setup ? null : (
        <HomeEmpty hasJobs={hasJobs} />
      )}
      {tiles ? <MoneyTiles owed={tiles.owed} paidThisMonth={tiles.paidThisMonth} /> : null}
    </div>
  );
}

/** Stands in while the day loads (the top bar is already there). */
export function HomeSkeleton() {
  return (
    <div aria-busy="true" className="space-y-6">
      <span className="sr-only">Loading your day…</span>
      <Skeleton className="h-48 w-full sm:h-56" />
      <div className="grid grid-cols-4 gap-2 sm:gap-3">
        <Skeleton className="aspect-square" />
        <Skeleton className="aspect-square" />
        <Skeleton className="aspect-square" />
        <Skeleton className="aspect-square" />
      </div>
      <Skeleton className="h-36 w-full" />
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
    </div>
  );
}
