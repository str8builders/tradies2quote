import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "../_components/AppHeader";
import { SupplierBrowser } from "./_components/SupplierBrowser";

export const metadata: Metadata = {
  title: "Suppliers",
};

export const dynamic = "force-dynamic";

/**
 * /app/suppliers — in-app supplier browser with AI material import.
 *
 * URL bar + iframe + floating "Add to Materials" button. The button
 * reads whatever URL is in the bar, calls /api/suppliers/extract to
 * pull a name+price out of the page HTML via Claude, and shows a
 * confirmation sheet that saves into the materials library.
 *
 * Many supplier sites block iframe embedding via X-Frame-Options /
 * frame-ancestors; the browser still works as a paste flow even when
 * the embed fails — the URL bar is the source of truth for the
 * extractor, not the iframe contents (which are cross-origin and
 * un-readable from the parent anyway).
 */
export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string }>;
}) {
  const sp = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const initialUrl =
    typeof sp.url === "string" && /^https?:\/\//i.test(sp.url) ? sp.url : "";

  return (
    <div className="min-h-screen text-white">
      <AppHeader context="Suppliers" />
      <div data-legacy-body="">
        <SupplierBrowser initialUrl={initialUrl} />
      </div>
    </div>
  );
}
