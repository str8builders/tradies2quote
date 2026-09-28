"use client";

import {
  ArrowSquareOut,
  ClipboardText,
  FloppyDisk,
  LinkSimple,
  PencilSimple,
  Plus,
} from "@phosphor-icons/react/dist/ssr";
import { BottomActionBar } from "@/components/ui/bottom-action-bar";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button, ButtonLink, buttonClasses } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionTitle } from "@/components/ui/section-title";
import { TextField } from "@/components/ui/text-field";
import { PRICES_PATH } from "@/app/app/_v2/lib/app-nav";
import { GstTick, SavePreview } from "@/app/app/materials/capture/_newlook/parts";
import {
  SUPPLIER_SHORTCUTS,
  useReviewDraft,
  useSupplierBrowser,
  type Phase,
  type SupplierBrowserState,
} from "../_components/SupplierBrowser";

/**
 * "Shop supplier websites" in the new look: the old supplier browser
 * (useSupplierBrowser) drawn with the kit. Open a supplier, bring a product
 * link back, and the name and price are read, checked and saved to Prices.
 */
export function SupplierShop({
  initialUrl,
  taxRate = 0.15,
  taxLabel = "GST",
}: {
  initialUrl: string;
  /** The tradie's own tax rate as a fraction (0.15 = 15%), never a fixed 15%. */
  taxRate?: number;
  /** "GST", "VAT", "Tax" — whatever the rest of the app calls it for this tradie's country. */
  taxLabel?: string;
}) {
  const b = useSupplierBrowser(initialUrl, taxRate);
  return <SupplierShopView b={b} taxRate={taxRate} taxLabel={taxLabel} />;
}

/** Any state of the supplier browser, drawn. A plain function of the state, so each one renders in tests. */
export function SupplierShopView({
  b,
  taxRate = 0.15,
  taxLabel = "GST",
}: {
  b: SupplierBrowserState;
  taxRate?: number;
  taxLabel?: string;
}) {
  const { phase } = b;
  return (
    <div className="space-y-6" data-testid="supplier-shop">
      <FindProduct />
      <BringLinkBack b={b} />
      <QueuedLink url={b.loadedUrl} supplier={b.detectedSupplier} />
      {phase.state === "review" ? <ReviewSheet b={b} phase={phase} taxRate={taxRate} taxLabel={taxLabel} /> : null}
      {phase.state === "manual" ? <ManualSheet sourceUrl={phase.sourceUrl} onClose={b.closeSheet} /> : null}
      <AddBar b={b} />
    </div>
  );
}

/**
 * The supplier websites. Each opens in the phone's browser: they all refuse
 * to be shown inside another site, so the link comes back by copy and paste.
 */
function FindProduct() {
  return (
    <section aria-labelledby="suppliers-find-title" className="space-y-3">
      <SectionTitle id="suppliers-find-title" description="Each one opens in your browser.">
        Find the product
      </SectionTitle>
      <ul className="grid grid-cols-2 gap-2">
        {SUPPLIER_SHORTCUTS.map((s, i) => (
          <li key={s.name} className={i === SUPPLIER_SHORTCUTS.length - 1 ? "col-span-2" : undefined}>
            <a
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              data-testid={`supplier-shortcut-${s.name.toLowerCase().replace(/\s+/g, "-")}`}
              className={buttonClasses({ variant: "secondary", fullWidth: true })}
            >
              {s.name}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Back from the browser with a copied link: paste it (the tap reads the clipboard), or type it. */
function BringLinkBack({ b }: { b: SupplierBrowserState }) {
  return (
    <Card as="section" padding="lg" className="space-y-5" aria-labelledby="suppliers-paste-title">
      <SectionTitle
        id="suppliers-paste-title"
        description="On the product page, tap Share, then Copy. Come back and paste it here."
      >
        Bring back its link
      </SectionTitle>
      <div className="space-y-2">
        <Button
          variant="secondary"
          fullWidth
          icon={<ClipboardText weight="bold" />}
          onClick={b.handlePasteUrl}
          data-testid="supplier-paste-clipboard"
        >
          Paste the link
        </Button>
        {b.pasteError ? (
          <p role="alert" data-testid="supplier-paste-error" className="text-ui-sm font-semibold text-ui-bad">
            {b.pasteError}
          </p>
        ) : null}
      </div>
      <form onSubmit={b.onSubmitUrl} className="flex items-end gap-2" data-testid="supplier-url-form">
        <TextField
          label="Or type it"
          type="url"
          inputMode="url"
          placeholder="https://www.mitre10.co.nz/shop/…"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={b.inputUrl}
          onChange={(event) => b.setInputUrl(event.target.value)}
          data-testid="supplier-url-input"
          className="min-w-0 flex-1"
        />
        <Button type="submit" variant="secondary" size="lg" data-testid="supplier-url-go">
          Go
        </Button>
      </form>
    </Card>
  );
}

/** The link the main button reads (the old look's "queued" card), with a way to open it and check. */
function QueuedLink({ url, supplier }: { url: string; supplier: string | null }) {
  if (!url) {
    return (
      <Card padding="none" data-testid="supplier-url-card">
        <div data-testid="supplier-empty">
          <EmptyState icon={<LinkSimple weight="duotone" />} title="No link yet">
            Paste a product link above, then tap Add to your prices.
          </EmptyState>
        </div>
      </Card>
    );
  }
  return (
    <Card
      as="section"
      padding="lg"
      className="space-y-4"
      aria-labelledby="suppliers-link-title"
      data-testid="supplier-url-card"
    >
      <SectionTitle id="suppliers-link-title" description={supplier ? `From ${supplier}` : undefined}>
        Ready to read
      </SectionTitle>
      <p className="break-all text-ui-sm text-ui-muted">{url}</p>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        data-testid="supplier-open-in-browser"
        className={buttonClasses({ variant: "secondary", fullWidth: true })}
      >
        <span>Open it to check</span>
        <ArrowSquareOut aria-hidden="true" weight="bold" className="shrink-0 text-[1.15em]" />
      </a>
    </Card>
  );
}

/**
 * The main button rides at the thumb: on a phone just above the bottom tab
 * bar (the mobile shell gives bars 5.3rem + the home-indicator inset, see
 * AppNav), from `sm` up on the bottom edge. What happened last shows in it,
 * where the old look's toasts were.
 */
function AddBar({ b }: { b: SupplierBrowserState }) {
  const { phase, closeSheet } = b;
  return (
    <div
      data-testid="supplier-actions"
      className="sticky bottom-[calc(5.3rem_+_env(safe-area-inset-bottom))] z-10 -mx-4 sm:bottom-0 sm:bg-ui-bg sm:pb-[env(safe-area-inset-bottom)]"
    >
      <BottomActionBar safeArea={false}>
        {phase.state === "saved" ? <Saved name={phase.name} onDismiss={closeSheet} /> : null}
        {phase.state === "error" ? <Problem message={phase.message} onDismiss={closeSheet} /> : null}
        <Button
          fullWidth
          icon={<Plus weight="bold" />}
          loading={phase.state === "extracting"}
          loadingLabel="Reading the product…"
          onClick={b.onAddToMaterials}
          data-testid="supplier-add-btn"
        >
          Add to your prices
        </Button>
      </BottomActionBar>
    </div>
  );
}

function Saved({ name, onDismiss }: { name: string; onDismiss: () => void }) {
  return (
    <div role="status" data-testid="supplier-saved-toast">
      <Callout
        tone="ok"
        title={`Saved. ${name} is in your prices.`}
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={PRICES_PATH} variant="secondary" size="sm">
              See your prices
            </ButtonLink>
            <Button variant="ghost" size="sm" onClick={onDismiss}>
              Dismiss
            </Button>
          </div>
        }
      />
    </div>
  );
}

function Problem({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div role="alert" data-testid="supplier-error-toast">
      <Callout
        tone="bad"
        title={message}
        action={
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            Dismiss
          </Button>
        }
      />
    </div>
  );
}

/**
 * Check what was read, then save it: the old sheet's boxes and GST tick
 * (useReviewDraft), so the same price is saved, without GST.
 */
function ReviewSheet({
  b,
  phase,
  taxRate,
  taxLabel,
}: {
  b: SupplierBrowserState;
  phase: Extract<Phase, { state: "review" }>;
  taxRate: number;
  taxLabel: string;
}) {
  const { name, setName, unit, setUnit, price, setPrice, priceNum, exGst, canSave } = useReviewDraft(phase, taxRate);
  const setGstInclusive = (gstInclusive: boolean) =>
    b.setPhase((p) => (p.state === "review" ? { ...p, gstInclusive } : p));
  return (
    <BottomSheet
      open
      onClose={b.closeSheet}
      title="Save this product?"
      description={b.detectedSupplier ?? undefined}
      footer={
        <div className="grid gap-2">
          <Button variant="secondary" fullWidth onClick={b.closeSheet}>
            Cancel
          </Button>
          <Button
            fullWidth
            icon={<FloppyDisk weight="bold" />}
            loading={phase.saving}
            loadingLabel="Saving…"
            disabled={!canSave}
            onClick={() =>
              void b.onSave({
                name: name.trim(),
                unit: unit.trim(),
                price: priceNum,
                gstInclusive: phase.gstInclusive,
              })
            }
            data-testid="supplier-review-save"
          >
            Save to your prices
          </Button>
        </div>
      }
    >
      <div className="space-y-5" data-testid="supplier-review-sheet">
        <TextField
          label="Product name"
          autoComplete="off"
          value={name}
          onChange={(event) => setName(event.target.value)}
          data-testid="supplier-review-name"
        />
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Unit"
            autoComplete="off"
            value={unit}
            onChange={(event) => setUnit(event.target.value)}
            data-testid="supplier-review-unit"
          />
          <TextField
            label="Price"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            prefix="$"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            data-testid="supplier-review-price"
          />
        </div>
        <GstTick checked={phase.gstInclusive} onChange={setGstInclusive} testId="supplier-review-gst" taxLabel={taxLabel} />
        {exGst !== null ? (
          <SavePreview
            saved={exGst}
            shown={priceNum}
            includesGst={phase.gstInclusive}
            testId="supplier-review-preview"
          />
        ) : null}
        {phase.saveError ? (
          <div role="alert" data-testid="supplier-review-error">
            <Callout tone="bad" title={phase.saveError} />
          </div>
        ) : null}
      </div>
    </BottomSheet>
  );
}

/** Nothing to read on that page (a category, blocked, or behind a login): type it in instead, link kept. */
function ManualSheet({ sourceUrl, onClose }: { sourceUrl: string; onClose: () => void }) {
  return (
    <BottomSheet
      open
      onClose={onClose}
      title="Couldn't read this page"
      footer={
        <div className="grid gap-2">
          <Button variant="secondary" fullWidth onClick={onClose}>
            Close
          </Button>
          <ButtonLink
            href={`/app/materials/capture?url=${encodeURIComponent(sourceUrl)}`}
            fullWidth
            icon={<PencilSimple weight="bold" />}
            data-testid="supplier-manual-link"
          >
            Type it in yourself
          </ButtonLink>
        </div>
      }
    >
      <p data-testid="supplier-manual-sheet" className="text-ui-base text-ui-muted">
        It might be a category page, blocked, or behind a login. Type the price in yourself: the link is filled in for
        you.
      </p>
    </BottomSheet>
  );
}
