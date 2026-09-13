import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";
import { isValidRequestSlug, requestLinkFor } from "@/lib/quote-requests/slug";
import { PrintButton } from "./PrintButton";

export const metadata: Metadata = { title: "Request-a-quote poster", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * A4/Letter print sheet for the tradie's request QR: business name, the code,
 * the short link in words, and what happens when someone scans it. Lives
 * outside the /app shell so nothing but the poster reaches the printer; the
 * page does its own sign-in check because the proxy only gates /app.
 */
export default async function RequestPosterPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=%2Fprint%2Frequest-poster");
  const { data: profile } = await supabase
    .from("profiles")
    .select("business_name, phone, request_slug, logo_url")
    .eq("id", user.id)
    .maybeSingle();
  const slug = profile?.request_slug ?? null;
  if (!slug || !isValidRequestSlug(slug)) redirect("/app/settings#request-link");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://tradies2quote.com";
  const link = requestLinkFor(appUrl, slug);
  const svg = await QRCode.toString(link, { type: "svg", errorCorrectionLevel: "H", margin: 1, width: 640, color: { dark: "#0A0A0A", light: "#FFFFFF" } });
  const business = profile?.business_name?.trim() || "Request a quote";
  const logo = profile?.logo_url && /^https:\/\//i.test(profile.logo_url) ? profile.logo_url : null;
  const shortLink = link.replace(/^https?:\/\//, "");
  return <div className="t2q-poster-page">
    <style>{`
      .t2q-poster-page{min-height:100dvh;background:#0d0e0e;color:#111;padding:24px 16px 48px;}
      .t2q-poster-tools{max-width:760px;margin:0 auto 20px;display:flex;flex-wrap:wrap;gap:10px;align-items:center;color:#b1b8ba;font-size:14px;}
      .t2q-poster{box-sizing:border-box;max-width:760px;margin:0 auto;background:#fff;border-radius:18px;padding:56px 52px;display:flex;flex-direction:column;align-items:center;text-align:center;box-shadow:0 30px 80px -30px rgba(0,0,0,.8);}
      .t2q-poster-logo{height:64px;width:auto;max-width:260px;object-fit:contain;margin-bottom:18px;}
      .t2q-poster-eyebrow{font:600 12px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.26em;text-transform:uppercase;color:#FF5F15;margin-bottom:14px;}
      .t2q-poster h1{font-family:var(--font-archivo-black),"Archivo Black","Arial Black",sans-serif;font-size:clamp(28px,5vw,44px);line-height:1.02;text-transform:uppercase;letter-spacing:-.02em;margin:0 0 8px;}
      .t2q-poster-business{font-size:20px;font-weight:600;color:#333;margin:0 0 28px;}
      .t2q-poster-qr{width:min(360px,70vw);aspect-ratio:1;padding:14px;border:4px solid #0A0A0A;border-radius:16px;background:#fff;}
      .t2q-poster-qr svg{width:100%;height:100%;display:block;}
      .t2q-poster-link{margin:22px 0 0;font:600 18px/1.3 ui-monospace,SFMono-Regular,Menlo,monospace;color:#0A0A0A;word-break:break-all;}
      .t2q-poster-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:30px 0 0;padding:0;list-style:none;width:100%;}
      .t2q-poster-steps li{border-top:3px solid #FFEA00;padding-top:10px;font-size:14px;line-height:1.4;color:#333;text-align:left;}
      .t2q-poster-steps b{display:block;font-size:22px;color:#FF5F15;font-family:var(--font-archivo-black),"Archivo Black",sans-serif;margin-bottom:4px;}
      .t2q-poster-foot{margin-top:30px;font-size:12px;color:#777;}
      .t2q-poster-foot strong{color:#111;}
      @media print{
        html,body{background:#fff!important;}
        .t2q-poster-page{background:#fff;padding:0;min-height:0;}
        .t2q-poster-tools,.studio-wallpaper,.studio-motion-control,[data-testid="cookie-consent"],[data-testid="site-live-wallpaper"]{display:none!important;}
        .t2q-poster{box-shadow:none;border-radius:0;max-width:none;padding:24px 8px;page-break-inside:avoid;}
        .t2q-poster-qr{width:110mm;}
        @page{margin:14mm;}
      }
    `}</style>
    <div className="t2q-poster-tools">
      <PrintButton />
      <a href="/api/account/request-qr?download=1&format=png&size=1024" className="t2q-btn-ghost-pro">Download PNG</a>
      <a href="/api/account/request-qr?download=1" className="t2q-btn-ghost-pro">Download SVG</a>
      <Link href="/app/settings" className="text-sm underline-offset-4 hover:underline">Back to settings</Link>
      <span className="ml-auto text-xs">Print at A4 or Letter. Save as PDF from the print dialog to email it.</span>
    </div>
    <article className="t2q-poster" data-testid="request-poster">
      {/* eslint-disable-next-line @next/next/no-img-element -- the tradie's own uploaded logo */}
      {logo ? <img src={logo} alt="" className="t2q-poster-logo" /> : null}
      <div className="t2q-poster-eyebrow">Scan for a quote</div>
      <h1>Need a price?<br />Scan. Describe. Done.</h1>
      <p className="t2q-poster-business">{business}{profile?.phone ? ` · ${profile.phone}` : ""}</p>
      <div className="t2q-poster-qr" aria-label="QR code for the request link" role="img" dangerouslySetInnerHTML={{ __html: svg }} />
      <p className="t2q-poster-link">{shortLink}</p>
      <ol className="t2q-poster-steps">
        <li><b>1</b>Point your phone camera at the code and tap the link.</li>
        <li><b>2</b>Tell us about the job in your own words. Add a couple of photos.</li>
        <li><b>3</b>We write it up and come back to you with a quote.</li>
      </ol>
      <p className="t2q-poster-foot">No app needed. Works on any phone. <strong>Powered by Tradies2Quote.</strong></p>
    </article>
  </div>;
}
