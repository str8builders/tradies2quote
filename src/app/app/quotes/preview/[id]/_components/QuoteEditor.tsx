"use client";

import { useMemo, useState, useTransition } from "react";
import {
  ArrowsClockwise,
  ArrowSquareOut,
  Calculator,
  Check,
  Plus,
  Sparkle,
  Trash,
  Warning,
} from "@phosphor-icons/react/dist/ssr";
import {
  computeQuoteTotals,
  formatCurrency,
  formatIssueDate,
  isPlaceholderClientName,
  quoteNumber,
  round2,
  splitDisplaySubtotals,
  validUntilDate,
} from "@/lib/quote-defaults";
import { validateSupplierQuote } from "@/lib/materials/quoteValidation";
import type {
  DimensionConfirmation,
  LibraryMaterial,
  QuoteData,
  QuoteItemType,
  QuoteLineItem,
  QuoteStatus,
} from "@/lib/quote-types";
import { applyLineEdit } from "@/lib/t2qcalLineEdit";
import {
  confirmAndRecalc,
  type DimensionEdit,
} from "@/lib/dimensionConfirmation";
import { matchToLibrary } from "@/lib/materials";
import {
  lineConfidence,
  confidenceTally,
  type LineConfidence,
} from "@/lib/lineConfidence";
import { explainFormula } from "@/lib/explainFormula";
import type { MaterialTakeoffResult } from "@/lib/materialCalculator";
import type { PhotoPlanItem } from "@/lib/agents/photo-plan";
import { confirmDimensions, saveQuoteChanges } from "../actions";
import { canSuggestPrice } from "@/lib/agents/suggestPrice/apply";
import { SuggestPricePanel } from "./SuggestPricePanel";
import { TakeoffPanel } from "./TakeoffPanel";
import { blockedLineGuide } from "@/lib/takeoff/blockedLineGuide";
import { PhotoPlanPanel } from "./PhotoPlanPanel";
import { SendQuoteButton } from "./SendQuoteButton";
import { MaterialsListButton } from "./MaterialsListButton";
import { hasT2QCALWorking, T2QCALWorking } from "./T2QCALWorking";
import { MobileCollapsibleCard } from "./MobileCollapsibleCard";
import { CsiGroupedView } from "./CsiGroupedView";
import { QuotePhotos } from "@/app/_components/quote/QuotePhotos";
import { SavedClientPicker, TermsTemplatePicker } from "./SavedQuoteDetails";
import { StickyActionBar } from "./StickyActionBar";

type Props = {
  quoteId: string;
  createdAt: string;
  initialData: QuoteData;
  library: LibraryMaterial[];
  quoteStatus: QuoteStatus;
  publicToken: string | null;
  hasPdf: boolean;
  /** Owner-only + flag gated. Enables the on-demand Suggest-a-Price button. */
  suggestPriceEnabled?: boolean;
  /** Server-decided: Twilio fully configured. When false the Text-send
   *  button is hidden entirely (never shown-but-broken). */
  smsEnabled?: boolean;
};

type SaveStatus = "idle" | "saving" | "saved" | "error";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// #1 — plain-English reason a drawing's key dimensions need confirming.
const DIM_REASON_LABEL: Record<string, string> = {
  low_confidence: "the drawing was hard to read",
  plan_text_disagree: "the plan and the written dimensions disagreed",
  no_scale: "no clear scale was found on the drawing",
  large_quantity: "it's a large job — a small dimension error costs a lot",
};

function migrateLegacyContact(
  c: QuoteData["client"] | null | undefined,
): QuoteData["client"] {
  // Defend against legacy / partial rows where `client` is missing —
  // without this fallback the editor page crashes on the first
  // property access below.
  const safe: QuoteData["client"] = c ?? {
    name: "",
    address: null,
    email: null,
    phone: null,
  };
  if (safe.email || safe.phone || !safe.contact) return safe;
  const legacy = safe.contact.trim();
  if (EMAIL_RE.test(legacy)) {
    return { ...safe, email: legacy };
  }
  return { ...safe, phone: legacy };
}

export function QuoteEditor({
  quoteId,
  createdAt,
  initialData,
  library,
  quoteStatus,
  publicToken,
  hasPdf,
  suggestPriceEnabled = false,
  smsEnabled = true,
}: Props) {
  const [client, setClient] = useState(() =>
    migrateLegacyContact(initialData.client),
  );
  const isAccepted = quoteStatus === "accepted";
  const [items, setItems] = useState<QuoteLineItem[]>(initialData.line_items);
  const libraryById = useMemo(
    () => new Map(library.map((m) => [m.id, m])),
    [library],
  );
  const [terms, setTerms] = useState(initialData.terms);
  // Wave 21 — `notes` lifted into state (was a read-only passthrough of
  // initialData.notes) so the Photo / Plan panel can append to it and
  // buildCurrentQuoteData() can persist it on save.
  const [notes, setNotes] = useState<string[]>(initialData.notes ?? []);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [materialsLearned, setMaterialsLearned] = useState<number>(0);
  const [isPending, startTransition] = useTransition();

  const markupPct = initialData.markup_pct;
  const taxRate = initialData.tax_rate;
  const taxLabel = initialData.tax_label;
  // Fall back to NZD — an empty / invalid currency makes every
  // Intl.NumberFormat call in the editor throw and crashes the page.
  const currency = initialData.currency || "NZD";

  const totals = useMemo(
    () => computeQuoteTotals(items, markupPct, taxRate),
    [items, markupPct, taxRate],
  );

  // Supplier-quote reconciliation. Only meaningful for quotes imported from
  // a scanned supplier (ITM) quote — those carry `supplier_source` totals
  // and per-line `source_line_total`. Reuses the SAME deterministic
  // validator the import screen uses so "source vs app" reads identically
  // on the final Review Quote. Absent on voice/typed/drawing quotes.
  const supplierSource = initialData.supplier_source ?? null;
  const hasSupplierSource =
    !!supplierSource &&
    (supplierSource.subtotal != null ||
      supplierSource.gst != null ||
      supplierSource.total != null ||
      items.some((it) => it.source_line_total != null));

  const reconciliation = useMemo(() => {
    if (!hasSupplierSource) return null;
    return validateSupplierQuote(
      {
        supplier: supplierSource?.supplier ?? null,
        quote_number: null,
        currency,
        gst_inclusive: false, // source values are stored ex-GST already
        items: items.map((it) => ({
          name: it.description,
          unit: it.unit,
          price: Number(it.unit_price) || null,
          sku: null,
          quantity: Number(it.quantity) || null,
          pieces: null,
          source_line_total: it.source_line_total ?? null,
          raw_text: null,
          confidence: 1,
        })),
        subtotal: supplierSource?.subtotal ?? null,
        gst: supplierSource?.gst ?? null,
        total: supplierSource?.total ?? null,
        notes: [],
      },
      { taxRate: taxRate / 100 },
    );
  }, [hasSupplierSource, supplierSource, items, currency, taxRate]);

  /** Snap a line's unit price so its line total matches the supplier source. */
  function applySupplierLineValue(idx: number) {
    const it = items[idx];
    if (!it || it.source_line_total == null) return;
    const qty = Number(it.quantity);
    if (!Number.isFinite(qty) || qty <= 0) return;
    updateItem(idx, { unit_price: round2(it.source_line_total / qty) });
  }

  function updateItem(idx: number, patch: Partial<QuoteLineItem>) {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const next = applyLineEdit(it, patch);
        next.line_total = round2(
          (Number(next.quantity) || 0) * (Number(next.unit_price) || 0),
        );
        // PHASE 7 — editing the quantity makes it the tradie's own value, so
        // it's no longer an unconfirmed AI quantity (unblocks the send gate).
        if (patch.quantity !== undefined && next.quantity_source === "ai") {
          next.quantity_source = "user";
          next.quantity_confirmed = true;
        }
        // Recovery — typing a real (non-zero) quantity on a BLOCKED
        // "needs dimensions" line converts it into a manual line the tradie
        // owns: clears the blocked state (so it no longer hard-blocks the send
        // gate) and marks it user-supplied. No guessing — it's their number.
        if (
          patch.quantity !== undefined &&
          next.takeoff_status === "blocked" &&
          (Number(next.quantity) || 0) > 0
        ) {
          next.takeoff_status = undefined;
          next.takeoff_flags = [];
          next.is_calculated_takeoff = false;
          next.quantity_source = "user";
          next.quantity_confirmed = true;
        }
        return next;
      }),
    );
  }

  /** Confirm an AI-estimated quantity as-is (the tradie agrees with it). */
  function confirmQuantity(idx: number) {
    setItems((prev) =>
      prev.map((it, i) =>
        i === idx ? { ...it, quantity_confirmed: true } : it,
      ),
    );
  }

  // #1 — risky-drawing key-dimension confirmation. Present only when the
  // generate route flagged this drawing as risky (low confidence, plan/prose
  // disagreement, no scale, or a large footprint). HARD-blocks send until
  // every key dimension is confirmed. Voice/typed and safe drawings carry no
  // confirmation object, so this whole panel is absent for them.
  const [dimConfirm, setDimConfirm] = useState<DimensionConfirmation | null>(
    initialData.dimension_confirmation ?? null,
  );
  const [dimDraft, setDimDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      (initialData.dimension_confirmation?.dimensions ?? []).map((d) => [
        d.key,
        String(d.value),
      ]),
    ),
  );
  const [dimError, setDimError] = useState<string>("");

  const dimEdits: DimensionEdit[] = (dimConfirm?.dimensions ?? []).map((d) => ({
    key: d.key,
    value: Number(dimDraft[d.key]),
  }));

  // Live, deterministic preview of the quantities a correction would produce
  // — the SAME pure recompute the server runs on confirm. Shown on the same
  // screen as the dimensions so the tradie sees the impact before confirming.
  const dimPreview = useMemo(() => {
    if (!dimConfirm) return null;
    return confirmAndRecalc(
      { ...initialData, line_items: items, dimension_confirmation: dimConfirm },
      dimEdits,
      { confirmedBy: "", confirmedAt: "" },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dimConfirm, items, dimDraft, initialData]);

  const dimUnconfirmed = (dimConfirm?.dimensions ?? []).filter(
    (d) => !d.confirmed,
  );
  const dimNeedsConfirm =
    !!dimConfirm?.required && dimUnconfirmed.length > 0;

  function handleConfirmDimensions() {
    if (!dimConfirm) return;
    // Validate the draft values before sending.
    for (const d of dimConfirm.dimensions) {
      const v = Number(dimDraft[d.key]);
      if (!Number.isFinite(v) || v <= 0) {
        setDimError(`${d.label} must be a positive number.`);
        return;
      }
    }
    setDimError("");
    setStatus("saving");
    setErrorMessage("");
    startTransition(async () => {
      const result = await confirmDimensions(
        quoteId,
        buildCurrentQuoteData(),
        dimEdits,
      );
      if ("error" in result) {
        setStatus("error");
        setErrorMessage(result.error);
        return;
      }
      setItems(result.lineItems);
      setDimConfirm(result.dimensionConfirmation);
      setDimDraft(
        Object.fromEntries(
          result.dimensionConfirmation.dimensions.map((d) => [
            d.key,
            String(d.value),
          ]),
        ),
      );
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2500);
    });
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function addItem(type: QuoteItemType) {
    const blank: QuoteLineItem = {
      type,
      description: "",
      quantity: type === "labour" ? 1 : 1,
      unit: type === "labour" ? "hour" : "each",
      unit_price: 0,
      line_total: 0,
    };
    setItems((prev) => [...prev, blank]);
  }

  function handleTakeoffResult(result: MaterialTakeoffResult) {
    // Count-first: a deterministic recalculation produces QUANTITIES only —
    // never an auto price (matches the server takeoff + PRICES_OFF policy).
    // The library link is kept so a future manual "use my price" can apply it;
    // price stays blank for manual entry. Replacing the material lines clears
    // any blocked "needs dimensions" lines (the new lines are calculated).
    const newMaterials: QuoteLineItem[] = result.materials.map((m) => {
      const match = matchToLibrary(m.name, library);
      return {
        type: "material",
        description: m.name,
        quantity: m.quantity,
        unit: m.unit,
        unit_price: 0,
        line_total: 0,
        library_id: match?.id ?? null,
        is_ai_estimated: false,
        is_missing_price: true,
        is_calculated_takeoff: true,
        quantity_source: "calculator",
        formula: m.formula,
        price_match_key: m.priceMatchKey,
        // Carry the exterior-only insulation flags through. STRICT: a
        // blocked calculator line (no exterior wall length) stays a
        // zero-quantity blocked line with the standard recovery UX.
        takeoff_status: m.blocked
          ? "blocked"
          : m.requiresReview
            ? "needs_review"
            : undefined,
        takeoff_flags:
          (m.blocked || m.requiresReview) && m.notes ? [m.notes] : [],
      };
    });
    setItems((prev) => [
      ...newMaterials,
      ...prev.filter((it) => it.type !== "material"),
    ]);
  }

  // Photo / Plan agent → quote. Detected items become draft material
  // lines, library-matched for price where possible (exactly like the
  // takeoff handler above). Unlike takeoff, these are APPENDED — a photo
  // adds to the quote, it doesn't replace the materials list.
  function handlePhotoPlanItems(detected: PhotoPlanItem[]) {
    const newItems: QuoteLineItem[] = detected.map((d) => {
      const match = matchToLibrary(d.label, library);
      const unit_price =
        match && match.default_unit_price !== null
          ? Number(match.default_unit_price)
          : 0;
      return {
        type: "material",
        description: d.location ? `${d.label} — ${d.location}` : d.label,
        quantity: 1,
        unit: "each",
        unit_price,
        line_total: round2(unit_price),
        library_id: match?.id ?? null,
        is_ai_estimated: true,
        is_missing_price: !match,
        quantity_source: "ai",
        quantity_confirmed: false,
        takeoff_status: "assumed",
        takeoff_flags: [
          "Photo/Plan agent spotted this item visually. Confirm the quantity before sending.",
        ],
      };
    });
    setItems((prev) => [...prev, ...newItems]);
  }

  // Photo / Plan agent → quote notes. The quote-note draft + on-site
  // review flags get appended to the "// review these" box.
  function handlePhotoPlanNotes(lines: string[]) {
    const clean = lines.map((l) => l.trim()).filter((l) => l.length > 0);
    if (clean.length === 0) return;
    setNotes((prev) => [...prev, ...clean]);
  }

  function buildCurrentQuoteData(): QuoteData {
    return {
      ...initialData,
      client,
      line_items: items,
      notes,
      terms,
      ...totals,
      markup_pct: markupPct,
      tax_rate: taxRate,
      tax_label: taxLabel,
      currency,
      // Persist the live confirmation state so a normal Save never reverts a
      // dimension confirmation back to the stale generated value.
      dimension_confirmation: dimConfirm,
    };
  }

  function handleSave() {
    setStatus("saving");
    setErrorMessage("");
    setMaterialsLearned(0);
    startTransition(async () => {
      const result = await saveQuoteChanges(quoteId, buildCurrentQuoteData());
      if ("error" in result) {
        setStatus("error");
        setErrorMessage(result.error);
        return;
      }
      setStatus("saved");
      setMaterialsLearned(result.materialsLearned ?? 0);
      setTimeout(() => {
        setStatus("idle");
        setMaterialsLearned(0);
      }, 2500);
    });
  }

  async function saveBeforeSend(): Promise<boolean> {
    const result = await saveQuoteChanges(quoteId, buildCurrentQuoteData());
    return !("error" in result);
  }

  const materialIndices = items
    .map((it, i) => ({ it, i }))
    .filter((x) => x.it.type === "material");
  const labourIndices = items
    .map((it, i) => ({ it, i }))
    .filter((x) => x.it.type === "labour");
  const otherIndices = items
    .map((it, i) => ({ it, i }))
    .filter((x) => x.it.type === "other");

  // The totals card shows Materials and Other as separate rows that each
  // tie out to their visible section. `totals.materials_subtotal` bundles
  // both (markup applies to the bundle); splitDisplaySubtotals is the
  // single source of that display-split rule (shared with the PDF + the
  // public quote).
  const { materials: materialsOnlySubtotal, other: otherSubtotal } =
    splitDisplaySubtotals(items);

  // PHASE 7 — material lines whose quantity came from the AI and isn't yet
  // confirmed. These HARD-block sending (see assessQuoteTakeoffSafety); the
  // banner below lets the tradie confirm or edit each. Never hidden.
  const aiQtyUnconfirmed = items
    .map((it, i) => ({ it, i }))
    .filter(
      (x) =>
        x.it.type === "material" &&
        x.it.quantity_source === "ai" &&
        x.it.quantity_confirmed !== true,
    );

  // #agents — unpriced material lines eligible for an on-demand price
  // suggestion. Only populated when the owner-only flag is on; empty
  // otherwise so the section never renders for normal users.
  const unpricedMaterials = items
    .map((it, i) => ({ it, i }))
    .filter((x) => canSuggestPrice(x.it, suggestPriceEnabled));

  // Wave 19.10 — summary strings for the mobile-collapsible cards.
  const materialMissingPrices = materialIndices.filter(
    (x) => x.it.is_missing_price,
  ).length;
  const materialConfidence = confidenceTally(
    materialIndices.map((x) => ({
      it: x.it,
      lib: x.it.library_id ? libraryById.get(x.it.library_id) : null,
    })),
  );
  const materialsSummary = [
    `${materialIndices.length} item${materialIndices.length === 1 ? "" : "s"}`,
    formatCurrency(totals.materials_subtotal, currency),
    materialMissingPrices > 0
      ? `(${materialMissingPrices} missing price${
          materialMissingPrices === 1 ? "" : "s"
        })`
      : null,
  ]
    .filter((s): s is string => Boolean(s))
    .join(" · ");
  const labourSummary = [
    `${labourIndices.length} item${labourIndices.length === 1 ? "" : "s"}`,
    formatCurrency(totals.labour_subtotal, currency),
  ].join(" · ");
  const termsClauseCount = terms
    .split(/\n\s*\n/)
    .filter((s) => s.trim().length > 0).length;
  const termsSummary = `${termsClauseCount} clause${
    termsClauseCount === 1 ? "" : "s"
  } · tap to view`;

  const issueDate = formatIssueDate(createdAt);
  const validUntil = formatIssueDate(validUntilDate(createdAt, 30));
  const number = quoteNumber(quoteId, createdAt);
  // Wave 14.4 — treat "To be confirmed" / TBC / TBD / blank the same.
  // The input value is suppressed to "" so the native placeholder
  // ("Client name") shows and the tradie can type cleanly.
  const clientPlaceholder = isPlaceholderClientName(client.name);
  const clientNameInputValue = clientPlaceholder ? "" : client.name;

  return (
    // Tail clearance now lives on the page <main> (pb-24 mobile) so cards
    // rendered AFTER the editor (Review tools, invoice draft) clear the
    // fixed StickyActionBar too — pb here only cleared the editor's own tail.
    <div className="space-y-6">
      <QuotePhotos quoteId={quoteId} />
      <section className="t2q-card-pro p-5 sm:p-6">
        <SavedClientPicker onSelect={setClient} disabled={isAccepted} />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex-1">
            <div className="font-mono text-xs uppercase tracking-[0.2em] text-ink-400">
              Client
            </div>
            <input
              data-testid="quote-client-name"
              aria-label="Client name"
              value={clientNameInputValue}
              onChange={(e) =>
                setClient((c) => ({ ...c, name: e.target.value }))
              }
              placeholder="Client name"
              disabled={isAccepted}
              className={[
                "mt-2 block w-full rounded-sm border bg-ink-900 px-3 py-2 font-display text-xl uppercase tracking-tight outline-none focus:border-brand disabled:cursor-not-allowed disabled:opacity-60",
                clientPlaceholder ? "border-hivis text-white placeholder:text-hivis/70" : "border-ink-600 text-white",
              ].join(" ")}
            />
            <textarea
              data-testid="quote-client-address"
              aria-label="Site address"
              value={client.address ?? ""}
              onChange={(e) =>
                setClient((c) => ({ ...c, address: e.target.value || null }))
              }
              rows={2}
              placeholder="Site address"
              disabled={isAccepted}
              className="mt-2 block w-full resize-none rounded-sm border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-white placeholder:text-ink-500 outline-none focus:border-brand disabled:cursor-not-allowed disabled:opacity-60"
            />
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input
                data-testid="quote-client-email"
                aria-label="Client email"
                type="email"
                value={client.email ?? ""}
                onChange={(e) =>
                  setClient((c) => ({ ...c, email: e.target.value || null }))
                }
                placeholder="Client email"
                disabled={isAccepted}
                className="block w-full rounded-sm border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-white placeholder:text-ink-500 outline-none focus:border-brand disabled:cursor-not-allowed disabled:opacity-60"
              />
              <input
                data-testid="quote-client-phone"
                aria-label="Client phone"
                type="tel"
                value={client.phone ?? ""}
                onChange={(e) =>
                  setClient((c) => ({ ...c, phone: e.target.value || null }))
                }
                placeholder="Client phone"
                disabled={isAccepted}
                className="block w-full rounded-sm border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-white placeholder:text-ink-500 outline-none focus:border-brand disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>
            {clientPlaceholder && (
              <div
                data-testid="client-name-required"
                className="mt-2 flex items-center gap-2 rounded-lg bg-ink-900 px-3 py-2.5 shadow-sm"
              >
                <Warning size={16} weight="fill" className="shrink-0 text-hivis" />
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-hivis">
                  Add the client&rsquo;s name before sending
                </span>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:max-w-xs sm:grid-cols-1 sm:text-right">
            <Meta label="Quote #" value={number} />
            <Meta label="Issued" value={issueDate} />
            <Meta label="Valid until" value={validUntil} />
            <Meta label="Currency" value={currency} />
          </div>
        </div>
        {initialData.job_summary && (
          <p className="mt-4 border-t border-ink-700 pt-4 text-sm text-ink-300">
            {initialData.job_summary}
          </p>
        )}
      </section>

      {notes.length > 0 && (
        <section
          data-testid="quote-notes"
          className="rounded-sm border border-hivis/40 bg-hivis/10 p-5"
        >
          <div className="font-mono text-xs uppercase tracking-[0.2em] text-hivis">
            {"// review these"}
          </div>
          <ul className="mt-3 space-y-2 text-sm text-ink-200">
            {notes.map((note, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden="true" className="text-hivis">
                  →
                </span>
                <span>{note}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <TakeoffPanel
        onRecalculate={handleTakeoffResult}
        initialInputs={initialData.takeoff_inputs}
        isAccepted={isAccepted}
      />

      <PhotoPlanPanel
        onAddItems={handlePhotoPlanItems}
        onAddNotes={handlePhotoPlanNotes}
        isAccepted={isAccepted}
      />

      {/* Wave 19.10 — Materials section: mobile-collapsible behind a
          summary line, always-expanded on md+. */}
      <MobileCollapsibleCard
        sectionId="materials"
        title="Materials"
        summary={materialsSummary}
      >
        <ItemsSection
          title="Materials"
          accent="brand"
          rows={materialIndices}
          currency={currency}
          libraryById={libraryById}
          showBadges
          showConfidence
          confidenceTally={materialConfidence}
          onUpdate={updateItem}
          onRemove={removeItem}
          onAdd={() => addItem("material")}
          addLabel="Add material"
          disabled={isAccepted}
        />
        {/* Take the takeoff to the merchant counter — quantities, no prices. */}
        <div className="mt-3 flex justify-end">
          <MaterialsListButton
            items={items}
            jobSummary={initialData.job_summary}
          />
        </div>
      </MobileCollapsibleCard>

      <MobileCollapsibleCard
        sectionId="labour"
        title="Labour"
        summary={labourSummary}
      >
        <ItemsSection
          title="Labour"
          accent="ink"
          rows={labourIndices}
          currency={currency}
          libraryById={libraryById}
          showBadges={false}
          onUpdate={updateItem}
          onRemove={removeItem}
          onAdd={() => addItem("labour")}
          addLabel="Add labour"
          disabled={isAccepted}
        />
      </MobileCollapsibleCard>

      {otherIndices.length > 0 && (
        <ItemsSection
          title="Other"
          accent="ink"
          rows={otherIndices}
          currency={currency}
          libraryById={libraryById}
          showBadges={false}
          onUpdate={updateItem}
          onRemove={removeItem}
          onAdd={() => addItem("other")}
          addLabel="Add line"
          disabled={isAccepted}
        />
      )}

      {/* CSI grouped view — READ-ONLY presentation lens over the same line
          items. Collapsed by default so the standard editable view stays the
          conservative default. Never edits, recalculates, or reprices. */}
      <section data-testid="csi-grouped-card" className="t2q-card-pro p-5 sm:p-6">
        <details>
          <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
            <p className="t2q-section-label-pro">{"// csi grouped view"}</p>
            <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.15em] text-ink-400">
              read-only · tap to expand
            </span>
          </summary>
          <p className="mt-2 text-xs text-ink-400">
            Same lines, grouped into CSI / MasterFormat trade divisions. An
            organizational view — your editable quote above is unchanged.
          </p>
          <div className="mt-4">
            <CsiGroupedView items={items} />
          </div>
        </details>
      </section>

      {reconciliation && (
        <section
          data-testid="quote-supplier-reconcile"
          className="t2q-card-pro p-5 sm:p-6"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="t2q-section-label-pro">
              {"// supplier reconciliation"}
            </p>
            <span
              className={`rounded-sm px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.15em] ${
                reconciliation.severity === "error"
                  ? "bg-red-500/15 text-red-300"
                  : reconciliation.severity === "warning"
                    ? "bg-hivis/15 text-hivis"
                    : "bg-emerald-500/15 text-emerald-300"
              }`}
            >
              {reconciliation.severity === "error"
                ? "doesn't match supplier"
                : reconciliation.severity === "warning"
                  ? "check"
                  : "matches supplier"}
            </span>
          </div>

          {/* Verdict banner — makes the reconciliation result (and WHY a
              send is blocked) unmissable, tying the visible diff to the
              hard-block send gate. Driven by the deterministic
              reconciliation_status, never a guess. */}
          {reconciliation.reconciliation_status !== "ok" && (
            <div
              data-testid="reconcile-banner"
              data-status={reconciliation.reconciliation_status}
              className={`mt-3 rounded-lg border px-3.5 py-3 ${
                reconciliation.reconciliation_status === "blocked"
                  ? "border-red-500/40 bg-red-500/10"
                  : "border-hivis/40 bg-hivis/10"
              }`}
            >
              <p
                className={`flex items-start gap-1.5 text-sm font-semibold ${
                  reconciliation.reconciliation_status === "blocked"
                    ? "text-red-200"
                    : "text-hivis"
                }`}
              >
                <Warning size={14} weight="fill" className="mt-0.5 shrink-0" />
                <span>
                  {reconciliation.reconciliation_status === "blocked"
                    ? "This quote doesn't match the supplier quote — fix the flagged lines (or “use supplier value”) before it can be sent."
                    : "Some values need a check against the supplier quote."}
                </span>
              </p>
              {reconciliation.reconciliation_reasons.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-xs text-ink-200">
                  {reconciliation.reconciliation_reasons
                    .slice(0, 4)
                    .map((reason, i) => (
                      <li key={i} className="flex gap-1.5">
                        <span aria-hidden="true" className="text-ink-500">
                          ·
                        </span>
                        <span>{reason}</span>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          )}

          {(() => {
            const mismatches = items
              .map((it, idx) => ({
                it,
                idx,
                check: reconciliation.lines[idx]?.checks[0],
              }))
              .filter(
                (x) =>
                  x.check &&
                  x.check.found != null &&
                  x.check.severity === "error",
              );
            if (mismatches.length === 0) return null;
            return (
              <ul className="mt-3 space-y-2">
                {mismatches.map(({ it, idx, check }) => (
                  <li
                    key={idx}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-red-500/30 bg-red-500/5 px-3 py-2"
                  >
                    <span className="inline-flex min-w-0 flex-1 items-center gap-1.5 text-sm text-white">
                      <Warning
                        size={12}
                        weight="fill"
                        className="shrink-0 text-red-300"
                      />
                      <span className="truncate">{it.description}</span>
                    </span>
                    <span className="font-mono text-[11px] tabular-nums text-ink-300">
                      supplier {formatCurrency(check!.found as number, currency)}{" "}
                      · app{" "}
                      {check!.expected != null
                        ? formatCurrency(check!.expected, currency)
                        : "—"}
                    </span>
                    <button
                      type="button"
                      onClick={() => applySupplierLineValue(idx)}
                      disabled={isAccepted}
                      data-testid="reconcile-use-supplier"
                      className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.15em] text-brand hover:text-white disabled:opacity-50"
                    >
                      <ArrowsClockwise size={10} weight="bold" />
                      use supplier value
                    </button>
                  </li>
                ))}
              </ul>
            );
          })()}

          <div className="mt-3 overflow-hidden rounded-lg border border-[#E8E7E0]">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="bg-ink-900 font-mono text-[10px] uppercase tracking-[0.15em] text-ink-400">
                  <th className="px-3 py-2 text-left font-medium">Field</th>
                  <th className="px-3 py-2 text-right font-medium">Supplier</th>
                  <th className="px-3 py-2 text-right font-medium">App</th>
                  <th className="px-2 py-2" aria-label="Status" />
                </tr>
              </thead>
              <tbody>
                {reconciliation.summary.map((c) => {
                  const bad = c.severity === "error";
                  const warn = c.severity === "warning";
                  return (
                    <tr key={c.field} className="border-t border-[#ECEBE4]">
                      <td className="px-3 py-2 font-mono text-[11px] uppercase tracking-[0.15em] text-ink-500">
                        {c.field}
                      </td>
                      <td className="px-3 py-2 text-right text-ink-600">
                        {c.found != null ? formatCurrency(c.found, currency) : "—"}
                      </td>
                      <td
                        className={`px-3 py-2 text-right font-semibold ${
                          bad ? "text-red-300" : "text-ink-900"
                        }`}
                      >
                        {c.expected != null
                          ? formatCurrency(c.expected, currency)
                          : "—"}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {bad && (
                          <span className="inline-block rounded bg-red-500/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.15em] text-red-300">
                            mismatch
                          </span>
                        )}
                        {warn && (
                          <span className="inline-block rounded bg-hivis/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.15em] text-hivis">
                            check
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {dimConfirm?.required && (
        <section
          data-testid="dimension-confirm"
          data-confirmed={dimNeedsConfirm ? "false" : "true"}
          className={`t2q-card-pro border p-5 sm:p-6 ${
            dimNeedsConfirm ? "border-red-500/40" : "border-emerald-500/30"
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <p className="t2q-section-label-pro">
              {"// confirm key dimensions"}
            </p>
            <span
              className={`rounded-sm px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.15em] ${
                dimNeedsConfirm
                  ? "bg-red-500/15 text-red-300"
                  : "bg-emerald-500/15 text-emerald-300"
              }`}
            >
              {dimNeedsConfirm ? "from drawing · unconfirmed" : "confirmed"}
            </span>
          </div>

          {dimNeedsConfirm ? (
            <>
              <p className="mt-3 flex items-start gap-1.5 text-sm font-semibold text-red-200">
                <Warning size={14} weight="fill" className="mt-0.5 shrink-0" />
                <span>
                  We read these key dimensions off your drawing. Confirm or
                  correct each one — the quote can&apos;t be sent until they&apos;re
                  confirmed.
                </span>
              </p>
              {dimConfirm.reasons.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-xs text-ink-300">
                  {dimConfirm.reasons.map((r) => (
                    <li key={r} className="flex gap-1.5">
                      <span aria-hidden="true" className="text-ink-500">
                        ·
                      </span>
                      <span>
                        Flagged because {DIM_REASON_LABEL[r] ?? r}.
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {/* Editable dimensions — editing recalculates live below. */}
              <div className="mt-4 space-y-2">
                {dimConfirm.dimensions.map((d) => (
                  <div
                    key={d.key}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-ink-700/60 px-3 py-2"
                  >
                    <span className="text-sm text-white">{d.label}</span>
                    <span className="inline-flex items-center gap-1.5">
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        value={dimDraft[d.key] ?? ""}
                        disabled={isAccepted}
                        data-testid={`dimension-input-${d.key}`}
                        onChange={(e) =>
                          setDimDraft((prev) => ({
                            ...prev,
                            [d.key]: e.target.value,
                          }))
                        }
                        className="w-24 rounded-sm border border-ink-700 bg-ink-900 px-2 py-1 text-right font-mono text-sm tabular-nums text-white focus:border-brand focus:outline-none"
                      />
                      <span className="font-mono text-[11px] text-ink-400">
                        {d.unit}
                      </span>
                    </span>
                  </div>
                ))}
              </div>

              {/* Resulting recalculated quantities — same deterministic
                  calculator the server will run on confirm. */}
              {dimPreview && dimPreview.line_items.some((i) => i.is_calculated_takeoff) && (
                <div className="mt-4 border-t border-white/5 pt-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400">
                    {dimPreview.changed
                      ? "Recalculated quantities (preview)"
                      : "Resulting quantities"}
                  </p>
                  <ul className="mt-2 space-y-1">
                    {dimPreview.line_items
                      .filter((i) => i.is_calculated_takeoff)
                      .map((i, n) => {
                        const before = items.find(
                          (x) =>
                            x.is_calculated_takeoff &&
                            (x.price_match_key ?? x.description) ===
                              (i.price_match_key ?? i.description),
                        );
                        const changed =
                          dimPreview.changed &&
                          before != null &&
                          Math.abs((before.quantity ?? 0) - i.quantity) > 1e-9;
                        return (
                          <li
                            key={n}
                            className="flex items-center justify-between gap-2 text-sm"
                          >
                            <span className="min-w-0 flex-1 truncate text-ink-200">
                              {i.description}
                            </span>
                            <span className="shrink-0 font-mono text-[12px] tabular-nums text-white">
                              {changed && before && (
                                <span className="mr-1.5 text-ink-500 line-through">
                                  {before.quantity}
                                </span>
                              )}
                              {i.quantity} {i.unit}
                            </span>
                          </li>
                        );
                      })}
                  </ul>
                </div>
              )}

              {dimError && (
                <p className="mt-3 text-xs text-red-300">{dimError}</p>
              )}

              <button
                type="button"
                onClick={handleConfirmDimensions}
                disabled={isAccepted || isPending}
                data-testid="confirm-dimensions"
                className="t2q-btn-primary mt-4 w-full justify-center sm:w-auto"
              >
                <Check size={14} weight="bold" />
                {dimPreview?.changed
                  ? "Save corrected dimensions"
                  : "Confirm dimensions"}
              </button>
            </>
          ) : (
            <div className="mt-3 space-y-1.5">
              <p className="flex items-start gap-1.5 text-sm text-emerald-200">
                <Check size={14} weight="bold" className="mt-0.5 shrink-0" />
                <span>Key dimensions confirmed.</span>
              </p>
              <ul className="space-y-0.5 text-xs text-ink-300">
                {dimConfirm.dimensions.map((d) => (
                  <li key={d.key} className="flex justify-between gap-2">
                    <span>{d.label}</span>
                    <span className="font-mono tabular-nums text-ink-200">
                      {d.value} {d.unit}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {aiQtyUnconfirmed.length > 0 && (
        <section
          data-testid="ai-qty-confirm"
          className="t2q-card-pro border border-red-500/30 p-5 sm:p-6"
        >
          <p className="flex items-start gap-1.5 text-sm font-semibold text-red-200">
            <Warning size={14} weight="fill" className="mt-0.5 shrink-0" />
            <span>
              {aiQtyUnconfirmed.length} line
              {aiQtyUnconfirmed.length === 1 ? "" : "s"} use a T2Q-estimated
              quantity. Confirm or edit each before this quote can be sent —
              T2Q never sets a quantity on a sent quote unchecked.
            </span>
          </p>
          <ul className="mt-3 space-y-1.5">
            {aiQtyUnconfirmed.map(({ it, i }) => (
              <li
                key={i}
                className="flex items-center justify-between gap-2 rounded-sm border border-red-500/20 bg-red-500/5 px-3 py-2"
              >
                <span className="min-w-0 flex-1 truncate text-sm text-white">
                  {it.description || "Untitled line"}
                  <span className="ml-1.5 tabular-nums text-ink-300">
                    {it.quantity} {it.unit}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => confirmQuantity(i)}
                  disabled={isAccepted}
                  data-testid="confirm-ai-qty"
                  className="inline-flex shrink-0 items-center gap-1 font-mono text-[9px] uppercase tracking-[0.15em] text-brand hover:text-white disabled:opacity-50"
                >
                  <Check size={10} weight="bold" />
                  confirm qty
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {suggestPriceEnabled && unpricedMaterials.length > 0 && (
        <section
          data-testid="suggest-price-section"
          className="t2q-card-pro border border-brand/25 p-5 sm:p-6"
        >
          <p className="t2q-section-label-pro text-brand">
            {"// suggest a price"}
          </p>
          <p className="mt-2 text-sm text-ink-200">
            {unpricedMaterials.length} material line
            {unpricedMaterials.length === 1 ? "" : "s"} have no price. Get a
            suggestion from your library + past quotes, then confirm — nothing
            is applied until you tap a button.
          </p>
          <ul className="mt-3 space-y-2">
            {unpricedMaterials.map(({ it, i }) => (
              <SuggestPricePanel
                key={i}
                line={{
                  description: it.description,
                  quantity: Number(it.quantity) || 0,
                  unit: it.unit ?? null,
                }}
                onUseOnce={(price) =>
                  updateItem(i, { unit_price: price, is_missing_price: false })
                }
                onSavedAndApply={(price) =>
                  updateItem(i, { unit_price: price, is_missing_price: false })
                }
              />
            ))}
          </ul>
        </section>
      )}

      <section data-testid="quote-totals" className="t2q-card-pro p-5 sm:p-6">
        <TotalsRow
          label="Materials subtotal"
          value={formatCurrency(materialsOnlySubtotal, currency)}
        />
        {/* $0 materials with unpriced lines used to render as a bare
            "$0.00" (and Markup $0.00) with no explanation — read as a
            broken calculator. The quantities are real; the PRICES are
            deliberately yours to set. Say so right where the $0 shows. */}
        {unpricedMaterials.length > 0 && (
          <p
            data-testid="quote-totals-unpriced-note"
            className="mb-2 rounded-sm border border-hivis/30 bg-hivis/10 px-2.5 py-1.5 text-xs text-hivis"
          >
            {unpricedMaterials.length} material line
            {unpricedMaterials.length === 1 ? "" : "s"} counted but not
            priced yet — they add $0 (and $0 markup) until you set your
            prices on the lines above.
          </p>
        )}
        {otherIndices.length > 0 && (
          <TotalsRow
            label="Other subtotal"
            value={formatCurrency(otherSubtotal, currency)}
          />
        )}
        <TotalsRow
          label={`Markup (${markupPct}%)`}
          value={formatCurrency(totals.markup_amount, currency)}
        />
        <TotalsRow
          label="Labour subtotal"
          value={formatCurrency(totals.labour_subtotal, currency)}
        />
        <TotalsRow
          label={taxRate > 0 ? `Subtotal (excl. ${taxLabel})` : "Subtotal"}
          value={formatCurrency(totals.subtotal_before_tax, currency)}
          divider
        />
        <TotalsRow
          label={`${taxLabel} (${taxRate}%)`}
          value={formatCurrency(totals.tax_amount, currency)}
        />
        <TotalsRow
          label={taxRate > 0 ? `Total (incl. ${taxLabel})` : "Total"}
          value={formatCurrency(totals.total, currency)}
          emphasis
          testId="quote-total"
        />
        {/* Launch honesty — quantities/prices are a draft estimate. Keeps the
            promise safe without dampening confidence. */}
        <p className="mt-3 text-[11px] leading-snug text-ink-400">
          Draft estimate. Review quantities and check material counts against
          your supplier quote before sending.
        </p>
      </section>

      {/* Wave 19.10 — Terms: mobile-collapsible behind a clause-count
          summary, always-expanded on md+. */}
      <MobileCollapsibleCard
        sectionId="terms"
        title="Terms"
        summary={termsSummary}
      >
        <section className="t2q-card-pro p-5 sm:p-6">
          <div className="font-mono text-xs uppercase tracking-[0.2em] text-ink-400">
            Terms
          </div>
          <TermsTemplatePicker onSelect={setTerms} disabled={isAccepted} />
          <textarea
            data-testid="quote-terms"
            aria-label="Quote terms"
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            rows={6}
            disabled={isAccepted}
            className="mt-3 block w-full resize-y rounded-sm border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-ink-200 outline-none focus:border-brand disabled:cursor-not-allowed disabled:opacity-60"
          />
        </section>
      </MobileCollapsibleCard>

      {/* SendQuoteButton keeps the inline link / PDF / copy affordances
          for sent / viewed / accepted states — but its Send trigger
          is hidden because StickyActionBar now owns that action. */}
      <SendQuoteButton
        quoteId={quoteId}
        status={quoteStatus}
        publicToken={publicToken}
        hasPdf={hasPdf}
        onSaveBeforeSend={saveBeforeSend}
        hideSendButton
      />

      {/* Save-status feedback strip — small inline pill above the
          sticky bar so the operator still sees "saved" / errors /
          materials-learned without the old large bottom row. */}
      <div
        data-testid="save-status"
        aria-live="polite"
        className="font-mono text-xs uppercase tracking-[0.2em]"
      >
        {status === "saving" && <span className="text-ink-400">Saving…</span>}
        {status === "saved" && (
          <span className="text-brand">
            {materialsLearned > 0
              ? `// saved · ${materialsLearned} material${materialsLearned === 1 ? "" : "s"} added to your library`
              : "// saved"}
          </span>
        )}
        {status === "error" && (
          <span className="text-red-400">{errorMessage || "Save failed"}</span>
        )}
        {status === "idle" && (
          <span className="text-ink-500">
            {isAccepted
              ? "// quote is accepted — edits are read-only"
              : "// edits are not saved until you click save"}
          </span>
        )}
      </div>

      <StickyActionBar
        quoteId={quoteId}
        status={quoteStatus}
        isPending={isPending}
        onSave={handleSave}
        onSaveBeforeSend={saveBeforeSend}
        smsEnabled={smsEnabled}
      />
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-500">
        {label}
      </div>
      <div className="font-display text-sm uppercase tracking-tight text-white">
        {value}
      </div>
    </div>
  );
}

function ItemsSection({
  title,
  accent,
  rows,
  currency,
  libraryById,
  showBadges,
  showConfidence,
  confidenceTally,
  onUpdate,
  onRemove,
  onAdd,
  addLabel,
  disabled,
}: {
  title: string;
  accent: "brand" | "ink";
  rows: Array<{ it: QuoteLineItem; i: number }>;
  currency: string;
  libraryById: Map<string, LibraryMaterial>;
  showBadges: boolean;
  showConfidence?: boolean;
  confidenceTally?: { high: number; medium: number; low: number };
  onUpdate: (idx: number, patch: Partial<QuoteLineItem>) => void;
  onRemove: (idx: number) => void;
  onAdd: () => void;
  addLabel: string;
  disabled?: boolean;
}) {
  return (
    <section
      data-testid={`section-${title.toLowerCase()}`}
      className="t2q-card-pro p-4 sm:p-5"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-display text-xl uppercase tracking-tight sm:text-2xl">
          <span className={accent === "brand" ? "text-brand" : "text-white"}>
            {title}
          </span>
        </h3>
        <button
          type="button"
          data-testid={`add-${title.toLowerCase()}`}
          onClick={onAdd}
          disabled={disabled}
          title={disabled ? "Quote already accepted." : undefined}
          className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-[0.2em] text-ink-300 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-ink-300"
        >
          <Plus size={14} weight="bold" />
          {addLabel}
        </button>
      </div>

      {showConfidence && confidenceTally && rows.length > 0 && (
        <ConfidenceLegend tally={confidenceTally} />
      )}

      {rows.length === 0 ? (
        <p className="mt-4 font-mono text-xs uppercase tracking-[0.2em] text-ink-500">
          {"// no items — add one above"}
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map(({ it, i }) => {
            const libMaterial = it.library_id
              ? libraryById.get(it.library_id)
              : undefined;
            const confidence: LineConfidence = showConfidence
              ? lineConfidence(it, libMaterial)
              : "none";
            const confidenceClass =
              confidence === "high"
                ? "border-l-4 border-l-emerald-500/70"
                : confidence === "medium"
                  ? "border-l-4 border-l-hivis/70"
                  : confidence === "low"
                    ? "border-l-4 border-l-red-500/70"
                    : "";
            return (
            <li
              key={i}
              data-testid={`row-${i}`}
              data-confidence={confidence}
              className={`rounded-sm border border-ink-700 bg-ink-900 p-2 ${confidenceClass}`}
            >
              {showBadges && (
                <ItemBadge
                  isCalculatedTakeoff={!!it.is_calculated_takeoff}
                  isLibrary={!!libMaterial}
                  isAi={!!it.is_ai_estimated && !libMaterial && !it.is_missing_price}
                  isMissingPrice={!!it.is_missing_price}
                  takeoffStatus={it.takeoff_status}
                  takeoffFlags={it.takeoff_flags}
                  supplierUrl={libMaterial?.supplier_url ?? null}
                  supplierName={libMaterial?.supplier ?? null}
                />
              )}
              {it.takeoff_status === "blocked" && (
                <p
                  data-testid={`blocked-guide-${i}`}
                  className="mb-1.5 rounded-sm border border-red-500/30 bg-red-500/5 px-2 py-1.5 text-[11px] leading-relaxed text-red-200"
                >
                  {blockedLineGuide(it.description)}
                </p>
              )}
              <div className="flex items-start gap-2">
                <input
                  aria-label="Line item description"
                  value={it.description}
                  onChange={(e) =>
                    onUpdate(i, { description: e.target.value })
                  }
                  placeholder="Description"
                  disabled={disabled}
                  className="flex-1 rounded-sm border border-ink-700 bg-ink-800 px-2 py-1.5 text-sm text-white placeholder:text-ink-500 outline-none focus:border-brand disabled:cursor-not-allowed disabled:opacity-60"
                />
                <button
                  type="button"
                  aria-label="Remove line"
                  onClick={() => onRemove(i)}
                  disabled={disabled}
                  title={disabled ? "Quote already accepted." : undefined}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-sm border border-ink-700 text-ink-400 hover:border-red-500 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-ink-700 disabled:hover:text-ink-400"
                >
                  <Trash size={16} weight="bold" />
                </button>
              </div>
              <div className="mt-1 grid grid-cols-3 gap-2">
                <NumberField
                  label="Qty"
                  value={it.quantity}
                  onChange={(v) => onUpdate(i, { quantity: v })}
                  disabled={disabled}
                />
                <TextField
                  label="Unit"
                  value={it.unit}
                  onChange={(v) => onUpdate(i, { unit: v })}
                  disabled={disabled}
                />
                <NumberField
                  label="Unit price"
                  value={it.unit_price}
                  onChange={(v) => onUpdate(i, { unit_price: v })}
                  disabled={disabled}
                />
              </div>
              <div className="mt-1 text-right font-mono text-xs uppercase tracking-[0.2em] text-ink-300">
                Line total: <span className="text-white">{formatCurrency(it.line_total, currency)}</span>
              </div>
              {(it.formula || libMaterial || hasT2QCALWorking(it)) && (
                <ShowWorking
                  formula={it.formula}
                  libraryName={libMaterial?.name ?? null}
                  unit={it.unit}
                  result={it.quantity}
                  nativeLine={it}
                />
              )}
            </li>
          );
          })}
        </ul>
      )}
    </section>
  );
}

function ShowWorking({
  formula,
  libraryName,
  unit,
  result,
  nativeLine,
}: {
  formula: string | null | undefined;
  libraryName: string | null;
  unit: string;
  result: number;
  nativeLine?: QuoteLineItem;
}) {
  const explained = explainFormula(formula);
  const hasMath = explained.length > 0;
  // Skip the entire toggle if we have neither a formula nor a library
  // match — the parent already gates on that, but it's defensive here.
  if (!hasMath && !libraryName && !hasT2QCALWorking(nativeLine)) return null;
  return (
    <details className="t2q-show-working mt-1.5 rounded-sm border border-ink-700 bg-ink-950/70 [&[open]>summary>span:last-child]:rotate-180">
      <summary
        data-testid="show-working-toggle"
        className="flex min-h-[44px] cursor-pointer select-none items-center justify-between gap-2 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-300 hover:text-white"
      >
        <span>{"// show working"}</span>
        <span aria-hidden="true" className="transition-transform">
          ▾
        </span>
      </summary>
      <div className="space-y-2 border-t border-ink-700 px-3 py-2.5 text-xs text-ink-200">
        {hasMath && (
          <div data-testid="working-formula">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-500">
              {"// quantity"}
            </div>
            <div className="mt-1 break-words text-sm leading-snug text-white">
              {explained}
            </div>
            <div className="mt-1 font-mono text-[10px] text-ink-400">
              = {result} {unit || ""}
            </div>
          </div>
        )}
        {nativeLine && <T2QCALWorking line={nativeLine} />}
        {libraryName && (
          <div data-testid="working-library">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-500">
              {"// price"}
            </div>
            <div className="mt-1 text-sm text-white">
              Matched to your library:{" "}
              <span className="text-brand">{libraryName}</span>
            </div>
          </div>
        )}
      </div>
    </details>
  );
}

function ConfidenceLegend({
  tally,
}: {
  tally: { high: number; medium: number; low: number };
}) {
  const total = tally.high + tally.medium + tally.low;
  if (total === 0) return null;
  return (
    <div
      data-testid="confidence-legend"
      className="mt-3 flex flex-wrap items-center gap-2 rounded-sm border border-ink-700 bg-ink-950 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em]"
    >
      <span className="text-ink-500">{"// confidence"}</span>
      <ConfidenceChip
        color="emerald"
        count={tally.high}
        label="From your library"
        testid="legend-high"
      />
      <ConfidenceChip
        color="hivis"
        count={tally.medium}
        label="T2Q estimate"
        testid="legend-medium"
      />
      <ConfidenceChip
        color="red"
        count={tally.low}
        label="Needs price"
        testid="legend-low"
      />
    </div>
  );
}

function ConfidenceChip({
  color,
  count,
  label,
  testid,
}: {
  color: "emerald" | "hivis" | "red";
  count: number;
  label: string;
  testid: string;
}) {
  const dimmed = count === 0;
  const swatch =
    color === "emerald"
      ? "bg-emerald-500/80"
      : color === "hivis"
        ? "bg-hivis/80"
        : "bg-red-500/80";
  const text = dimmed
    ? "text-ink-600"
    : color === "emerald"
      ? "text-emerald-300"
      : color === "hivis"
        ? "text-hivis"
        : "text-red-300";
  return (
    <span
      data-testid={testid}
      className={`inline-flex items-center gap-1.5 ${text}`}
    >
      <span
        aria-hidden="true"
        className={`inline-block h-2 w-2 rounded-full ${dimmed ? "bg-ink-700" : swatch}`}
      />
      {count} {label}
    </span>
  );
}

function ItemBadge({
  isCalculatedTakeoff,
  isLibrary,
  isAi,
  isMissingPrice,
  takeoffStatus,
  takeoffFlags,
  supplierUrl,
  supplierName,
}: {
  isCalculatedTakeoff: boolean;
  isLibrary: boolean;
  isAi: boolean;
  isMissingPrice: boolean;
  takeoffStatus?: "ok" | "assumed" | "needs_review" | "blocked";
  takeoffFlags?: string[];
  supplierUrl: string | null;
  supplierName: string | null;
}) {
  // Wave 44 — takeoff status badge takes priority for material lines.
  // "ok" maps to the existing "Calculated takeoff" badge to avoid
  // visual churn for working quotes. "assumed" / "needs_review" /
  // "blocked" surface as new badges so the tradie can see at a glance
  // which lines they should eyeball before sending.
  const flagsTitle =
    takeoffFlags && takeoffFlags.length > 0
      ? takeoffFlags.join(" · ")
      : undefined;
  if (!isCalculatedTakeoff && !isLibrary && !isAi && !isMissingPrice && !takeoffStatus) {
    return null;
  }
  return (
    <div className="mb-1.5 flex flex-wrap items-center gap-2">
      {isCalculatedTakeoff && (!takeoffStatus || takeoffStatus === "ok") && (
        <span
          data-testid="badge-calculated"
          className="inline-flex items-center gap-1 rounded-sm bg-blue-500/15 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-blue-300"
          title="Quantity computed by the takeoff calculator from your assumptions"
        >
          <Calculator size={10} weight="bold" />
          Calculated takeoff
        </span>
      )}
      {isCalculatedTakeoff && takeoffStatus === "assumed" && (
        <span
          data-testid="badge-assumed"
          className="inline-flex items-center gap-1 rounded-sm bg-blue-500/15 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-blue-200"
          title={flagsTitle ?? "Calculated with one or more defaults — confirm before sending"}
        >
          <Calculator size={10} weight="bold" />
          Assumed
        </span>
      )}
      {takeoffStatus === "needs_review" && (
        <span
          data-testid="badge-needs-review"
          className="inline-flex items-center gap-1 rounded-sm bg-hivis/15 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-hivis"
          title={flagsTitle ?? "Validator flagged this line — please review"}
        >
          Needs review
        </span>
      )}
      {takeoffStatus === "blocked" && (
        <span
          data-testid="badge-blocked"
          className="inline-flex items-center gap-1 rounded-sm border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-red-300"
          title={flagsTitle ?? "Calculator could not run — please clarify"}
        >
          Missing info
        </span>
      )}
      {!isCalculatedTakeoff && isLibrary && (
        <span
          data-testid="badge-library"
          className="inline-flex items-center gap-1 rounded-sm bg-brand/15 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-brand"
        >
          From your library
        </span>
      )}
      {!isCalculatedTakeoff && isAi && (
        <span
          data-testid="badge-ai"
          className="inline-flex items-center gap-1 rounded-sm bg-hivis/15 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-hivis"
          title="Price came from a T2Q estimate — confirm before sending"
        >
          <Sparkle size={10} weight="bold" />
          T2Q estimate
        </span>
      )}
      {isMissingPrice && (
        <span
          data-testid="badge-missing-price"
          className="inline-flex items-center gap-1 rounded-sm border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-red-300"
          title="No matching item in your materials library — set a unit price or add this material to your library"
        >
          Missing price
        </span>
      )}
      {isLibrary && supplierUrl && (
        <a
          href={supplierUrl}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="supplier-link"
          aria-label={
            supplierName
              ? `Open ${supplierName} product page`
              : "Open supplier page"
          }
          className="inline-flex items-center gap-1 rounded-sm border border-ink-700 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-400 hover:border-brand hover:text-brand"
          title={supplierName ?? "Supplier"}
        >
          <ArrowSquareOut size={10} weight="bold" />
          {supplierName ?? "Supplier"}
        </a>
      )}
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-500">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="mt-1 block w-full rounded-sm border border-ink-700 bg-ink-800 px-2 py-1.5 text-sm text-white outline-none focus:border-brand disabled:cursor-not-allowed disabled:opacity-60"
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-500">
        {label}
      </span>
      <input
        type="number"
        inputMode="decimal"
        step="0.01"
        min="0"
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => {
          const v = Number(e.target.value);
          onChange(Number.isFinite(v) ? v : 0);
        }}
        disabled={disabled}
        className="mt-1 block w-full rounded-sm border border-ink-700 bg-ink-800 px-2 py-1.5 text-sm tabular-nums text-white outline-none focus:border-brand disabled:cursor-not-allowed disabled:opacity-60"
      />
    </label>
  );
}

function TotalsRow({
  label,
  value,
  divider,
  emphasis,
  testId,
}: {
  label: string;
  value: string;
  divider?: boolean;
  emphasis?: boolean;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className={[
        "flex items-baseline justify-between gap-3",
        emphasis
          ? "mt-3 rounded-xl border border-brand/40 bg-brand/10 px-3.5 py-3"
          : divider
            ? "mt-2 border-t border-ink-700 pt-3 py-1.5"
            : "py-1.5",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span
        className={
          emphasis
            ? "min-w-0 truncate font-mono text-sm font-semibold uppercase tracking-[0.2em] text-white"
            : "min-w-0 truncate font-mono text-xs uppercase tracking-[0.2em] text-ink-300"
        }
      >
        {label}
      </span>
      <span
        className={
          emphasis
            ? "shrink-0 whitespace-nowrap font-semibold tabular-nums text-brand"
            : "shrink-0 whitespace-nowrap tabular-nums text-white"
        }
      >
        {value}
      </span>
    </div>
  );
}
