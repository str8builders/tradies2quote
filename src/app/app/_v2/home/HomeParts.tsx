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
  PaperPlaneTilt,
  Plus,
  Receipt,
} from "@phosphor-icons/react/dist/ssr";
import { Button, ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { cx } from "@/components/ui/cx";
import { EmptyState } from "@/components/ui/empty-state";
import { Money } from "@/components/ui/money";
import { SectionTitle } from "@/components/ui/section-title";
import { Skeleton } from "@/components/ui/skeleton";
import { ICON_CHIP, TAP, UI_TEXT } from "@/components/ui/styles";
import { NEW_QUOTE_PATH } from "../lib/app-nav";
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
    <Card as="li" className="flex gap-3" data-kind={todo.kind}>
      <span
        aria-hidden="true"
        className={cx(
          "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-ui-md text-[1.375rem]",
          ICON_CHIP[todo.tone],
        )}
      >
        <KindIcon weight="bold" />
      </span>
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
      <h2 id="home-todo-title" className="sr-only">
        To do
      </h2>
      <ul className="space-y-3">
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
      icon={hasJobs ? <CheckCircle weight="bold" /> : <FileText weight="bold" />}
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

function MoneyTile({ href, label, total, detail }: { href: string; label: string; total: MoneyTotal; detail: string }) {
  return (
    <Link
      href={href}
      className={cx(
        "ui-focus-ring block min-h-12 rounded-ui-lg border border-ui-line bg-ui-surface p-4 no-underline shadow-ui-card hover:bg-ui-surface-2",
        TAP,
        UI_TEXT,
      )}
    >
      <span className="block text-ui-sm text-ui-muted">{label}</span>
      <Money amount={total.amount} currency={total.currency} className="mt-1 block text-ui-xl font-semibold" />
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
        href={jobsHref("unpaid")}
        label="Owed to you"
        total={owed}
        detail={owed.count ? `${countOf(owed.count, "invoice")} out` : "Nothing owed"}
      />
      <MoneyTile
        href={jobsHref("done")}
        label="Paid this month"
        total={paidThisMonth}
        detail={paidThisMonth.count ? `${countOf(paidThisMonth.count, "invoice")} paid` : "Nothing yet"}
      />
    </section>
  );
}

// ── The screen ───────────────────────────────────────────────────────────────

export interface HomeViewProps {
  greeting: string;
  summary: string;
  /** The weather line (streams in on its own), or nothing. */
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
 * The new-look Home: what needs doing today, most urgent first. The New
 * quote action is the raised (+) at the thumb on phones and a button here
 * from `sm` up.
 */
export function HomeView({ greeting, summary, weather, setup, todos, hasJobs, tiles, failed }: HomeViewProps) {
  return (
    <>
      <SectionTitle
        size="page"
        description={summary}
        action={
          <div className="hidden sm:block">
            <ButtonLink href={NEW_QUOTE_PATH} variant="secondary" icon={<Plus weight="bold" />}>
              New quote
            </ButtonLink>
          </div>
        }
      >
        {greeting}
      </SectionTitle>
      <div className="mt-6 space-y-6">
        {weather}
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
    </>
  );
}

/** Stands in while the day loads. */
export function HomeSkeleton() {
  return (
    <div aria-busy="true" className="space-y-6">
      <span className="sr-only">Loading your day…</span>
      <div className="space-y-3">
        <Skeleton shape="line" className="h-9 w-56" />
        <Skeleton shape="line" className="w-44" />
      </div>
      <Skeleton className="h-36 w-full" />
      <Skeleton className="h-36 w-full" />
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
    </div>
  );
}
