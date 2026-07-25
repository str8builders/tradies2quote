import { ImageResponse } from "next/og";
import { adminClient } from "@/lib/supabase/admin";
import { formatCurrency, quoteNumber } from "@/lib/quote-defaults";
import { isRichPreviewEligible } from "@/lib/quote-public-view";
import type { PublicQuotePayload } from "@/lib/quote-types";

// Node runtime: this reaches the service-role Supabase client to build a
// per-quote card. Mirrors the proven root `opengraph-image.tsx` (no custom
// fonts — ImageResponse's built-in font renders the Latin text fine).
export const runtime = "nodejs";
export const alt = "Your quote is ready to view and accept";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function QuoteOgImage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Neutral defaults so a fetch failure still yields a clean, on-brand card
  // (a broken OG image would just mean no preview — never a broken page).
  let business = "Your quote is ready";
  let number = "";
  let total = "";
  let taxLabel = "GST";
  try {
    const admin = adminClient();
    const { data } = await admin.rpc(
      "get_quote_by_token",
      { p_token: token } as never,
    );
    const quote = data as PublicQuotePayload | null;
    // Only enrich for quotes the page BODY renders in full (live/accepted).
    // Draft/declined/expired stay on the neutral card so the card never leaks
    // a business name or total for a quote the page itself hides.
    if (quote && isRichPreviewEligible(quote, new Date())) {
      business = quote.business_name?.trim() || "Your tradie";
      number = quoteNumber(quote.id, quote.created_at);
      total = formatCurrency(quote.total, quote.currency);
      taxLabel = quote.tax_label?.trim() || "GST";
    }
  } catch {
    /* fall through to the neutral card */
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0c0d0e",
          color: "#ffffff",
          padding: "72px",
          fontFamily: "system-ui, -apple-system, sans-serif",
          position: "relative",
        }}
      >
        {/* Soft accent glow */}
        <div
          style={{
            position: "absolute",
            top: -220,
            right: -180,
            width: 680,
            height: 680,
            borderRadius: 9999,
            background:
              "radial-gradient(closest-side, rgba(255,90,31,0.5), rgba(255,90,31,0))",
            display: "flex",
          }}
        />

        {/* Top: quote number chip */}
        <div style={{ display: "flex" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "10px 20px",
              borderRadius: 9999,
              border: "1px solid rgba(255,255,255,0.18)",
              color: "rgba(255,255,255,0.85)",
              fontSize: 26,
              fontWeight: 600,
              letterSpacing: 1,
            }}
          >
            {number ? `QUOTE ${number}` : "YOUR QUOTE"}
          </div>
        </div>

        {/* Middle: business name + total */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div
            style={{
              display: "flex",
              fontSize: 30,
              color: "rgba(255,255,255,0.65)",
              fontWeight: 500,
            }}
          >
            {total ? "Your quote from" : " "}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 68,
              fontWeight: 700,
              letterSpacing: -1.5,
              lineHeight: 1.05,
              maxWidth: 1000,
            }}
          >
            {business}
          </div>
          {total ? (
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 18,
                marginTop: 8,
              }}
            >
              <div
                style={{
                  display: "flex",
                  fontSize: 92,
                  fontWeight: 800,
                  letterSpacing: -2,
                  color: "#ff5a1f",
                }}
              >
                {total}
              </div>
              <div
                style={{
                  display: "flex",
                  fontSize: 26,
                  color: "rgba(255,255,255,0.6)",
                }}
              >
                incl. {taxLabel}
              </div>
            </div>
          ) : null}
        </div>

        {/* Bottom: CTA + subtle attribution */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 30,
              fontWeight: 600,
              color: "#ffffff",
            }}
          >
            Tap to view &amp; accept online
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 22,
              color: "rgba(255,255,255,0.5)",
            }}
          >
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                background: "#ff5a1f",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#0c0d0e",
                fontWeight: 800,
                fontSize: 17,
              }}
            >
              t2
            </div>
            <div style={{ display: "flex" }}>powered by tradies2Quote</div>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
