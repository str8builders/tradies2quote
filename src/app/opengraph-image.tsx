import { ImageResponse } from "next/og";

export const alt =
  "tradies2Quote — Voice in. Quote out. Your final say.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
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
            top: -200,
            right: -200,
            width: 700,
            height: 700,
            borderRadius: 9999,
            background:
              "radial-gradient(closest-side, rgba(255,90,31,0.55), rgba(255,90,31,0))",
            display: "flex",
          }}
        />

        {/* Wordmark */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            fontSize: 32,
            fontWeight: 600,
            letterSpacing: -0.5,
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "#ff5a1f",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#0c0d0e",
              fontWeight: 800,
              fontSize: 24,
            }}
          >
            t2
          </div>
          <div style={{ display: "flex" }}>
            tradies<span style={{ color: "#ff5a1f" }}>2</span>Quote
          </div>
        </div>

        {/* Headline */}
        <div
          style={{
            marginTop: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 24,
          }}
        >
          <div
            style={{
              fontSize: 96,
              fontWeight: 700,
              letterSpacing: -3,
              lineHeight: 1.02,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <span>Voice in. Quote out.</span>
            <span style={{ color: "#ff5a1f" }}>Your final say.</span>
          </div>
          <div
            style={{
              fontSize: 28,
              color: "rgba(255,255,255,0.7)",
              maxWidth: 900,
              display: "flex",
            }}
          >
            Voice-first AI quoting for NZ tradies.
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
