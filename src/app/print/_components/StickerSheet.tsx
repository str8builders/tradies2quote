import type { RequestPrint } from "../_lib/request-print";
import { STICKER_SIZES, stickerCount, stickerHref, type StickerSize } from "../_lib/sticker";
import { QR_CODE_PATH } from "@/app/app/_v2/lib/app-nav";
import { PrintButton } from "../request-poster/PrintButton";

function Sticker({ data }: { data: RequestPrint }) {
  return (
    <div className="t2q-sticker" data-testid="request-sticker">
      <p className="t2q-sticker-band">Scan for a quote</p>
      <div className="t2q-sticker-qr" role="img" aria-label="QR code for your request link">
        <div dangerouslySetInnerHTML={{ __html: data.svg }} />
        {data.logo ? (
          <span className="t2q-sticker-qr-logo" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element -- the tradie's own uploaded logo */}
            <img src={data.logo} alt="" />
          </span>
        ) : null}
      </div>
      <p className="t2q-sticker-business">{data.business}</p>
      {data.phone ? <p className="t2q-sticker-phone">{data.phone}</p> : null}
      <p className="t2q-sticker-foot">Point your phone camera at the code. No app needed.</p>
    </div>
  );
}

/**
 * Stickers of the tradie's request QR for the van, the car or the toolbox:
 * one big sticker, or four small ones, on an A4 or Letter sheet at real
 * size (millimetres in print, so 100% scale prints them true). Each has a
 * dashed cut line. Orange band, black code on white, the business name and
 * phone. Beside the poster, outside the /app shell, with its own sign-in
 * check (see loadRequestPrint). The how-to (vinyl paper, where to stick it,
 * test it) is on Your QR code. The page (/print/request-sticker) loads the
 * data; the local preview page renders this with made-up data.
 */
export function StickerSheet({ data, size }: { data: RequestPrint; size: StickerSize }) {
  const count = stickerCount(size);
  return (
    <div className="t2q-sticker-page" data-size={size}>
      <style>{`
        .t2q-sticker-page{min-height:100dvh;background:#0d0e0e;color:#f4f3ef;padding:calc(env(safe-area-inset-top,0px) + 16px) 14px calc(env(safe-area-inset-bottom,0px) + 110px);font-family:var(--font-ibm-plex-sans),"IBM Plex Sans",system-ui,-apple-system,sans-serif;}
        .t2q-sticker-top{max-width:760px;margin:0 auto 14px;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;font-size:13px;color:#b1b8ba;}
        .t2q-sticker-top a{color:#f4f3ef;text-decoration:none;display:inline-flex;align-items:center;min-height:44px;padding:0 14px;border:1px solid #ffffff22;border-radius:12px;background:#1c2021;}
        .t2q-sticker-sizes{max-width:760px;margin:0 auto 14px;display:grid;grid-template-columns:1fr 1fr;gap:8px;}
        .t2q-sticker-sizes a{display:block;min-height:44px;padding:10px 12px;border:1px solid #ffffff22;border-radius:12px;background:#1c2021;color:#f4f3ef;text-decoration:none;}
        .t2q-sticker-sizes a[aria-current="true"]{border:2px solid #FF5F15;background:#3A1D0E;}
        .t2q-sticker-sizes b{display:block;font-size:15px;}
        .t2q-sticker-sizes span{display:block;margin-top:2px;font-size:13px;line-height:1.35;color:#BDBBB3;}
        .t2q-sticker-sheet{box-sizing:border-box;max-width:760px;margin:0 auto;background:#fff;border-radius:18px;padding:22px;display:grid;justify-content:center;gap:22px;}
        .t2q-sticker-page[data-size="small"] .t2q-sticker-sheet{grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;padding:14px;}
        /* Sizes in em: one unit scales the sticker on screen, millimetres set it in print. */
        .t2q-sticker{box-sizing:border-box;width:30em;max-width:100%;font-size:min(calc((100vw - 76px) / 30),15px);margin:0 auto;border:0.25em solid #0A0A0A;border-radius:1.2em;background:#fff;color:#0A0A0A;display:flex;flex-direction:column;align-items:center;text-align:center;overflow:hidden;outline:1px dashed #9a9891;outline-offset:0.7em;}
        .t2q-sticker-page[data-size="small"] .t2q-sticker{font-size:min(calc((100vw - 100px) / 60),9px);}
        .t2q-sticker-band{margin:0;align-self:stretch;background:#FF5F15;color:#121211;padding:0.55em 0.6em 0.5em;font-family:var(--font-archivo-black),"Archivo Black","Arial Black",sans-serif;font-size:2.1em;line-height:1.05;text-transform:uppercase;letter-spacing:-0.01em;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
        .t2q-sticker-qr{position:relative;width:22em;aspect-ratio:1;margin:1.1em 0 0.6em;}
        .t2q-sticker-qr svg{display:block;width:100%;height:100%;}
        .t2q-sticker-qr-logo{position:absolute;left:50%;top:50%;width:23%;aspect-ratio:1;transform:translate(-50%,-50%);background:#fff;border-radius:16%;padding:2.5%;box-sizing:border-box;display:flex;align-items:center;justify-content:center;}
        .t2q-sticker-qr-logo img{max-width:100%;max-height:100%;object-fit:contain;}
        .t2q-sticker-business{margin:0 1em;font-weight:700;font-size:1.55em;line-height:1.15;overflow-wrap:anywhere;}
        .t2q-sticker-phone{margin:0.2em 1em 0;font-weight:600;font-size:1.3em;}
        .t2q-sticker-foot{margin:0.6em 1em 1em;font-size:0.95em;line-height:1.3;color:#333;}
        .t2q-sticker-hint{max-width:760px;margin:12px auto 0;font-size:13px;line-height:1.45;color:#b1b8ba;}
        .t2q-sticker-actions{position:fixed;left:0;right:0;bottom:0;z-index:50;display:flex;flex-wrap:wrap;justify-content:center;gap:8px;padding:10px 12px calc(env(safe-area-inset-bottom,0px) + 10px);background:rgba(13,15,16,.94);border-top:1px solid #ffffff14;backdrop-filter:blur(14px);}
        .t2q-sticker-actions button{min-height:44px;}
        .t2q-sticker-inapp{margin:0;max-width:560px;text-align:center;font-size:14px;line-height:1.4;}
        @media print{
          /* The app is dark: a light scheme so the page margins print white, not dark. */
          html,body{background:#fff!important;color-scheme:light!important;}
          .t2q-sticker-page{background:#fff;padding:0;min-height:0;}
          .t2q-sticker-top,.t2q-sticker-sizes,.t2q-sticker-hint,.t2q-sticker-actions,.studio-wallpaper,.studio-motion-toggle,[data-testid="cookie-consent"],[data-testid="site-live-wallpaper"]{display:none!important;}
          /* Padding keeps the cut line (3.3 mm outside each sticker) on the paper. */
          .t2q-sticker-sheet{max-width:none;border-radius:0;padding:4mm;gap:10mm;}
          .t2q-sticker-page[data-size="small"] .t2q-sticker-sheet{gap:9mm 8mm;padding:4mm;}
          .t2q-sticker{font-size:5mm;break-inside:avoid;outline:0.3mm dashed #9a9891;outline-offset:3mm;}
          .t2q-sticker-page[data-size="small"] .t2q-sticker{font-size:2.8mm;}
          @page{margin:12mm;}
        }
      `}</style>
      <div className="t2q-sticker-top">
        <a href={QR_CODE_PATH} data-testid="sticker-back">
          ‹ Your QR code
        </a>
        <span>Print at 100% (not &ldquo;fit to page&rdquo;), on A4 or Letter</span>
      </div>
      <nav className="t2q-sticker-sizes" aria-label="Sticker size">
        {STICKER_SIZES.map((option) => (
          <a
            key={option.id}
            href={stickerHref(option.id)}
            aria-current={option.id === size ? "true" : undefined}
            data-testid={`sticker-size-${option.id}`}
          >
            <b>{option.label}</b>
            <span>{option.hint}</span>
          </a>
        ))}
      </nav>
      <div className="t2q-sticker-sheet" data-testid="sticker-sheet">
        {Array.from({ length: count }, (_, i) => (
          <Sticker key={i} data={data} />
        ))}
      </div>
      <p className="t2q-sticker-hint">
        Print on outdoor vinyl sticker paper, cut along the dashed line and cover it with clear laminate so the rain
        doesn&apos;t fade it. Stick it on the outside of the glass: tint makes a code hard to scan.
      </p>
      <div className="t2q-sticker-actions" data-testid="sticker-actions">
        {data.inApp ? (
          <p className="t2q-sticker-inapp" data-testid="sticker-in-app">
            To print them, sign in at tradies2quote.com on a computer or in your phone&apos;s browser and open Your QR code.
          </p>
        ) : (
          <PrintButton label={count > 1 ? "Print stickers" : "Print sticker"} />
        )}
      </div>
    </div>
  );
}
