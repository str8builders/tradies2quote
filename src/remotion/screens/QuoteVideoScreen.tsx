/**
 * The client quote video on the client's quote link
 * (quote/[token]/_components/QuoteVideoPlayer.tsx): the card at the top of
 * the page, the poster with the big play button, then the tradie's
 * 15-second video playing inline. The video is the real template
 * (QuoteVideo, the one the video worker renders), fed the example job.
 */
import { Freeze, Sequence } from "remotion";
import { Play } from "@phosphor-icons/react/dist/ssr";
import { buildQuoteVideoProps, type QuoteVideoProps } from "../../lib/quote-video/props";
import { SAMPLE_LOGO_SVG } from "../../lib/quote-video/sample";
import { EXAMPLE } from "../demo-script";
import { C, FONT } from "../marketing/theme";
import { QuoteVideo } from "../quote-video/QuoteVideo";
import { QuoteSummary } from "./ClientQuoteScreen";
import { BrowserBar } from "./SystemUI";
import { Tap } from "./ui";

/** The example job as the video worker would see it (same lines and totals as every other screen). */
export const DEMO_QUOTE_VIDEO: QuoteVideoProps = {
  ...buildQuoteVideoProps(
    {
      quote_data: {
        client: { name: EXAMPLE.client, address: null, email: null, phone: null },
        job_summary: EXAMPLE.jobSummary,
        line_items: EXAMPLE.lines.map((l) => ({
          type: l.type,
          description: l.description,
          quantity: l.quantity,
          unit: l.unit,
          unit_price: l.unitPrice,
          line_total: l.total,
        })),
        subtotal_before_tax: EXAMPLE.subtotal,
        tax_amount: EXAMPLE.gst,
        total: EXAMPLE.total,
        currency: EXAMPLE.currency,
        tax_label: "GST",
        tax_rate: EXAMPLE.gstRate,
      },
      total_amount: EXAMPLE.total,
      currency: EXAMPLE.currency,
      expires_at: "2026-10-23T02:00:00.000Z",
    },
    { business_name: EXAMPLE.business, logo_url: null, country: "NZ", currency: EXAMPLE.currency },
  ),
  logoSrc: `data:image/svg+xml;base64,${btoa(SAMPLE_LOGO_SVG)}`,
  logoAspect: 1,
};

/** The poster frame: the business mark has landed. */
const POSTER_FRAME = 45;
const PLAYER_W = 320;
const PLAYER_H = (PLAYER_W * 16) / 9;

/**
 * `startAt` is the composition frame the client taps play (before it, the
 * poster shows); the video then plays from its first frame.
 */
export function ClientVideoScreen({ startAt, tap = null }: { startAt: number; tap?: { x: number; y: number; p: number } | null }) {
  const video = (
    // Positioned, so the template's full-frame layers fill 720 × 1280 before the scale.
    <div style={{ position: "absolute", left: 0, top: 0, width: 720, height: 1280, transform: `scale(${PLAYER_W / 720})`, transformOrigin: "0 0" }}>
      <QuoteVideo {...DEMO_QUOTE_VIDEO} />
    </div>
  );
  return (
    <>
      <div style={{ position: "absolute", inset: 0, background: C.ink900 }} />
      <div style={{ position: "absolute", left: 16, right: 16, top: 70 }}>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.03em", textTransform: "uppercase", marginBottom: 16 }}>
          tradies<span style={{ color: C.brand }}>2</span>Quote
        </div>
        <div style={{ borderRadius: 16, border: "1px solid #ffffff14", background: "#161717", padding: 16 }}>
          <div style={{ fontFamily: FONT.mono, fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: C.ink400 }}>
            {"// your quote in 15 seconds"}
          </div>
          <div style={{ marginTop: 4, fontSize: 14, color: C.ink200 }}>{EXAMPLE.business} made a short video of this quote.</div>
          <div
            style={{
              position: "relative",
              margin: "12px auto 0",
              width: PLAYER_W,
              height: PLAYER_H,
              borderRadius: 12,
              overflow: "hidden",
              border: `1px solid ${C.ink700}`,
              background: C.ink950,
            }}
          >
            <Sequence durationInFrames={Math.max(1, startAt)} layout="none">
              <Freeze frame={POSTER_FRAME}>{video}</Freeze>
            </Sequence>
            <Sequence from={startAt} layout="none">
              {video}
            </Sequence>
            <Sequence durationInFrames={Math.max(1, startAt)} layout="none">
              <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(0,0,0,0.1)" }}>
                <div
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: 999,
                    background: C.brand,
                    color: C.ink900,
                    display: "grid",
                    placeItems: "center",
                    boxShadow: "0 12px 40px -10px rgba(255,95,21,0.8)",
                  }}
                >
                  <Play size={36} weight="fill" />
                </div>
              </div>
            </Sequence>
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <QuoteSummary />
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          height: 62,
          zIndex: 30,
          background: "linear-gradient(180deg, rgba(17,17,17,1) 0%, rgba(17,17,17,0.96) 70%, rgba(17,17,17,0) 100%)",
        }}
      />
      <BrowserBar host={EXAMPLE.site} />
      {tap ? <Tap {...tap} /> : null}
    </>
  );
}
