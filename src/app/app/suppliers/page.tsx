import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isNewLookOn } from "@/lib/ui/newLook";
import { resolveTaxLabel, resolveTaxRate } from "@/lib/quote-defaults";
import { AppHeader } from "../_components/AppHeader";
import { SupplierBrowser } from "./_components/SupplierBrowser";
import { SuppliersScreen } from "./_newlook/SuppliersScreen";

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

  // The tradie's own tax rate and label by country (UK: VAT 20 %, never NZ's
  // "GST" 15 % for everyone) — the same rule capture/import already follow.
  const { data: profile } = await supabase
    .from("profiles")
    .select("tax_rate, tax_label, country, currency")
    .eq("id", user.id)
    .maybeSingle();
  const taxRate = resolveTaxRate(profile?.tax_rate, profile?.country, profile?.currency) / 100;
  const taxLabel = resolveTaxLabel(profile?.tax_label, profile?.country, profile?.currency);

  // Redesign: the new look is "Shop supplier websites", back to Prices, with
  // the same link. Off: unchanged below.
  if (await isNewLookOn()) {
    return <SuppliersScreen initialUrl={initialUrl} taxRate={taxRate} taxLabel={taxLabel} />;
  }

  return (
    <div className="min-h-screen text-white">
      <AppHeader context="Suppliers" />
      <div data-legacy-body="">
        <SupplierBrowser initialUrl={initialUrl} taxRate={taxRate} taxLabel={taxLabel} />
      </div>
    </div>
  );
}
