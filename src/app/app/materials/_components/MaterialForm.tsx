"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { FloppyDisk, Trash } from "@phosphor-icons/react/dist/ssr";
import {
  createMaterial,
  deleteMaterial,
  updateMaterial,
} from "../actions";
import { ACTION_INITIAL, type ActionResult } from "../_state";

type FormValues = {
  id?: string;
  name: string;
  unit: string;
  default_unit_price: number | null;
  supplier: string | null;
  supplier_url: string | null;
  notes: string | null;
};

type Props = {
  mode: "create" | "edit";
  initial?: FormValues;
};

export function MaterialForm({ mode, initial }: Props) {
  const action = mode === "create" ? createMaterial : updateMaterial;
  const [state, formAction] = useActionState<ActionResult, FormData>(
    action,
    ACTION_INITIAL,
  );
  const errorMessage = state && "error" in state ? state.error : null;

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-4">
        {mode === "edit" && initial?.id && (
          <input type="hidden" name="id" value={initial.id} />
        )}
        <Field label="Name" name="name" defaultValue={initial?.name ?? ""} required />
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Unit"
            name="unit"
            defaultValue={initial?.unit ?? "each"}
            placeholder="each, m, m², hour, sheet…"
            required
          />
          <Field
            label="Default price (ex GST)"
            name="default_unit_price"
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            defaultValue={
              initial?.default_unit_price !== null && initial?.default_unit_price !== undefined
                ? String(initial.default_unit_price)
                : ""
            }
            required
          />
        </div>
        <label className="-mt-1 flex min-h-11 cursor-pointer items-center gap-2 text-sm text-ink-200">
          <input
            type="checkbox"
            name="price_includes_gst"
            data-testid="material-price-includes-gst"
            className="h-4 w-4 accent-brand"
          />
          This price includes GST — save it ex-GST
        </label>
        <Field
          label="Supplier"
          name="supplier"
          defaultValue={initial?.supplier ?? ""}
          placeholder="Mitre 10, ITM, …"
        />
        <Field
          label="Supplier URL"
          name="supplier_url"
          type="url"
          defaultValue={initial?.supplier_url ?? ""}
          placeholder="https://…"
          help="Hidden from clients — for your reference only"
        />
        <label className="block">
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-ink-400">
            Notes
          </span>
          <textarea
            name="notes"
            defaultValue={initial?.notes ?? ""}
            rows={3}
            className="mt-2 block w-full resize-y rounded-sm border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-white placeholder:text-ink-500 outline-none focus:border-brand"
          />
        </label>

        {errorMessage && (
          <p
            data-testid="form-error"
            className="rounded-sm border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300"
          >
            {errorMessage}
          </p>
        )}

        <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/app/materials"
            className="font-mono text-xs uppercase tracking-[0.2em] text-ink-300 hover:text-white"
          >
            ← Back to library
          </Link>
          <SubmitButton mode={mode} />
        </div>
      </form>

      {mode === "edit" && initial?.id && <DeleteForm id={initial.id} />}
    </div>
  );
}

function SubmitButton({ mode }: { mode: "create" | "edit" }) {
  const { pending } = useFormStatus();
  const label = mode === "create" ? "Add to library" : "Save changes";
  return (
    <button
      type="submit"
      data-testid="material-submit"
      disabled={pending}
      className="t2q-btn-primary-pro disabled:cursor-not-allowed disabled:opacity-50"
    >
      <FloppyDisk size={18} weight="bold" />
      {pending ? "Saving…" : label}
    </button>
  );
}

function DeleteForm({ id }: { id: string }) {
  const [state, formAction] = useActionState<ActionResult, FormData>(
    deleteMaterial,
    ACTION_INITIAL,
  );
  const errorMessage = state && "error" in state ? state.error : null;
  return (
    <form action={formAction} className="border-t border-ink-700 pt-6">
      <input type="hidden" name="id" value={id} />
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-ink-400">
        {"// danger zone"}
      </p>
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-sm text-ink-300">
          Delete this material from your library.
        </p>
        <DeleteButton />
      </div>
      {errorMessage && (
        <p className="mt-3 text-sm text-red-300">{errorMessage}</p>
      )}
    </form>
  );
}

function DeleteButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      data-testid="material-delete"
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-sm border border-red-500/40 bg-red-500/10 px-3 py-2 font-mono text-xs uppercase tracking-[0.2em] text-red-300 transition-colors hover:border-red-500 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
      onClick={(e) => {
        if (!confirm("Delete this material from your library?")) {
          e.preventDefault();
        }
      }}
    >
      <Trash size={14} weight="bold" />
      {pending ? "Deleting…" : "Delete"}
    </button>
  );
}

function Field({
  label,
  name,
  type = "text",
  defaultValue,
  placeholder,
  required,
  inputMode,
  step,
  min,
  help,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  inputMode?: "decimal" | "numeric" | "text";
  step?: string;
  min?: string;
  help?: string;
}) {
  return (
    <label className="block">
      <span className="font-mono text-xs uppercase tracking-[0.2em] text-ink-400">
        {label}
        {required && <span className="ml-1 text-brand">*</span>}
      </span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        inputMode={inputMode}
        step={step}
        min={min}
        className="mt-2 block w-full rounded-sm border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-white placeholder:text-ink-500 outline-none focus:border-brand"
      />
      {help && (
        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-500">
          {`// ${help}`}
        </p>
      )}
    </label>
  );
}
