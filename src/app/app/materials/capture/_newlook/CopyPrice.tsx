"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle, FloppyDisk, Storefront } from "@phosphor-icons/react/dist/ssr";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button, ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { cx } from "@/components/ui/cx";
import { Money } from "@/components/ui/money";
import { SectionTitle } from "@/components/ui/section-title";
import { StatusPill } from "@/components/ui/status-pill";
import { TextField } from "@/components/ui/text-field";
import { PRICES_PATH } from "@/app/app/_v2/lib/app-nav";
import { TextAreaField } from "@/app/app/settings/_newlook/fields";
import {
  UNIT_SUGGESTIONS,
  useCaptureForm,
  type CaptureFormProps,
  type CaptureFormState,
} from "../_components/CaptureForm";
import { GstTick, SavePreview } from "./parts";

/**
 * "Copy a supplier's price" in the new look: the old capture form
 * (useCaptureForm) drawn with the kit. The product link, its supplier and
 * name, then the price as the website shows it. Nothing is saved until the
 * tradie checks it in a sheet, through the same createMaterial action and
 * field names, which go back to Prices.
 */
export function CopyPrice(props: CaptureFormProps) {
  const c = useCaptureForm(props);
  return <CopyPriceView c={c} isPasteFallback={props.isPasteFallback} />;
}

/** Any state of the form, drawn. A plain function of the state, so each one renders in tests. */
export function CopyPriceView({ c, isPasteFallback }: { c: CaptureFormState; isPasteFallback: boolean }) {
  return (
    <div className="space-y-6" data-testid="copy-price">
      {isPasteFallback ? (
        <div data-testid="capture-paste-hint">
          <Callout tone="info" title="Paste the product link">
            Copy the link on the supplier&apos;s product page and paste it below. If Tradies2Quote shows up when you
            tap Share on that page, pick it and the link fills in for you.
          </Callout>
        </div>
      ) : null}
      {/* While the check sheet is open, a failed save shows in it instead. */}
      {c.errorMessage && !c.confirming ? <SaveProblem message={c.errorMessage} /> : null}

      <ProductCard c={c} />
      <PriceCard c={c} />

      <section aria-label="Save the price" className="space-y-2" data-testid="capture-section-review">
        <Button
          fullWidth
          icon={<CheckCircle weight="bold" />}
          disabled={!c.canConfirm}
          onClick={() => c.setConfirming(true)}
          data-testid="capture-review"
        >
          Check and save
        </Button>
        <ButtonLink href={PRICES_PATH} variant="ghost" fullWidth data-testid="capture-cancel">
          Cancel
        </ButtonLink>
      </section>

      {c.confirming ? <CheckSheet c={c} /> : null}
    </div>
  );
}

/** The link, who sells it (read off the link until the tradie types their own) and its name. */
function ProductCard({ c }: { c: CaptureFormState }) {
  return (
    <Card
      as="section"
      padding="lg"
      className="space-y-6"
      aria-labelledby="capture-product-title"
      data-testid="capture-section-supplier"
    >
      <SectionTitle id="capture-product-title">The product</SectionTitle>
      <div className="space-y-3">
        <TextField
          label="Product link"
          type="url"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="https://www.mitre10.co.nz/shop/…"
          hint="From the supplier's product page."
          value={c.url}
          onChange={(event) => c.setUrl(event.target.value)}
          data-testid="capture-url"
        />
        {c.url.trim().length > 0 ? (
          <div data-testid="capture-supplier-badge">
            <StatusPill tone={c.isKnownSupplier ? "info" : "neutral"} icon={<Storefront weight="bold" />}>
              {c.supplierBadgeLabel}
            </StatusPill>
          </div>
        ) : null}
      </div>
      <TextField
        label="Supplier"
        autoComplete="off"
        placeholder="Mitre 10, Bunnings, ITM, PlaceMakers…"
        hint="Change it if we got the name wrong."
        value={c.supplier}
        onChange={(event) => {
          c.setSupplier(event.target.value);
          c.setSupplierEdited(true);
        }}
        data-testid="capture-supplier"
      />
      <TextField
        label="Product name"
        required
        placeholder="e.g. GIB Standard 10mm 2400x1200"
        value={c.name}
        onChange={(event) => c.setName(event.target.value)}
        data-testid="capture-name"
      />
    </Card>
  );
}

/** Unit and price as the website shows them, the GST tick, what gets saved, and private notes. */
function PriceCard({ c }: { c: CaptureFormState }) {
  return (
    <Card
      as="section"
      padding="lg"
      className="space-y-6"
      aria-labelledby="capture-price-title"
      data-testid="capture-section-price"
    >
      <SectionTitle id="capture-price-title">The price</SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Unit"
          required
          list="capture-unit-suggestions"
          autoComplete="off"
          hint="each, m, sheet…"
          value={c.unit}
          onChange={(event) => c.setUnit(event.target.value)}
          data-testid="capture-unit"
        />
        <TextField
          label="Price"
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          required
          prefix="$"
          placeholder="0.00"
          hint="As the website shows it"
          value={c.displayPrice}
          onChange={(event) => c.setDisplayPrice(event.target.value)}
          data-testid="capture-price"
        />
      </div>
      <datalist id="capture-unit-suggestions">
        {UNIT_SUGGESTIONS.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>
      <GstTick checked={c.incGst} onChange={c.setIncGst} testId="capture-inc-gst" />
      {/* Once there's a price to show: an empty box would read as $0.00. */}
      {c.displayPrice.trim() !== "" && c.finalPrice !== null ? (
        <SavePreview saved={c.finalPrice} shown={c.priceNum} includesGst={c.incGst} testId="capture-price-preview" />
      ) : null}
      <TextAreaField
        label="Notes"
        hint="Only you see these. Clients never do."
        rows={2}
        value={c.notes}
        onChange={(event) => c.setNotes(event.target.value)}
        data-testid="capture-notes"
      />
    </Card>
  );
}

/**
 * The last look before saving: the values as they'll be saved, then the old
 * look's hidden fields posted to createMaterial. Change something closes the
 * sheet with the typing kept.
 */
function CheckSheet({ c }: { c: CaptureFormState }) {
  const close = () => c.setConfirming(false);
  return (
    <BottomSheet
      open
      onClose={close}
      title="Save this price?"
      description="Nothing is saved until you add it."
      footer={
        <form action={c.formAction} className="grid gap-2">
          <input type="hidden" name="name" value={c.name.trim()} />
          <input type="hidden" name="unit" value={c.unit.trim()} />
          <input
            type="hidden"
            name="default_unit_price"
            value={c.finalPrice !== null ? String(c.finalPrice) : ""}
          />
          <input type="hidden" name="supplier" value={c.supplier.trim()} />
          <input type="hidden" name="supplier_url" value={c.url.trim()} />
          <input type="hidden" name="notes" value={c.notes.trim()} />
          <Button variant="secondary" fullWidth onClick={close} data-testid="capture-confirm-edit">
            Change something
          </Button>
          <SaveButton />
        </form>
      }
    >
      <div className="space-y-4" data-testid="capture-confirm-dialog">
        {c.errorMessage ? <SaveProblem message={c.errorMessage} /> : null}
        <dl className="divide-y divide-ui-line rounded-ui-md border border-ui-line">
          <Row label="Name" value={c.name.trim()} />
          <Row label="Unit" value={c.unit.trim()} />
          <Row
            label="Price without GST"
            value={c.finalPrice !== null ? <Money amount={c.finalPrice} /> : "—"}
          />
          {c.incGst && c.isValidPrice ? (
            <Row label="With GST" value={<Money amount={c.priceNum} />} muted />
          ) : null}
          {c.supplier.trim() ? <Row label="Supplier" value={c.supplier.trim()} /> : null}
          {c.url.trim() ? <Row label="Link" value={c.url.trim()} long /> : null}
          {c.notes.trim() ? <Row label="Notes" value={c.notes.trim()} muted /> : null}
        </dl>
      </div>
    </BottomSheet>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      fullWidth
      loading={pending}
      loadingLabel="Saving…"
      icon={<FloppyDisk weight="bold" />}
      data-testid="capture-confirm-save"
    >
      Add to your prices
    </Button>
  );
}

/** Why the save didn't work, read out as soon as it shows. */
function SaveProblem({ message }: { message: string }) {
  return (
    <div role="alert" data-testid="capture-error">
      <Callout tone="bad" title={message} />
    </div>
  );
}

function Row({
  label,
  value,
  muted = false,
  long = false,
}: {
  label: string;
  value: ReactNode;
  muted?: boolean;
  /** A link: breaks anywhere rather than running off the sheet. */
  long?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-3">
      <dt className="shrink-0 text-ui-sm text-ui-muted">{label}</dt>
      <dd
        className={cx(
          "min-w-0 text-right",
          muted ? "text-ui-muted" : "font-semibold text-ui-text",
          long && "break-all text-ui-sm",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
