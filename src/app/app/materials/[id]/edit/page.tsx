import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isNewLookOn } from "@/lib/ui/newLook";
import { MaterialForm } from "../../_components/MaterialForm";
import { PriceFormScreen } from "../../_newlook/PriceFormScreen";

export const metadata: Metadata = {
  title: "Edit material",
};

type Params = { id: string };

export default async function EditMaterialPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: material, error } = await supabase
    .from("materials")
    .select(
      "id, name, unit, default_unit_price, supplier, supplier_url, notes",
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (error || !material) redirect("/app/materials");

  const initial = {
    id: material.id,
    name: material.name,
    unit: material.unit ?? "each",
    default_unit_price:
      material.default_unit_price !== null
        ? Number(material.default_unit_price)
        : null,
    supplier: material.supplier,
    supplier_url: material.supplier_url,
    notes: material.notes,
  };

  // Redesign: "Change price" in the new look. Off: unchanged below.
  if (await isNewLookOn()) return <PriceFormScreen mode="edit" initial={initial} />;

  return (
    <div className="min-h-screen text-white">
      <header className="border-b border-ink-700/60 bg-ink-950/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4 sm:px-6">
          <Link
            href="/app/materials"
            className="font-mono text-xs uppercase tracking-[0.2em] text-ink-300 hover:text-white"
          >
            ← Library
          </Link>
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-ink-400">
            Edit material
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="mb-8">
          <div className="t2q-section-label-pro mb-3">{"// edit"}</div>
          <h1 className="font-display text-3xl uppercase tracking-tight sm:text-4xl">
            Edit <span className="text-brand">material.</span>
          </h1>
        </div>

        <section className="t2q-card-pro p-5 sm:p-6">
          <MaterialForm mode="edit" initial={initial} />
        </section>
      </main>
    </div>
  );
}
