import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { createClient } from "@/lib/supabase/server";
import { BUSINESS_NAME_REQUIRED, businessNameForDocuments } from "@/lib/business-name";
import { BusinessSettingsLink } from "@/app/app/_components/BusinessSettingsLink";
import { isNewLookOn } from "@/lib/ui/newLook";
import { PdfNotReadyScreen, PdfViewerScreen } from "../_v2/parts/PdfScreen";

/**
 * /app/quotes/preview/[id]/pdf — in-app PDF viewer with a back button.
 *
 * Wave 36 — the raw PDF route at /api/quotes/[id]/pdf returns a binary
 * application/pdf response, which iOS Safari + Chrome render in their
 * native PDF viewers (no app chrome, no back nav). The trial user
 * reported "no back button to the tab" when opening the PDF on their
 * iPhone — they had to swipe-from-edge or rely on Safari's hidden
 * toolbar to get back. This wrapper page surrounds the same PDF
 * response in an HTML shell: a fixed top bar with "← Back to quote"
 * and an <iframe> pointing at the PDF endpoint. Auth is still gated
 * the same way (proxy.ts + this page's getUser()), and the underlying
 * binary route is untouched so the public quote view and email PDF
 * attachment paths keep working unchanged.
 *
 * Redesign: with the new-look switch on, the same gates end in the kit's
 * top bar and callouts (../_v2/parts/PdfScreen.tsx), readable in dark and
 * outdoor mode. Switched off, the markup below is unchanged.
 */
export const metadata: Metadata = {
  title: "Quote PDF",
};

type Params = { id: string };

export default async function QuotePdfPage({
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

  // Ownership + existence check — match the route handler's gating so
  // this wrapper never renders a PDF iframe for someone who can't see
  // the underlying response anyway. The iframe would then load a 404 /
  // 401 inside the frame, looking like a broken viewer.
  const { data: quote } = await supabase
    .from("quotes")
    .select("id, pdf_path")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!quote) redirect("/app/quotes");
  const { data: profile, error: profileError } = await supabase.from("profiles").select("business_name").eq("id", user.id).maybeSingle();
  if (profileError || !businessNameForDocuments(profile?.business_name)) {
    if (await isNewLookOn()) {
      return <PdfNotReadyScreen quoteId={id} problem={profileError ? "profile-error" : "no-business-name"} />;
    }
    return <main className="mx-auto max-w-xl space-y-5 p-6">
      <Link href={`/app/quotes/preview/${id}`} className="t2q-btn-back">Back to quote</Link>
      <h1 className="text-2xl font-semibold">Your quote PDF</h1>
      <p role="alert">{profileError ? "Could not load your business details. Please try again." : BUSINESS_NAME_REQUIRED.message}</p>
      {!profileError && <BusinessSettingsLink />}
    </main>;
  }
  if (!quote.pdf_path) redirect(`/app/quotes/preview/${id}`);

  if (await isNewLookOn()) return <PdfViewerScreen quoteId={id} />;

  return (
    <div className="fixed inset-0 flex flex-col bg-ink-950 text-white">
      <header className="flex items-center justify-between gap-3 border-b border-ink-700 bg-ink-950 px-3 py-3 pt-[max(env(safe-area-inset-top),12px)] sm:px-6">
        <Link
          href={`/app/quotes/preview/${id}`}
          data-testid="pdf-back"
          className="t2q-btn-back"
        >
          <ArrowLeft size={14} weight="bold" />
          Back to quote
        </Link>
        <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-ink-400">
          {"// pdf preview"}
        </span>
      </header>
      {/* Wrapper has overflow-auto so a PDF wider than the visible
          viewport (A4/Letter native size on mobile) can be swiped
          horizontally inside the iframe area instead of forcing
          page-level horizontal scroll — and so iOS pinch-to-zoom
          works without the wrapper page rearranging. */}
      <div className="flex-1 overflow-auto bg-white">
        <iframe
          data-testid="pdf-iframe"
          src={`/api/quotes/${id}/pdf`}
          title="Quote PDF"
          className="h-full w-full border-0 bg-white"
        />
      </div>
    </div>
  );
}
