import type { Metadata } from "next";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";
import { isValidRequestSlug, requestLinkFor } from "@/lib/quote-requests/slug";
import { PrintButton } from "./PrintButton";

export const metadata: Metadata = { title: "Request-a-quote poster", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * A4/Letter print sheet for the tradie's request QR: their logo and business
 * name on a dark band, the code (with the logo in its centre) on a white
 * card, the link in words and what happens when someone scans it. Lives
 * outside the /app shell so nothing but the poster reaches the printer; the
 * page does its own sign-in check because the proxy only gates /app. The
 * actions sit in a bar pinned to the bottom of the screen, so they are in
 * reach on a phone whatever the poster's height.
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
  const logo = profile?.logo_url && /^https:\/\//i.test(profile.logo_url) ? profile.logo_url : null;
  const svg = await QRCode.toString(link, { type: "svg", errorCorrectionLevel: "H", margin: 1, width: 640, color: { dark: "#0A0A0A", light: "#FFFFFF" } });
  const business = profile?.business_name?.trim() || "Request a quote";
  const shortLink = link.replace(/^https?:\/\//, "");
  return <div className="t2q-poster-page">
    <style>{`
      .t2q-poster-page{min-height:100dvh;background:#0d0e0e;color:#111;padding:calc(env(safe-area-inset-top,0px) + 16px) 14px calc(env(safe-area-inset-bottom,0px) + 96px);}
      .t2q-poster-top{max-width:760px;margin:0 auto 14px;display:flex;align-items:center;justify-content:space-between;gap:10px;color:#b1b8ba;font-size:13px;}
      .t2q-poster-top a{color:#f4f3ef;text-decoration:none;display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:0 12px;border:1px solid #ffffff22;border-radius:10px;background:#1c2021;}
      .t2q-poster{box-sizing:border-box;max-width:760px;margin:0 auto;background:#fff;border-radius:22px;overflow:hidden;box-shadow:0 30px 80px -30px rgba(0,0,0,.8);}
      .t2q-poster-band{background:linear-gradient(135deg,#141718,#1c2021 60%,#2a1a10);color:#fff;padding:28px 28px 24px;display:flex;align-items:center;gap:18px;}
      .t2q-poster-logo{height:64px;width:auto;max-width:200px;object-fit:contain;background:#fff;border-radius:12px;padding:8px;flex:none;}
      .t2q-poster-band-text{min-width:0;}
      .t2q-poster-eyebrow{font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.26em;text-transform:uppercase;color:#ffa06d;margin-bottom:8px;}
      .t2q-poster-business{font:700 24px/1.15 system-ui,-apple-system,sans-serif;letter-spacing:-.02em;margin:0;overflow-wrap:anywhere;}
      .t2q-poster-phone{margin:4px 0 0;font-size:15px;color:#b1b8ba;}
      .t2q-poster-body{padding:32px 28px 28px;display:flex;flex-direction:column;align-items:center;text-align:center;}
      .t2q-poster h1{font-family:var(--font-archivo-black),"Archivo Black","Arial Black",sans-serif;font-size:clamp(26px,5vw,42px);line-height:1.02;text-transform:uppercase;letter-spacing:-.02em;margin:0 0 22px;color:#0A0A0A;}
      .t2q-poster h1 em{font-style:normal;color:#FF5F15;}
      .t2q-poster-qr{position:relative;width:min(340px,72vw);aspect-ratio:1;padding:14px;border:4px solid #0A0A0A;border-radius:18px;background:#fff;}
      .t2q-poster-qr svg{width:100%;height:100%;display:block;}
      .t2q-poster-qr-logo{position:absolute;left:50%;top:50%;width:23%;aspect-ratio:1;transform:translate(-50%,-50%);background:#fff;border-radius:16%;padding:2.5%;box-sizing:border-box;display:flex;align-items:center;justify-content:center;}
      .t2q-poster-qr-logo img{max-width:100%;max-height:100%;object-fit:contain;}
      .t2q-poster-link{margin:20px 0 0;font:600 17px/1.3 ui-monospace,SFMono-Regular,Menlo,monospace;color:#0A0A0A;word-break:break-all;}
      .t2q-poster-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:28px 0 0;padding:0;list-style:none;width:100%;}
      .t2q-poster-steps li{border-top:3px solid #FFEA00;padding-top:10px;font-size:13.5px;line-height:1.4;color:#333;text-align:left;}
      .t2q-poster-steps b{display:block;font-size:22px;color:#FF5F15;font-family:var(--font-archivo-black),"Archivo Black",sans-serif;margin-bottom:4px;}
      .t2q-poster-foot{margin-top:26px;font-size:12px;color:#777;}
      .t2q-poster-foot strong{color:#111;}
      .t2q-poster-hint{max-width:760px;margin:12px auto 0;font-size:13px;color:#b1b8ba;}
      .t2q-poster-hint a{color:#ffa06d;}
      .t2q-poster-actions{position:fixed;left:0;right:0;bottom:0;z-index:50;display:flex;flex-wrap:wrap;justify-content:center;gap:8px;padding:10px 12px calc(env(safe-area-inset-bottom,0px) + 10px);background:rgba(13,15,16,.94);border-top:1px solid #ffffff14;backdrop-filter:blur(14px);}
      .t2q-poster-actions a,.t2q-poster-actions button{min-height:44px;}
      @media(max-width:520px){.t2q-poster-band{padding:20px 18px;}.t2q-poster-body{padding:24px 16px 22px;}.t2q-poster-steps{grid-template-columns:1fr;gap:10px;}.t2q-poster-logo{height:52px;}}
      @media print{
        html,body{background:#fff!important;}
        .t2q-poster-page{background:#fff;padding:0;min-height:0;}
        .t2q-poster-top,.t2q-poster-actions,.t2q-poster-hint,.studio-wallpaper,.studio-motion-toggle,[data-testid="cookie-consent"],[data-testid="site-live-wallpaper"]{display:none!important;}
        .t2q-poster{box-shadow:none;border-radius:0;max-width:none;page-break-inside:avoid;}
        .t2q-poster-band{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
        .t2q-poster-qr{width:105mm;}
        .t2q-poster-steps{grid-template-columns:repeat(3,1fr);}
        @page{margin:12mm;}
      }
    `}</style>
    <div className="t2q-poster-top">
      <a href="/app/settings#request-link" data-testid="poster-back">‹ Settings</a>
      <span>Print at A4 or Letter · Save as PDF from the print dialog to email it</span>
    </div>
    <article className="t2q-poster" data-testid="request-poster">
      <header className="t2q-poster-band">
        {/* eslint-disable-next-line @next/next/no-img-element -- the tradie's own uploaded logo */}
        {logo ? <img src={logo} alt="" className="t2q-poster-logo" /> : null}
        <div className="t2q-poster-band-text">
          <div className="t2q-poster-eyebrow">Scan for a quote</div>
          <p className="t2q-poster-business">{business}</p>
          {profile?.phone ? <p className="t2q-poster-phone">{profile.phone}</p> : null}
        </div>
      </header>
      <div className="t2q-poster-body">
        <h1>Need a price?<br /><em>Scan. Describe. Done.</em></h1>
        <div className="t2q-poster-qr" aria-label="QR code for the request link" role="img">
          <div dangerouslySetInnerHTML={{ __html: svg }} />
          {/* eslint-disable-next-line @next/next/no-img-element -- the tradie's own uploaded logo */}
          {logo ? <span className="t2q-poster-qr-logo" aria-hidden="true"><img src={logo} alt="" /></span> : null}
        </div>
        <p className="t2q-poster-link">{shortLink}</p>
        <ol className="t2q-poster-steps">
          <li><b>1</b>Point your phone camera at the code and tap the link.</li>
          <li><b>2</b>Tell us about the job in your own words. Add a couple of photos.</li>
          <li><b>3</b>We write it up and come back to you with a quote.</li>
        </ol>
        <p className="t2q-poster-foot">No app needed. Works on any phone. <strong>Powered by Tradies2Quote.</strong></p>
      </div>
    </article>
    {!logo ? <p className="t2q-poster-hint">Add your business logo in <a href="/app/settings#business">Business settings</a> and it appears on the band and in the middle of the code.</p> : null}
    <div className="t2q-poster-actions" data-testid="poster-actions">
      <PrintButton />
      <a href={`/api/account/request-qr?download=1&format=png&size=1024${logo ? "&logo=1" : ""}`} className="t2q-btn-ghost-pro">Download PNG</a>
      <a href="/api/account/request-qr?download=1" className="t2q-btn-ghost-pro">Download SVG</a>
    </div>
  </div>;
}
