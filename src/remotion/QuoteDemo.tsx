"use client";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export const QUOTE_DEMO_FPS = 30;
export const QUOTE_DEMO_DURATION = 600;
export const QUOTE_DEMO_WIDTH = 1280;
export const QUOTE_DEMO_HEIGHT = 720;
const orange = "#FF5F15";
const font = 'var(--font-plus-jakarta), "Arial", sans-serif';
const mono = "var(--font-ibm-plex-mono), monospace";
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const chapters = [
  "Capture the job",
  "Build your draft",
  "Check the details",
  "Ready to send",
];
const descriptions = [
  "Your words are the starting point.",
  "Materials. Labour. A clear breakdown.",
  "Your experience has the final say.",
  "Your name. Your quote. Your call.",
];
const transcript =
  "New timber deck, 24 square metres. Include decking, fixings, site preparation and installation.";
const rows = [
  { title: "Decking & fixings", type: "MATERIALS", amount: "$2,640.00" },
  { title: "Preparation & installation", type: "LABOUR", amount: "$1,560.00" },
];

/** A fictional worked example, showing review before sending; no live activity. */
export function QuoteDemo() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const chapter = Math.min(3, Math.floor(frame / 150));
  const local = frame % 150;
  const enter = spring({
    frame: local,
    fps,
    config: { damping: 22, stiffness: 110 },
  });
  const turn = interpolate(frame, [150, 195], [10, 0], clamp);
  const ready = chapter === 3;
  return (
    <AbsoluteFill
      style={{
        background: "#101212",
        fontFamily: font,
        color: "#f4f4f1",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(ellipse at ${70 + Math.sin(frame / 130) * 8}% 75%,#FF5F151a,transparent 60%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(#ffffff07 1px,transparent 1px),linear-gradient(90deg,#ffffff07 1px,transparent 1px)",
          backgroundSize: "64px 64px",
          opacity: 0.7,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 55,
          top: 42,
          right: 55,
          display: "flex",
          justifyContent: "space-between",
          fontFamily: mono,
          fontSize: 15,
          letterSpacing: 2,
          color: "#9d9f9b",
        }}
      >
        <span>
          TRADIES<span style={{ color: orange }}>2</span>QUOTE / PRODUCT
          WALKTHROUGH
        </span>
        <span>EXAMPLE DATA</span>
      </div>
      <div style={{ position: "absolute", top: 140, left: 70, width: 475 }}>
        <div
          style={{
            fontFamily: mono,
            fontSize: 18,
            color: orange,
            letterSpacing: 3,
            marginBottom: 28,
          }}
        >
          0{chapter + 1} / {chapter === 0 ? "VOICE IN" : "QUOTE OUT"}
        </div>
        <div
          style={{
            fontSize: 66,
            fontWeight: 800,
            lineHeight: 1.08,
            letterSpacing: -4,
            transform: `translateY(${(1 - enter) * 12}px)`,
            opacity: 0.5 + enter * 0.5,
          }}
        >
          {chapters[chapter]}
          <span style={{ color: orange }}>.</span>
        </div>
        <div
          style={{
            fontSize: 25,
            lineHeight: 1.6,
            color: "#aaa",
            marginTop: 26,
            maxWidth: 395,
          }}
        >
          {descriptions[chapter]}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 58 }}>
          {chapters.map((_, i) => (
            <div
              key={i}
              style={{
                width: 65,
                height: 4,
                borderRadius: 10,
                background: i <= chapter ? orange : "#ffffff19",
              }}
            />
          ))}
        </div>
        <div
          style={{
            fontFamily: mono,
            fontSize: 14,
            color: "#818783",
            marginTop: 22,
          }}
        >
          CAPTURE → DRAFT → REVIEW → SEND
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          top: 113,
          right: 65,
          width: 555,
          perspective: 1000,
        }}
      >
        {chapter === 0 ? (
          <div
            style={{
              marginTop: 42,
              padding: 38,
              background: "#1d201f",
              border: "1px solid #ffffff29",
              borderRadius: 24,
              boxShadow: "0 32px 90px #0008",
              transform: `rotateY(-7deg) translateY(${Math.sin(frame / 35) * 6}px)`,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: 18,
              }}
            >
              <span style={{ color: orange }}>YOUR SITE NOTE</span>
              <span style={{ color: "#aaa", fontFamily: mono }}>
                00:{String(Math.floor(local / 30)).padStart(2, "0")}
              </span>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: 110,
                gap: 6,
                marginBlock: 30,
              }}
            >
              {Array.from({ length: 32 }, (_, i) => (
                <div
                  key={i}
                  style={{
                    width: 6,
                    borderRadius: 4,
                    height: 12 + Math.abs(Math.sin(frame / 8 + i * 0.9)) * 70,
                    background: i % 7 === 0 ? "#FFEA00" : orange,
                  }}
                />
              ))}
            </div>
            <p
              style={{
                fontSize: 25,
                lineHeight: 1.6,
                color: "#e2e5df",
                minHeight: 150,
              }}
            >
              “
              {transcript.slice(
                0,
                Math.floor(
                  interpolate(local, [4, 120], [0, transcript.length], clamp),
                ),
              )}
              ”
            </p>
            <div
              style={{
                fontSize: 16,
                color: "#939d96",
                borderTop: "1px solid #ffffff19",
                paddingTop: 22,
                marginTop: 20,
              }}
            >
              Describe the job in your own words.
            </div>
          </div>
        ) : (
          <div
            style={{
              padding: 32,
              background: "linear-gradient(130deg,#292c29,#1b1e1c)",
              border: "1px solid #ffffff2b",
              borderRadius: 22,
              boxShadow: "0 32px 90px #0008",
              transform: `rotateY(${-turn}deg) rotateZ(${Math.sin(frame / 160) * 0.7}deg)`,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                borderBottom: "1px solid #ffffff20",
                paddingBottom: 20,
              }}
            >
              <strong style={{ fontSize: 18 }}>YOUR BUSINESS</strong>
              <span
                style={{
                  fontSize: 13,
                  color: ready ? "#FFEA00" : "#d7d7c7",
                  padding: "7px 12px",
                  borderRadius: 7,
                  background: "#ffffff0b",
                }}
              >
                {ready ? "REVIEWED" : "DRAFT QUOTE"}
              </span>
            </div>
            <div
              style={{
                fontSize: 29,
                fontWeight: 700,
                marginTop: 22,
                letterSpacing: -1,
              }}
            >
              New timber deck
            </div>
            <div style={{ fontSize: 15, color: "#9fa59f", marginTop: 8 }}>
              24 m² · Example quote
            </div>
            <div style={{ marginTop: 15 }}>
              {rows.map((r, i) => {
                const entry =
                  chapter > 1
                    ? 1
                    : spring({
                        frame: local - 20 - i * 28,
                        fps,
                        config: { damping: 20 },
                      });
                return (
                  <div
                    key={r.type}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "18px 0",
                      borderBottom: "1px solid #ffffff13",
                      opacity: entry,
                      transform: `translateY(${(1 - entry) * 12}px)`,
                    }}
                  >
                    <span style={{ fontSize: 18 }}>
                      {r.title}
                      <small
                        style={{
                          display: "block",
                          fontFamily: mono,
                          fontSize: 11,
                          color: "#8e9890",
                          marginTop: 7,
                        }}
                      >
                        {r.type}
                      </small>
                    </span>
                    <span style={{ fontSize: 19 }}>{r.amount}</span>
                  </div>
                );
              })}
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: 20,
                fontSize: 16,
                color: "#adb6ad",
              }}
            >
              <span>Subtotal</span>
              <span>$4,200.00</span>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: 12,
                fontSize: 16,
                color: "#adb6ad",
              }}
            >
              <span>GST (15%)</span>
              <span>$630.00</span>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 20,
                paddingTop: 20,
                borderTop: "1px solid #ffffff25",
              }}
            >
              <span style={{ fontSize: 18 }}>Total NZD</span>
              <strong
                style={{ fontSize: 36, color: orange, letterSpacing: -1 }}
              >
                $4,830.00
              </strong>
            </div>
            <div
              style={{
                padding: "17px 20px",
                background: ready ? orange : "#ffffff09",
                border: "1px solid #ffffff16",
                borderRadius: 9,
                marginTop: 24,
                fontSize: 18,
                fontWeight: 600,
                color: ready ? "#111" : "#eee",
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span>
                {ready
                  ? "Ready when you are"
                  : chapter === 2
                    ? "Check scope, rates & terms"
                    : "Editable first draft"}
              </span>
              <span>{ready ? "→" : "✓"}</span>
            </div>
          </div>
        )}
      </div>
      <div
        style={{
          position: "absolute",
          left: 55,
          right: 55,
          bottom: 39,
          fontFamily: mono,
          fontSize: 13,
          color: "#969d98",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>YOU REVIEW EVERY QUOTE BEFORE IT GOES OUT.</span>
        <span>20 SECOND PRODUCT TOUR</span>
      </div>
    </AbsoluteFill>
  );
}
