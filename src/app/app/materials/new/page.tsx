import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isNewLookOn } from "@/lib/ui/newLook";
import { MaterialForm } from "../_components/MaterialForm";
import { PriceFormScreen } from "../_newlook/PriceFormScreen";

export const metadata: Metadata = {
  title: "Add material",
};

export default async function NewMaterialPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Redesign: "Add a price" in the new look. Off: unchanged below.
  if (await isNewLookOn()) return <PriceFormScreen mode="create" />;

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
            New material
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="mb-8">
          <div className="t2q-section-label-pro mb-3">{"// add to library"}</div>
          <h1 className="font-display text-3xl uppercase tracking-tight sm:text-4xl">
            New <span className="text-brand">material.</span>
          </h1>
          <p className="mt-3 text-sm text-ink-300 sm:text-base">
            Save once, reuse on every quote. Confirmed prices replace T2Q estimates.
          </p>
        </div>

        <section className="t2q-card-pro p-5 sm:p-6">
          <MaterialForm mode="create" />
        </section>
      </main>
    </div>
  );
}
