import Link from "next/link";
import { ArrowRight, Printer, QrCode } from "@phosphor-icons/react/dist/ssr";

/**
 * The tradie's QR request code, right on the dashboard so nobody has to go
 * looking for it. On: the code, print/settings links. Off: one tap to set it up.
 */
export function RequestCodeCard({ slug }: { slug: string | null }) {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://tradies2quote.com").replace(/\/+$/, "");
  if (!slug) {
    return (
      <Link href="/app/settings#request-link" data-testid="dashboard-request-code-setup" className="t2q-card-pro t2q-card-pro-hover mb-7 flex items-center gap-4 p-4 sm:p-5">
        <span aria-hidden="true" className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-brand/30 bg-brand/10 text-brand"><QrCode size={24} weight="bold" /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-base uppercase tracking-tight text-white">Your QR request code</span>
          <span className="mt-0.5 block text-sm text-ink-300">Turn it on, print it for the van and site, and clients scan it to send you a job. Takes one tap.</span>
        </span>
        <ArrowRight size={18} weight="bold" className="shrink-0 text-brand" aria-hidden="true" />
      </Link>
    );
  }
  const link = `${appUrl}/r/${slug}`;
  return (
    <section data-testid="dashboard-request-code" aria-label="Your QR request code" className="t2q-card-pro mb-7 flex items-center gap-4 p-4 sm:p-5">
      {/* eslint-disable-next-line @next/next/no-img-element -- authenticated SVG route, no optimiser */}
      <img src={`/api/account/request-qr?v=${encodeURIComponent(slug)}`} alt="Your QR request code" width={88} height={88} className="h-22 w-22 shrink-0 rounded-md bg-white p-1" />
      <div className="min-w-0 flex-1">
        <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-brand">{"// clients scan to request a quote"}</div>
        <p className="mt-1 truncate font-mono text-sm text-hivis">{link.replace(/^https?:\/\//, "")}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Link href="/print/request-poster" className="t2q-btn-primary-pro inline-flex h-9 px-3 text-xs"><Printer size={14} weight="bold" />Print poster</Link>
          <Link href="/app/settings#request-link" className="t2q-btn-ghost-pro inline-flex h-9 px-3 text-xs">Downloads &amp; link</Link>
          <Link href="/app/requests" className="t2q-btn-ghost-pro inline-flex h-9 px-3 text-xs">Requests</Link>
        </div>
      </div>
    </section>
  );
}
