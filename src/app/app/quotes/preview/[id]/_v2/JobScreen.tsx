"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, DotsThreeOutline, Plus, Toolbox } from "@phosphor-icons/react/dist/ssr";
import { BottomActionBar } from "@/components/ui/bottom-action-bar";
import { Button, ButtonLink, buttonClasses } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { cx } from "@/components/ui/cx";
import { EmptyState } from "@/components/ui/empty-state";
import { IconButton } from "@/components/ui/icon-button";
import { Screen } from "@/components/ui/screen";
import { SectionTitle } from "@/components/ui/section-title";
import { StatusRail } from "@/components/ui/status-rail";
import type { Tone } from "@/components/ui/styles";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { ScanBarcodeButton } from "@/app/app/materials/_components/ScanBarcodeButton";
import { formatShortDayDate } from "@/lib/format-date";
import { QUOTE_LOCKED_MESSAGE } from "@/lib/lifecycle/lock";
import { canTransition } from "@/lib/lifecycle/stages";
import { scannedMaterialLine } from "@/lib/materials/barcodeLine";
import type { QuoteClient, QuoteLineItem, QuoteStatus } from "@/lib/quote-types";
import { QuoteVideoCard } from "../_components/QuoteVideoCard";
import {
  acceptQuote,
  declineQuote,
  markComplete,
  markInProgress,
  markInvoicePaid,
  saveQuoteChanges,
  scheduleJob,
  type LifecycleResult,
} from "../actions";
import { migrateLegacyContact } from "./contact";
import { clientFirstName, jobHeading } from "./job-title";
import { jobView, type JobView } from "./job-view";
import { checkIndexes, saveErrorMessage, unpricedIndexes, withLines } from "./lines";
import { ClientCard } from "./parts/ClientCard";
import { InvoiceCard } from "./parts/InvoiceCard";
import { JobTopBar } from "./parts/JobTopBar";
import { LineList } from "./parts/LineList";
import { QuoteVideoCardV2View } from "./parts/QuoteVideoCardV2View";
import { TotalCard } from "./parts/TotalCard";
import { applyPrice, priceSessionMessage, saveOptionsFor } from "./price-steps";
import { draftBlocker, sentMessage, type SendChannel } from "./send-flow";
import { ClientSheet } from "./sheets/ClientSheet";
import { InvoiceSheet, sendInvoiceEmail } from "./sheets/InvoiceSheet";
import { LineSheet } from "./sheets/LineSheet";
import { MoreToolsSheet } from "./sheets/MoreToolsSheet";
import { PriceSheet } from "./sheets/PriceSheet";
import { ReminderSheet } from "./sheets/ReminderSheet";
import { SendSheet } from "./sheets/SendSheet";
import { detailedEditorHref } from "./sheets/sender-parts";
import { AmountLine, BookSheet, ConfirmSheet, type StepResult } from "./sheets/StepSheets";
import type { JobScreenProps } from "./types";

type Sheet =
  | { kind: "send" }
  | { kind: "reminder" }
  | { kind: "accept" }
  | { kind: "decline" }
  | { kind: "book" }
  | { kind: "start" }
  | { kind: "finish" }
  | { kind: "invoice" }
  | { kind: "invoice-remind" }
  | { kind: "paid" }
  | { kind: "price"; startAt?: number }
  | { kind: "line"; index: number }
  | { kind: "new-line" }
  | { kind: "client" }
  | { kind: "more" };

type SaveOutcome = { ok: true } | { error: string };

/** Wait after the last save before refreshing the server parts (tools, video, version). */
const REFRESH_AFTER_SAVE_MS = 1500;

/**
 * Where toasts sit: clear of the bottom bar, which on phones docks above the
 * app's floating tab bar (the shell contract's 5.3rem + inset, see
 * docs/mobile-shell-contract.md). Buttons in the bar: 0, 1 or 2.
 */
export function toastOffsetClass(buttons: 0 | 1 | 2): string {
  switch (buttons) {
    case 0:
      return "[--job-toast:6rem] sm:[--job-toast:1.5rem]";
    case 1:
      return "[--job-toast:10.75rem] sm:[--job-toast:5.75rem]";
    default:
      return "[--job-toast:14.25rem] sm:[--job-toast:9.25rem]";
  }
}

export function barButtonCount(view: Pick<JobView, "next" | "secondary">): 0 | 1 | 2 {
  const main = view.next.kind === "none" || view.next.kind === "generating" ? 0 : 1;
  return (main + (view.secondary ? 1 : 0)) as 0 | 1 | 2;
}

function stateTone(view: JobView): Tone {
  if (view.position === "complete") return "ok";
  if (view.banner?.tone === "bad") return "bad";
  if (view.banner?.tone === "warn") return "warn";
  return "neutral";
}

/**
 * The new-look job page: the progress line, one big next-step button at the
 * thumb, the total, what's in the job, the client, the invoice and the quote
 * video, with everything else in "More tools". Status only moves through the
 * classic server actions and routes; every edit saves through saveQuoteChanges.
 */
export function JobScreen(props: JobScreenProps) {
  // The bar's size depends only on server state, so the toast offset can be
  // set above the toast provider.
  const layout = jobView({
    status: props.status,
    generated: true,
    clientFirstName: null,
    pastExpiry: props.pastExpiry,
    invoice: props.invoice,
  });
  return (
    <div
      className={cx(
        "flex min-h-[calc(100dvh-5.8rem-env(safe-area-inset-bottom)-env(safe-area-inset-top))] flex-col sm:min-h-dvh",
        toastOffsetClass(barButtonCount(layout)),
      )}
    >
      <ToastProvider bottomOffset="var(--job-toast)">
        <JobScreenInner {...props} />
      </ToastProvider>
    </div>
  );
}

function JobScreenInner(props: JobScreenProps) {
  const { quoteId, status, invoice } = props;
  const router = useRouter();
  const toast = useToast();

  const [lines, setLines] = useState<QuoteLineItem[]>(() => props.data.line_items);
  const [client, setClient] = useState<QuoteClient>(() => migrateLegacyContact(props.data.client));
  const [saving, setSaving] = useState(false);
  const [sheet, setSheet] = useState<Sheet | null>(null);

  // A fresh server render (after a step, a refresh, or a change made from
  // More tools such as a compliance answer) brings the stored lines: adopt
  // them, except while one of our own saves is on its way.
  const [syncedData, setSyncedData] = useState(props.data);
  if (props.data !== syncedData) {
    setSyncedData(props.data);
    if (!saving) {
      setLines(props.data.line_items);
      setClient(migrateLegacyContact(props.data.client));
    }
  }

  const refreshTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
    },
    [],
  );
  function cancelRefresh() {
    if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
    refreshTimer.current = null;
  }
  function scheduleRefresh() {
    cancelRefresh();
    refreshTimer.current = window.setTimeout(() => {
      refreshTimer.current = null;
      router.refresh();
    }, REFRESH_AFTER_SAVE_MS);
  }

  const current = withLines(props.data, lines, client);
  const first = clientFirstName(client.name);
  const who = first ?? "your client";
  const view = jobView({
    status,
    generated: true,
    clientFirstName: first,
    pastExpiry: props.pastExpiry,
    invoice,
    draftBlocker: status === "draft" ? draftBlocker(current, props.description) : null,
    dates: props.dates,
  });
  const locked = view.locked;
  const heading = jobHeading({ summary: current.job_summary, clientName: client.name, quoteNumber: props.quoteNumber });
  const currency = current.currency || "NZD";
  const unpriced = unpricedIndexes(current.line_items);
  const checks = checkIndexes(current.line_items);
  const dims = current.dimension_confirmation;
  const sizesToCheck = !!dims?.required && (dims.dimensions ?? []).some((d) => !d.confirmed);
  const canDecline = (["draft", "sent", "viewed"] as string[]).includes(status) && canTransition(status as QuoteStatus, "declined");

  /** Save lines and client through the classic save action (optimistic, rolled back on failure). */
  async function commit(nextLines: QuoteLineItem[], nextClient: QuoteClient = client, learn = true): Promise<SaveOutcome> {
    const before = { lines, client };
    cancelRefresh();
    setSaving(true);
    setLines(nextLines);
    setClient(nextClient);
    let result: Awaited<ReturnType<typeof saveQuoteChanges>>;
    try {
      result = await saveQuoteChanges(quoteId, withLines(props.data, nextLines, nextClient), saveOptionsFor(learn));
    } catch {
      result = { error: "network" };
    }
    setSaving(false);
    if ("error" in result) {
      setLines(before.lines);
      setClient(before.client);
      if (result.error === QUOTE_LOCKED_MESSAGE) router.refresh();
      return { error: saveErrorMessage(result.error, QUOTE_LOCKED_MESSAGE) };
    }
    scheduleRefresh();
    return { ok: true };
  }

  /** The classic send flow saves the editor first, so the routes see exactly this. */
  async function saveFirst(): Promise<SaveOutcome> {
    return commit(lines, client);
  }

  function close() {
    setSheet(null);
  }

  async function step(run: () => Promise<LifecycleResult>, done: string): Promise<StepResult> {
    let result: LifecycleResult;
    try {
      result = await run();
    } catch {
      return { error: "No connection. Check your signal and try again." };
    }
    if ("error" in result) return { error: result.error };
    setSheet(null);
    toast.show(done);
    return { ok: true };
  }

  function onSendDone(channel: SendChannel) {
    setSheet(null);
    toast.show(sentMessage(channel, first));
  }

  function onInvoiceSent() {
    setSheet(null);
    toast.show(`Invoice sent to ${who}`);
    router.refresh();
  }

  const fixLines = checks.length > 0 ? () => setSheet({ kind: "line", index: checks[0] }) : undefined;
  const openClient = () => setSheet({ kind: "client" });

  function mainButton() {
    switch (view.next.kind) {
      case "send":
      case "resend":
        return (
          <Button fullWidth data-testid="job-next" onClick={() => setSheet({ kind: "send" })}>
            {view.next.label}
          </Button>
        );
      case "remind":
        return (
          <Button fullWidth data-testid="job-next" onClick={() => setSheet({ kind: "reminder" })}>
            {view.next.label}
          </Button>
        );
      case "new-quote":
        return (
          <ButtonLink href="/app/quotes/new" fullWidth data-testid="job-next">
            {view.next.label}
          </ButtonLink>
        );
      case "book":
      case "start":
      case "finish":
      case "invoice":
      case "paid":
        return (
          <Button fullWidth data-testid="job-next" onClick={() => setSheet({ kind: view.next.kind as Sheet["kind"] } as Sheet)}>
            {view.next.label}
          </Button>
        );
      default:
        return null;
    }
  }

  function secondaryButton() {
    const secondary = view.secondary;
    if (!secondary) return null;
    const kind: Sheet["kind"] =
      secondary.kind === "accept" ? "accept" : secondary.kind === "invoice-remind" ? "invoice-remind" : "paid";
    return (
      <Button variant="secondary" fullWidth data-testid="job-next-secondary" onClick={() => setSheet({ kind } as Sheet)}>
        {secondary.label}
      </Button>
    );
  }

  const main = mainButton();
  const secondary = secondaryButton();

  return (
    <Screen height="fill" data-job-screen="" data-status={status} className="flex-1">
      <JobTopBar
        title={heading.title}
        subtitle={heading.subtitle}
        action={
          <IconButton label="More tools" icon={<DotsThreeOutline weight="fill" />} onClick={() => setSheet({ kind: "more" })} />
        }
      />

      <div className="mx-auto w-full max-w-xl flex-1 space-y-6 px-4 pt-5 pb-8">
        <section aria-label="Where this job is up to" className="space-y-3">
          <StatusRail position={view.position} />
          <p aria-live="polite" data-testid="job-hint" className="text-ui-base text-ui-text">
            {view.hint}
          </p>
        </section>

        {view.banner ? (
          <Callout tone={view.banner.tone} title={view.banner.title}>
            {view.banner.body}
          </Callout>
        ) : null}

        {props.stripped.length > 0 ? (
          <Callout
            tone="warn"
            title={`${props.stripped.length} ${props.stripped.length === 1 ? "line was" : "lines were"} left out`}
          >
            Nothing in the job description backed {props.stripped.length === 1 ? "it" : "them"} up:{" "}
            {props.stripped.join("; ")}. Add {props.stripped.length === 1 ? "it" : "them"} again if{" "}
            {props.stripped.length === 1 ? "it belongs" : "they belong"}.
          </Callout>
        ) : null}

        <TotalCard data={current} stateLabel={view.stateLabel} stateTone={stateTone(view)} unpriced={unpriced.length} />
        {status === "draft" ? (
          <p className="-mt-3 text-ui-sm text-ui-muted">
            A draft estimate. Check the quantities against your supplier before you send it.
          </p>
        ) : null}

        {!locked && unpriced.length > 0 ? (
          <Callout
            tone="warn"
            title={`${unpriced.length} ${unpriced.length === 1 ? "item needs" : "items need"} your price`}
            action={
              <Button variant="secondary" fullWidth data-testid="job-price-them" onClick={() => setSheet({ kind: "price" })}>
                Price {unpriced.length === 1 ? "it" : "them"}
              </Button>
            }
          >
            The total goes up once {unpriced.length === 1 ? "it's" : "they're"} in.
          </Callout>
        ) : null}

        {!locked && checks.length > 0 ? (
          <Callout
            tone="warn"
            title={`${checks.length} ${checks.length === 1 ? "line needs" : "lines need"} a check`}
            action={
              <Button variant="secondary" fullWidth onClick={() => setSheet({ kind: "line", index: checks[0] })}>
                Check {checks.length === 1 ? "it" : "them"}
              </Button>
            }
          >
            Some quantities were estimated or couldn&apos;t be worked out. Check them before the quote goes.
          </Callout>
        ) : null}

        {!locked && sizesToCheck ? (
          <Callout
            tone="warn"
            title="Check the sizes from your drawing"
            action={
              <ButtonLink href={detailedEditorHref(quoteId)} variant="secondary" fullWidth>
                Check the sizes
              </ButtonLink>
            }
          >
            We read some sizes off your drawing. Confirm them before the quote goes.
          </Callout>
        ) : null}

        <section aria-labelledby="job-lines" className="space-y-3">
          <SectionTitle
            id="job-lines"
            description={
              locked ? `${who.charAt(0).toUpperCase()}${who.slice(1)} said yes to this price, so the lines can't change now.` : undefined
            }
          >
            What&apos;s in the job
          </SectionTitle>
          {current.line_items.length > 0 ? (
            <LineList
              lines={current.line_items}
              currency={currency}
              onOpen={locked ? undefined : (index) => setSheet({ kind: "line", index })}
            />
          ) : (
            <EmptyState as="h3" title="Nothing in the job yet">
              Add the labour and materials, or scan a barcode.
            </EmptyState>
          )}
          {!locked ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <Button variant="secondary" fullWidth icon={<Plus weight="bold" />} onClick={() => setSheet({ kind: "new-line" })}>
                Add a line
              </Button>
              <ScanBarcodeButton
                mode="quote"
                currency={currency}
                library={props.library}
                className={buttonClasses({ variant: "secondary", fullWidth: true })}
                onAddToQuote={async (material) => {
                  const result = await commit([...lines, scannedMaterialLine(material)]);
                  toast.show("error" in result ? result.error : `Added ${material.name}`, {
                    tone: "error" in result ? "bad" : "ok",
                  });
                }}
              />
            </div>
          ) : null}
        </section>

        <ClientCard client={client} onEdit={locked ? undefined : openClient} />

        {status === "completed" || invoice ? (
          <InvoiceCard invoice={invoice} quoteTotal={current.total} currency={currency} />
        ) : null}

        {props.video ? (
          <QuoteVideoCard
            key={props.video.version}
            quoteId={quoteId}
            initialStatus={props.video.status}
            shareText={props.video.shareText}
            view={QuoteVideoCardV2View}
          />
        ) : null}

        <Button variant="secondary" fullWidth icon={<Toolbox weight="bold" />} onClick={() => setSheet({ kind: "more" })}>
          More tools
        </Button>
      </div>

      {main || secondary ? (
        <BottomActionBar
          safeArea
          className="max-sm:bottom-[calc(5.3rem+env(safe-area-inset-bottom))] max-sm:pb-3"
        >
          {secondary}
          {main}
        </BottomActionBar>
      ) : view.position === "complete" ? (
        <BottomActionBar safeArea className="max-sm:bottom-[calc(5.3rem+env(safe-area-inset-bottom))] max-sm:pb-3">
          <p className="flex min-h-14 items-center justify-center gap-2 font-semibold text-ui-ok">
            <CheckCircle aria-hidden="true" weight="fill" className="text-[1.5rem]" />
            Paid. Nice work.
          </p>
        </BottomActionBar>
      ) : null}

      {sheet?.kind === "send" ? (
        <SendSheet
          quoteId={quoteId}
          firstName={first}
          status={status}
          data={current}
          description={props.description}
          hasBusinessName={props.hasBusinessName}
          smsEnabled={props.smsEnabled}
          mode={status === "declined" ? "resend" : "send"}
          publicLink={props.publicLink}
          saveFirst={saveFirst}
          onSent={() => router.refresh()}
          onDone={onSendDone}
          onClose={close}
          onFixClient={openClient}
          onFixLines={fixLines}
        />
      ) : null}

      {sheet?.kind === "reminder" ? (
        <ReminderSheet
          quoteId={quoteId}
          firstName={first}
          data={current}
          reminder={props.reminder}
          publicLink={props.publicLink}
          sentOn={props.dates.sentOn ?? null}
          saveFirst={saveFirst}
          onSent={(channel) => {
            setSheet(null);
            toast.show(channel === "email" ? `Quote emailed to ${who} again` : sentMessage(channel, first));
            router.refresh();
          }}
          onClose={close}
          onFixClient={openClient}
          onFixLines={fixLines}
        />
      ) : null}

      {sheet?.kind === "accept" ? (
        <ConfirmSheet
          title={`Did ${who} say yes?`}
          description="Use this when they said yes by phone or in person."
          confirmLabel="Yes, mark it accepted"
          onConfirm={() => step(() => acceptQuote(quoteId), "Marked as accepted")}
          onClose={close}
        >
          <AmountLine amount={current.total} currency={currency}>
            is the agreed price. Its lines and client details are then locked.
          </AmountLine>
        </ConfirmSheet>
      ) : null}

      {sheet?.kind === "decline" ? (
        <ConfirmSheet
          title={`Did ${who} say no?`}
          description="Mark the quote as declined. You can change it and send it again later."
          confirmLabel="Yes, mark it declined"
          variant="danger"
          permanent={false}
          onConfirm={() => step(() => declineQuote(quoteId), "Marked as declined")}
          onClose={close}
        />
      ) : null}

      {sheet?.kind === "book" ? (
        <BookSheet
          onBook={(day) => step(() => scheduleJob(quoteId, day), `Booked for ${formatShortDayDate(day)}`)}
          onClose={close}
        />
      ) : null}

      {sheet?.kind === "start" ? (
        <ConfirmSheet
          title="Start the job?"
          description={props.dates.bookedFor ? `Booked for ${props.dates.bookedFor}.` : undefined}
          confirmLabel="Start the job"
          onConfirm={() => step(() => markInProgress(quoteId), "Job started")}
          onClose={close}
        >
          <p>Mark the job as started. Tap Job done when it&apos;s finished.</p>
        </ConfirmSheet>
      ) : null}

      {sheet?.kind === "finish" ? (
        <ConfirmSheet
          title="Is the job finished?"
          confirmLabel="Yes, job done"
          onConfirm={() => step(() => markComplete(quoteId), "Job done. Next: the invoice")}
          onClose={close}
        >
          <p>Mark it done. Next you&apos;ll send the invoice.</p>
        </ConfirmSheet>
      ) : null}

      {sheet?.kind === "invoice" ? (
        <InvoiceSheet
          quoteId={quoteId}
          invoice={invoice}
          clientEmail={client.email}
          firstName={first}
          total={current.total}
          currency={currency}
          blockers={props.invoiceBlockers}
          onSent={onInvoiceSent}
          onClose={close}
        />
      ) : null}

      {sheet?.kind === "invoice-remind" && invoice ? (
        <ConfirmSheet
          title="Send a reminder"
          description={invoice.dueOn ? `It was due ${invoice.dueOn}. The due date stays the same.` : undefined}
          confirmLabel="Email the invoice again"
          busyLabel="Sending…"
          permanent={false}
          onConfirm={async () => {
            const sent = await sendInvoiceEmail(invoice.id);
            if ("error" in sent) return sent;
            setSheet(null);
            toast.show(`Reminder sent to ${who}`);
            router.refresh();
            return { ok: true };
          }}
          onClose={close}
        >
          <AmountLine amount={invoice.total} currency={invoice.currency}>
            {client.email ? `to ${client.email}` : null}
          </AmountLine>
        </ConfirmSheet>
      ) : null}

      {sheet?.kind === "paid" && invoice ? (
        <ConfirmSheet
          title="Mark as paid?"
          description="Only once the money is in your account."
          confirmLabel="Yes, it's paid"
          onConfirm={async () => {
            let result: Awaited<ReturnType<typeof markInvoicePaid>>;
            try {
              result = await markInvoicePaid(invoice.id);
            } catch {
              return { error: "No connection. Check your signal and try again." };
            }
            if ("error" in result) return { error: result.error };
            setSheet(null);
            toast.show("Paid. Nice work.");
            return { ok: true };
          }}
          onClose={close}
        >
          <AmountLine amount={invoice.total} currency={invoice.currency}>
            {`for ${invoice.number}`}
          </AmountLine>
        </ConfirmSheet>
      ) : null}

      {sheet?.kind === "price" ? (
        <PriceSheet
          lines={current.line_items}
          startAt={sheet.startAt}
          currency={currency}
          onSavePrice={(index, price, learn) => commit(applyPrice(lines, index, price), client, learn)}
          onDone={(session) => {
            setSheet(null);
            toast.show(priceSessionMessage(session));
          }}
          onClose={close}
        />
      ) : null}

      {sheet?.kind === "line" && current.line_items[sheet.index] ? (
        <LineSheet
          key={sheet.index}
          mode={{ kind: "edit", index: sheet.index, line: lines[sheet.index] }}
          currency={currency}
          onSave={async (line) => {
            const result = await commit(lines.map((l, i) => (i === sheet.index ? line : l)));
            if ("ok" in result) {
              setSheet(null);
              toast.show("Line saved");
            }
            return result;
          }}
          onDelete={async () => {
            const result = await commit(lines.filter((_, i) => i !== sheet.index));
            if ("ok" in result) {
              setSheet(null);
              toast.show("Line deleted");
            }
            return result;
          }}
          onClose={close}
        />
      ) : null}

      {sheet?.kind === "new-line" ? (
        <LineSheet
          mode={{ kind: "new" }}
          currency={currency}
          onSave={async (line) => {
            const result = await commit([...lines, line]);
            if ("ok" in result) {
              setSheet(null);
              toast.show("Line added");
            }
            return result;
          }}
          onClose={close}
        />
      ) : null}

      {sheet?.kind === "client" ? (
        <ClientSheet
          client={client}
          onSave={async (next) => {
            const result = await commit(lines, next);
            if ("ok" in result) {
              setSheet(null);
              toast.show("Client saved");
            }
            return result;
          }}
          onClose={close}
        />
      ) : null}

      {sheet?.kind === "more" ? (
        <MoreToolsSheet
          quoteId={quoteId}
          publicLink={props.publicLink}
          hasPdf={props.hasPdf}
          lines={current.line_items}
          jobSummary={current.job_summary ?? null}
          notes={Array.isArray(current.notes) ? current.notes : []}
          bookedDate={props.bookedDate}
          dayNotes={props.dayNotes}
          serverTools={props.serverTools}
          onDecline={canDecline ? () => setSheet({ kind: "decline" }) : undefined}
          onClose={close}
        />
      ) : null}
    </Screen>
  );
}
