"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { FloppyDisk, Trash } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/section-title";
import { TextField } from "@/components/ui/text-field";
import { Toggle } from "@/components/ui/toggle";
import { TextAreaField } from "../../settings/_newlook/fields";
import { createMaterial, deleteMaterial, updateMaterial } from "../actions";
import { ACTION_INITIAL, type ActionResult } from "../_state";

/** A saved price as the edit page loads it (the old form's values). */
export interface PriceFormValues {
  id?: string;
  name: string;
  unit: string;
  default_unit_price: number | null;
  supplier: string | null;
  supplier_url: string | null;
  notes: string | null;
}

export type PriceFormMode = "create" | "edit";

/**
 * Add or change one saved price, in the new look. The same server actions
 * and field names as the old <MaterialForm> (createMaterial, updateMaterial,
 * deleteMaterial), and the same browser checks on each box, so saving works
 * exactly as before; on success the action goes back to Prices.
 */
export function PriceForm({ mode, initial }: { mode: PriceFormMode; initial?: PriceFormValues }) {
  const action = mode === "create" ? createMaterial : updateMaterial;
  const [state, formAction] = useActionState<ActionResult, FormData>(action, ACTION_INITIAL);
  const errorMessage = state && "error" in state ? state.error : null;

  const [name, setName] = useState(initial?.name ?? "");
  const [unit, setUnit] = useState(initial?.unit ?? "each");
  const [price, setPrice] = useState(
    initial?.default_unit_price !== null && initial?.default_unit_price !== undefined
      ? String(initial.default_unit_price)
      : "",
  );
  const [includesGst, setIncludesGst] = useState(false);
  const [supplier, setSupplier] = useState(initial?.supplier ?? "");
  const [supplierUrl, setSupplierUrl] = useState(initial?.supplier_url ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-6" data-testid="price-form">
        {mode === "edit" && initial?.id ? <input type="hidden" name="id" value={initial.id} /> : null}

        <Card as="section" padding="lg" className="space-y-6" aria-labelledby="price-item-title">
          <SectionTitle id="price-item-title">The item</SectionTitle>
          <TextField
            label="Name"
            name="name"
            required
            autoComplete="off"
            placeholder="e.g. GIB Standard 10mm 1200x2400"
            value={name}
            onChange={(event) => setName(event.target.value)}
            data-testid="price-name"
          />
          <div className="grid grid-cols-2 gap-3">
            <TextField
              label="Unit"
              name="unit"
              required
              autoComplete="off"
              hint="each, m, m², hour, sheet"
              value={unit}
              onChange={(event) => setUnit(event.target.value)}
              data-testid="price-unit"
            />
            <TextField
              label="Price (ex GST)"
              name="default_unit_price"
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              required
              hint="For one unit"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              data-testid="price-amount"
            />
          </div>
          <Toggle
            name="price_includes_gst"
            checked={includesGst}
            onChange={setIncludesGst}
            label="This price includes GST"
            description="We'll take the GST off before we save it."
          />
        </Card>

        <Card as="section" padding="lg" className="space-y-6" aria-labelledby="price-more-title">
          <SectionTitle id="price-more-title" description="All optional.">
            More details
          </SectionTitle>
          <TextField
            label="Supplier"
            name="supplier"
            autoComplete="off"
            placeholder="Mitre 10, ITM…"
            value={supplier}
            onChange={(event) => setSupplier(event.target.value)}
          />
          <TextField
            label="Supplier website"
            name="supplier_url"
            type="url"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="https://…"
            hint="Only you see this. Clients never do."
            value={supplierUrl}
            onChange={(event) => setSupplierUrl(event.target.value)}
          />
          <TextAreaField
            label="Notes"
            name="notes"
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </Card>

        {errorMessage ? (
          <div role="alert" data-testid="form-error">
            <Callout tone="bad" title={errorMessage} />
          </div>
        ) : null}

        <SubmitButton mode={mode} />
      </form>

      {mode === "edit" && initial?.id ? <DeletePrice id={initial.id} /> : null}
    </div>
  );
}

function SubmitButton({ mode }: { mode: PriceFormMode }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      fullWidth
      loading={pending}
      loadingLabel="Saving…"
      icon={<FloppyDisk weight="bold" />}
      data-testid="material-submit"
    >
      {mode === "create" ? "Add to your prices" : "Save changes"}
    </Button>
  );
}

/** Delete, with a second tap to confirm (the old page asked with a browser pop-up). */
function DeletePrice({ id }: { id: string }) {
  const [state, formAction] = useActionState<ActionResult, FormData>(deleteMaterial, ACTION_INITIAL);
  const errorMessage = state && "error" in state ? state.error : null;
  const [confirming, setConfirming] = useState(false);

  return (
    <Card as="section" padding="lg" className="space-y-4" aria-labelledby="price-delete-title">
      <SectionTitle id="price-delete-title" description="Takes it off your list of prices.">
        Delete this price
      </SectionTitle>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="id" value={id} />
        {confirming ? (
          <Callout tone="bad" title="Delete this price?" action={<DeleteChoices onKeep={() => setConfirming(false)} />} />
        ) : (
          <Button
            variant="danger"
            fullWidth
            icon={<Trash weight="bold" />}
            onClick={() => setConfirming(true)}
            data-testid="material-delete-open"
          >
            Delete this price
          </Button>
        )}
        {errorMessage ? (
          <p role="alert" className="text-ui-sm font-semibold text-ui-bad">
            {errorMessage}
          </p>
        ) : null}
      </form>
    </Card>
  );
}

function DeleteChoices({ onKeep }: { onKeep: () => void }) {
  const { pending } = useFormStatus();
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Button
        type="submit"
        variant="danger"
        fullWidth
        loading={pending}
        loadingLabel="Deleting…"
        icon={<Trash weight="bold" />}
        data-testid="material-delete"
      >
        Yes, delete it
      </Button>
      <Button variant="secondary" fullWidth disabled={pending} onClick={onKeep}>
        Keep it
      </Button>
    </div>
  );
}
