"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, PencilSimple, Trash, FloppyDisk, X } from "@phosphor-icons/react";
import type { KitWithItems, KitItemInput, KitItemType } from "@/lib/kits";
import { saveKit, deleteKit } from "../actions";

type DraftItem = KitItemInput & { key: string };
type Draft = {
  id: string | null;
  name: string;
  trade: string;
  notes: string;
  items: DraftItem[];
};

const ITEM_TYPES: KitItemType[] = ["material", "labour", "other"];

let keySeed = 0;
function newKey(): string {
  keySeed += 1;
  return `it_${keySeed}`;
}

function emptyDraft(): Draft {
  return {
    id: null,
    name: "",
    trade: "",
    notes: "",
    items: [{ key: newKey(), type: "material", description: "", quantity: 1, unit: "", unit_price: 0 }],
  };
}

function toDraft(kit: KitWithItems): Draft {
  return {
    id: kit.id,
    name: kit.name,
    trade: kit.trade ?? "",
    notes: kit.notes ?? "",
    items: kit.items.map((i) => ({
      key: newKey(),
      type: i.type,
      description: i.description,
      quantity: i.quantity,
      unit: i.unit ?? "",
      unit_price: i.unit_price,
    })),
  };
}

function draftTotal(items: ReadonlyArray<{ quantity: number; unit_price: number }>): number {
  return items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0), 0);
}

export function KitsManager({ initialKits, currency }: { initialKits: KitWithItems[]; currency: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const money = (n: number) =>
    new Intl.NumberFormat("en-NZ", { style: "currency", currency: currency || "NZD" }).format(n);

  function updateItem(key: string, patch: Partial<DraftItem>) {
    setDraft((d) =>
      d ? { ...d, items: d.items.map((i) => (i.key === key ? { ...i, ...patch } : i)) } : d,
    );
  }
  function addItem() {
    setDraft((d) =>
      d
        ? { ...d, items: [...d.items, { key: newKey(), type: "material", description: "", quantity: 1, unit: "", unit_price: 0 }] }
        : d,
    );
  }
  function removeItem(key: string) {
    setDraft((d) => (d ? { ...d, items: d.items.filter((i) => i.key !== key) } : d));
  }

  function onSave() {
    if (!draft) return;
    setError(null);
    startTransition(async () => {
      const res = await saveKit({
        id: draft.id,
        name: draft.name,
        trade: draft.trade || null,
        notes: draft.notes || null,
        items: draft.items.map(({ key: _key, unit, ...rest }) => ({ ...rest, unit: unit || null })),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDraft(null);
      router.refresh();
    });
  }

  function onDelete(id: string) {
    if (!confirm("Delete this kit? This can't be undone.")) return;
    startTransition(async () => {
      await deleteKit(id);
      router.refresh();
    });
  }

  // ---- Editor view ----
  if (draft) {
    const total = draftTotal(draft.items);
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl uppercase tracking-tight">
            {draft.id ? "Edit kit" : "New kit"}
          </h2>
          <button
            type="button"
            onClick={() => setDraft(null)}
            className="t2q-btn-ghost-pro inline-flex items-center gap-1.5"
          >
            <X size={16} /> Cancel
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-400">Kit name</span>
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="e.g. Standard hot-water cylinder swap"
              className="w-full"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-400">Trade (optional)</span>
            <input
              value={draft.trade}
              onChange={(e) => setDraft({ ...draft, trade: e.target.value })}
              placeholder="Plumbing"
              className="w-full"
            />
          </label>
        </div>

        <div className="space-y-2">
          <span className="block text-xs font-medium text-ink-400">Line items</span>
          {draft.items.map((it) => (
            <div key={it.key} className="grid grid-cols-12 gap-2 rounded-lg border border-black/10 p-2">
              <select
                value={it.type}
                onChange={(e) => updateItem(it.key, { type: e.target.value as KitItemType })}
                className="col-span-4 sm:col-span-2"
              >
                {ITEM_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <input
                value={it.description}
                onChange={(e) => updateItem(it.key, { description: e.target.value })}
                placeholder="Description"
                className="col-span-8 sm:col-span-4"
              />
              <input
                type="number"
                inputMode="decimal"
                value={it.quantity}
                onChange={(e) => updateItem(it.key, { quantity: Number(e.target.value) })}
                placeholder="Qty"
                className="col-span-3 sm:col-span-2"
              />
              <input
                value={it.unit ?? ""}
                onChange={(e) => updateItem(it.key, { unit: e.target.value })}
                placeholder="unit"
                className="col-span-3 sm:col-span-2"
              />
              <input
                type="number"
                inputMode="decimal"
                value={it.unit_price}
                onChange={(e) => updateItem(it.key, { unit_price: Number(e.target.value) })}
                placeholder="Price"
                className="col-span-4 sm:col-span-1"
              />
              <button
                type="button"
                onClick={() => removeItem(it.key)}
                aria-label="Remove line"
                className="col-span-2 sm:col-span-1 inline-flex items-center justify-center rounded-md text-ink-400 hover:text-red-500"
              >
                <Trash size={16} />
              </button>
            </div>
          ))}
          <button type="button" onClick={addItem} className="t2q-btn-ghost-pro inline-flex items-center gap-1.5">
            <Plus size={16} /> Add line
          </button>
        </div>

        <div className="flex items-center justify-between border-t border-black/10 pt-3">
          <span className="text-sm text-ink-400">
            Kit total <span className="font-display text-base text-ink-900">{money(total)}</span>
          </span>
          <button
            type="button"
            onClick={onSave}
            disabled={pending}
            className="t2q-btn-primary-pro inline-flex items-center gap-1.5 disabled:opacity-60"
          >
            <FloppyDisk size={16} /> {pending ? "Saving…" : "Save kit"}
          </button>
        </div>
        {error ? <p className="text-sm text-red-500">{error}</p> : null}
      </div>
    );
  }

  // ---- List view ----
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-300">
          Save a job&apos;s worth of lines once, then drop them into a quote in one tap.
        </p>
        <button
          type="button"
          onClick={() => setDraft(emptyDraft())}
          className="t2q-btn-primary-pro inline-flex items-center gap-1.5"
        >
          <Plus size={16} /> New kit
        </button>
      </div>

      {initialKits.length === 0 ? (
        <div className="rounded-xl border border-dashed border-black/15 p-8 text-center">
          <p className="text-sm text-ink-400">No kits yet. Create your first standard job above.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {initialKits.map((kit) => (
            <li key={kit.id} className="t2q-card-pro flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="truncate font-display text-base tracking-tight">{kit.name}</p>
                <p className="text-xs text-ink-400">
                  {kit.items.length} line{kit.items.length === 1 ? "" : "s"}
                  {kit.trade ? ` · ${kit.trade}` : ""} ·{" "}
                  {money(draftTotal(kit.items))}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => setDraft(toDraft(kit))}
                  disabled={pending}
                  aria-label="Edit kit"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-400 hover:text-ink-900"
                >
                  <PencilSimple size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(kit.id)}
                  disabled={pending}
                  aria-label="Delete kit"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-400 hover:text-red-500"
                >
                  <Trash size={18} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
