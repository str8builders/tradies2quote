"use client";
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export const QUOTE_DEMO_FPS = 30;
/** Five chapters of six seconds. */
export const QUOTE_DEMO_DURATION = 900;
export const QUOTE_DEMO_WIDTH = 1280;
export const QUOTE_DEMO_HEIGHT = 720;
const CHAPTER = 180;

const orange = "#FF5F15";
const hivis = "#FFEA00";
const paper = "#f4f4f1";
const muted = "#a3a8a3";
const font = 'var(--font-plus-jakarta), "Arial", sans-serif';
const mono = "var(--font-ibm-plex-mono), monospace";
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** A fictional worked example. Every screen is a real app screenshot with example data. */
const CHAPTERS = [
  { kicker: "VOICE IN", title: "Talk the job", body: "Record a walkthrough on site. Your words are the starting point.", screen: "/screens/screen-4.jpg" },
  { kicker: "QUOTE OUT", title: "Draft builds itself", body: "Materials, labour, markup and GST, laid out line by line.", screen: "/screens/screen-6.jpg" },
  { kicker: "YOUR CALL", title: "Check every line", body: "Scope, quantities, rates and terms. Your experience has the final say.", screen: "/screens/screen-7.jpg" },
  { kicker: "SEND IT", title: "Get the yes", body: "A branded quote your client reads and accepts from their phone.", screen: "/screens/screen-6.jpg" },
  { kicker: "GET PAID", title: "Invoice. Repeat", body: "Turn the accepted quote into an invoice. The paperwork stays together.", screen: "/screens/screen-9.jpg" },
] as const;

const TRANSCRIPT = "New timber deck, 24 square metres. Include decking, fixings, site preparation and installation.";
const ROWS = [
  { title: "Decking & fixings", type: "MATERIALS", amount: 2640 },
  { title: "Preparation & installation", type: "LABOUR", amount: 1560 },
  { title: "GST (15%)", type: "TAX", amount: 630 },
];
const TOTAL = 4830;
const CHECKS = ["Scope matches the walkthrough", "Quantities checked", "Your rates, your markup", "Terms attached"];

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Deterministic burst particles for the acceptance moment. */
const PARTICLES = Array.from({ length: 42 }, (_, i) => {
  const a = (i / 42) * Math.PI * 2 + Math.sin(i * 12.9898) * 0.6;
  const speed = 120 + ((i * 37) % 90);
  return { a, speed, size: 6 + ((i * 13) % 9), color: i % 3 === 0 ? hivis : i % 3 === 1 ? orange : paper, spin: (i % 5) * 72 };
});

export function QuoteDemo() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const chapter = Math.min(CHAPTERS.length - 1, Math.floor(frame / CHAPTER));
  const local = frame - chapter * CHAPTER;
  const enter = spring({ frame: local, fps, config: { damping: 24, stiffness: 120 } });
  const exit = interpolate(local, [CHAPTER - 18, CHAPTER - 1], [1, 0], clamp);
  const cardOpacity = Math.min(enter, chapter === CHAPTERS.length - 1 ? 1 : exit);
  const current = CHAPTERS[chapter];

  return (
    <AbsoluteFill style={{ background: "#0f1111", fontFamily: font, color: paper, overflow: "hidden" }}>
      {/* Drifting brand glow + drafting grid. */}
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at ${68 + Math.sin(frame / 140) * 9}% ${70 + Math.cos(frame / 170) * 6}%, #FF5F1522, transparent 58%)` }} />
      <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(#ffffff07 1px,transparent 1px),linear-gradient(90deg,#ffffff07 1px,transparent 1px)", backgroundSize: "64px 64px", opacity: 0.6, transform: `translateY(${-(frame % 64) / 4}px)` }} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 6, background: hivis }} />

      {/* Header strip. */}
      <div style={{ position: "absolute", left: 55, top: 36, right: 55, display: "flex", justifyContent: "space-between", fontFamily: mono, fontSize: 14, letterSpacing: 2, color: muted }}>
        <span>TRADIES<span style={{ color: orange }}>2</span>QUOTE / PRODUCT WALKTHROUGH</span>
        <span>REAL APP SCREENS · EXAMPLE DATA</span>
      </div>

      {/* Left column: chapter copy + detail card. */}
      <div style={{ position: "absolute", top: 96, left: 70, width: 560 }}>
        <div style={{ fontFamily: mono, fontSize: 16, color: orange, letterSpacing: 3, marginBottom: 16 }}>
          0{chapter + 1} / {current.kicker}
        </div>
        <div style={{ fontSize: 54, fontWeight: 800, lineHeight: 1.02, letterSpacing: -3, transform: `translateY(${(1 - enter) * 18}px)`, opacity: 0.35 + enter * 0.65 }}>
          {current.title}
          <span style={{ color: orange }}>.</span>
        </div>
        <div style={{ fontSize: 19, lineHeight: 1.45, color: muted, marginTop: 10, maxWidth: 470, opacity: interpolate(local, [6, 30], [0, 1], clamp) }}>
          {current.body}
        </div>

        <div style={{ marginTop: 18, opacity: cardOpacity, transform: `translateY(${(1 - enter) * 26}px)` }}>
          {chapter === 0 && <VoiceCard local={local} frame={frame} />}
          {chapter === 1 && <DraftCard local={local} fps={fps} />}
          {chapter === 2 && <ReviewCard local={local} fps={fps} />}
          {chapter === 3 && <SendCard local={local} fps={fps} />}
          {chapter === 4 && <InvoiceCard local={local} fps={fps} />}
        </div>
      </div>

      {/* Right column: the phone. */}
      <Phone chapter={chapter} local={local} frame={frame} fps={fps} />

      {/* Footer: progress + captions. */}
      <div style={{ position: "absolute", left: 55, right: 55, bottom: 34 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {CHAPTERS.map((c, i) => {
            const fill = i < chapter ? 1 : i === chapter ? local / CHAPTER : 0;
            return (
              <div key={c.title} style={{ flex: 1, height: 4, borderRadius: 10, background: "#ffffff1c", overflow: "hidden" }}>
                <div style={{ width: `${fill * 100}%`, height: "100%", background: orange }} />
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: mono, fontSize: 12, color: muted, letterSpacing: 1 }}>
          <span>YOU REVIEW EVERY QUOTE BEFORE IT GOES OUT.</span>
          <span>TALK → DRAFT → CHECK → SEND → INVOICE</span>
        </div>
      </div>
    </AbsoluteFill>
  );
}

/* ---------- pieces ---------- */

function Card({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <div style={{ padding: 20, background: "linear-gradient(135deg,#1f2321,#151817)", border: `1px solid ${accent ? "#FF5F1566" : "#ffffff22"}`, borderRadius: 20, boxShadow: "0 30px 80px #0009", width: 500 }}>
      {children}
    </div>
  );
}

function VoiceCard({ local, frame }: { local: number; frame: number }) {
  const typed = TRANSCRIPT.slice(0, Math.floor(interpolate(local, [10, 130], [0, TRANSCRIPT.length], clamp)));
  const recording = local > 4;
  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 15, fontFamily: mono, letterSpacing: 1.5 }}>
        <span style={{ color: orange, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 10, height: 10, borderRadius: 10, background: recording ? "#ff3b3b" : "#555", boxShadow: recording && frame % 30 < 15 ? "0 0 12px #ff3b3b" : "none" }} />
          RECORDING SITE NOTE
        </span>
        <span style={{ color: muted }}>00:{String(Math.min(59, Math.floor(local / 30))).padStart(2, "0")}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 70, gap: 5, margin: "16px 0 12px" }}>
        {Array.from({ length: 40 }, (_, i) => {
          const live = i / 40 < local / 140;
          const h = live ? 10 + Math.abs(Math.sin(frame / 7 + i * 0.8)) * 62 : 6;
          return <div key={i} style={{ width: 6, borderRadius: 4, height: h, background: i % 8 === 0 ? hivis : live ? orange : "#ffffff22" }} />;
        })}
      </div>
      <p style={{ fontSize: 20, lineHeight: 1.5, color: "#e6e8e2", minHeight: 90, margin: 0 }}>
        “{typed}<span style={{ opacity: frame % 20 < 10 ? 1 : 0 }}>|</span>”
      </p>
    </Card>
  );
}

function DraftCard({ local, fps }: { local: number; fps: number }) {
  const totalProgress = interpolate(local, [70, 130], [0, 1], clamp);
  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: mono, fontSize: 13, letterSpacing: 1.5, color: muted }}>
        <span>NEW TIMBER DECK · 24 m²</span>
        <span style={{ color: hivis }}>DRAFT</span>
      </div>
      {ROWS.map((r, i) => {
        const s = spring({ frame: local - 14 - i * 22, fps, config: { damping: 18, stiffness: 140 } });
        const amount = Math.round(interpolate(local, [14 + i * 22, 44 + i * 22], [0, r.amount], clamp));
        return (
          <div key={r.type} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 0", borderBottom: "1px solid #ffffff14", opacity: s, transform: `translateX(${(1 - s) * -30}px)` }}>
            <span style={{ fontSize: 17 }}>
              {r.title}
              <small style={{ display: "block", fontFamily: mono, fontSize: 11, color: muted, marginTop: 4, letterSpacing: 1 }}>{r.type}</small>
            </span>
            <span style={{ fontSize: 19, fontVariantNumeric: "tabular-nums" }}>{money(amount)}</span>
          </div>
        );
      })}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14 }}>
        <span style={{ fontSize: 17 }}>Total NZD</span>
        <strong style={{ fontSize: 30, color: orange, letterSpacing: -1, fontVariantNumeric: "tabular-nums" }}>{money(Math.round(TOTAL * totalProgress))}</strong>
      </div>
    </Card>
  );
}

function Tick({ progress }: { progress: number }) {
  const len = 30;
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
      <circle cx="13" cy="13" r="12" fill={progress > 0 ? orange : "#ffffff10"} stroke={progress > 0 ? orange : "#ffffff30"} />
      <path d="M7 13.5l4 4 8-9" fill="none" stroke="#111" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={len} strokeDashoffset={len * (1 - progress)} />
    </svg>
  );
}

function ReviewCard({ local, fps }: { local: number; fps: number }) {
  return (
    <Card accent>
      <div style={{ fontFamily: mono, fontSize: 13, letterSpacing: 1.5, color: muted, marginBottom: 6 }}>BEFORE IT GOES OUT</div>
      {CHECKS.map((label, i) => {
        const start = 16 + i * 26;
        const p = interpolate(local, [start, start + 14], [0, 1], clamp);
        const s = spring({ frame: local - start + 10, fps, config: { damping: 20 } });
        return (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 14, padding: "9px 0", borderBottom: "1px solid #ffffff12", opacity: 0.35 + s * 0.65, transform: `translateX(${(1 - s) * 16}px)` }}>
            <Tick progress={p} />
            <span style={{ fontSize: 18, color: p > 0.9 ? paper : "#cfd3cd" }}>{label}</span>
          </div>
        );
      })}
      <div style={{ marginTop: 14, padding: "12px 16px", borderRadius: 10, background: local > 130 ? orange : "#ffffff0a", color: local > 130 ? "#111" : muted, fontWeight: 700, fontSize: 17, display: "flex", justifyContent: "space-between" }}>
        <span>{local > 130 ? "Reviewed by you" : "Edit anything, any time"}</span>
        <span style={{ fontFamily: mono }}>{local > 130 ? "READY" : "4 CHECKS"}</span>
      </div>
    </Card>
  );
}

function SendCard({ local, fps }: { local: number; fps: number }) {
  const sent = spring({ frame: local - 10, fps, config: { damping: 16 } });
  const accepted = local >= 78;
  const pop = spring({ frame: local - 78, fps, config: { damping: 12, stiffness: 180 } });
  const burst = interpolate(local, [78, 150], [0, 1], clamp);
  return (
    <div style={{ position: "relative" }}>
      <Card accent={accepted}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontFamily: mono, fontSize: 13, letterSpacing: 1.5, color: muted }}>QUOTE Q-2026-A41C</div>
            <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6 }}>Sam Taylor · Timber deck</div>
          </div>
          <strong style={{ fontSize: 26, color: orange }}>{money(TOTAL)}</strong>
        </div>
        <div style={{ marginTop: 20, height: 8, borderRadius: 8, background: "#ffffff14", overflow: "hidden" }}>
          <div style={{ width: `${Math.min(1, sent) * 100}%`, height: "100%", background: `linear-gradient(90deg,${orange},${hivis})` }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, fontFamily: mono, fontSize: 13, color: muted, letterSpacing: 1 }}>
          <span>{sent > 0.95 ? "SENT · EMAIL + TEXT" : "SENDING…"}</span>
          <span>OPENS ON THEIR PHONE</span>
        </div>
        <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 14, padding: "13px 16px", borderRadius: 12, background: accepted ? "#FF5F1522" : "#ffffff08", border: `1px solid ${accepted ? orange : "#ffffff14"}`, transform: `scale(${accepted ? 0.9 + pop * 0.1 : 1})` }}>
          <Tick progress={accepted ? Math.min(1, pop) : 0} />
          <div>
            <div style={{ fontSize: 19, fontWeight: 700 }}>{accepted ? "Accepted by Sam" : "Waiting for the client"}</div>
            <div style={{ fontSize: 14, color: muted, marginTop: 4 }}>{accepted ? "Signed on their phone · Tuesday 9:14 am" : "They read it, tap accept, sign with a finger."}</div>
          </div>
        </div>
      </Card>
      {accepted && (
        <div style={{ position: "absolute", left: 250, top: 150, pointerEvents: "none" }}>
          {PARTICLES.map((p, i) => {
            const d = p.speed * Math.sin(Math.min(1, burst) * Math.PI / 2);
            return (
              <div key={i} style={{ position: "absolute", width: p.size, height: p.size * 0.6, borderRadius: 2, background: p.color, opacity: 1 - burst, transform: `translate(${Math.cos(p.a) * d}px, ${Math.sin(p.a) * d + burst * 60}px) rotate(${p.spin + burst * 360}deg)` }} />
            );
          })}
        </div>
      )}
    </div>
  );
}

function InvoiceCard({ local, fps }: { local: number; fps: number }) {
  const s = spring({ frame: local - 8, fps, config: { damping: 18 } });
  const paid = interpolate(local, [50, 120], [0, 1], clamp);
  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", opacity: s }}>
        <div>
          <div style={{ fontFamily: mono, fontSize: 13, letterSpacing: 1.5, color: muted }}>INVOICE INV-0042 · FROM QUOTE Q-2026-A41C</div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6 }}>Timber deck · complete</div>
        </div>
        <span style={{ fontFamily: mono, fontSize: 12, padding: "7px 11px", borderRadius: 7, background: paid > 0.99 ? "#1f5f3a" : "#ffffff0d", color: paid > 0.99 ? "#8ff0b4" : muted, letterSpacing: 1 }}>{paid > 0.99 ? "PAID" : "DUE 7 DAYS"}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 22, fontSize: 17, color: "#d3d7d1" }}>
        <span>Received</span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{money(Math.round(TOTAL * paid))}</span>
      </div>
      <div style={{ marginTop: 10, height: 10, borderRadius: 8, background: "#ffffff14", overflow: "hidden" }}>
        <div style={{ width: `${paid * 100}%`, height: "100%", background: paid > 0.99 ? "#5ad48a" : orange }} />
      </div>
      <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {[["Quotes", "12 sent"], ["Accepted", "9 jobs"], ["Invoiced", "$38,420"], ["Calculators", "T2QCAL · 95"]].map(([k, v], i) => {
          const c = spring({ frame: local - 30 - i * 10, fps, config: { damping: 20 } });
          return (
            <div key={k} style={{ padding: "9px 12px", borderRadius: 10, background: "#ffffff08", border: "1px solid #ffffff12", opacity: c, transform: `translateY(${(1 - c) * 10}px)` }}>
              <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: 1.5, color: muted }}>{k.toUpperCase()}</div>
              <div style={{ fontSize: 17, fontWeight: 700, marginTop: 3, color: i === 3 ? hivis : paper }}>{v}</div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function Phone({ chapter, local, frame, fps }: { chapter: number; local: number; frame: number; fps: number }) {
  const swap = spring({ frame: local, fps, config: { damping: 22, stiffness: 100 } });
  const prev = CHAPTERS[Math.max(0, chapter - 1)].screen;
  const next = CHAPTERS[chapter].screen;
  const cameo = chapter === 4 ? interpolate(local, [95, 125], [0, 1], clamp) : 0;
  const float = Math.sin(frame / 42) * 5;
  const W = 270, H = 585;
  return (
    <div style={{ position: "absolute", right: 92, top: 74, width: W + 120, height: H + 40, perspective: 1400 }}>
      {/* T2QCAL cameo phone slides in behind on the last chapter. */}
      <div style={{ position: "absolute", left: -70, top: 30, width: W, height: H, transform: `translateX(${(1 - cameo) * 160}px) rotateY(-10deg) scale(0.9)`, opacity: cameo }}>
        <Bezel><Img src="/screens/t2qcal-drawing.jpg" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} /></Bezel>
        <div style={{ position: "absolute", left: 0, top: -30, fontFamily: mono, fontSize: 12, letterSpacing: 1.5, color: hivis, whiteSpace: "nowrap" }}>T2QCAL · CALCULATORS INCLUDED</div>
      </div>
      <div style={{ position: "absolute", left: 100, top: 0, width: W, height: H, transform: `translateY(${float}px) rotateY(${-9 + swap * 3}deg) rotateX(${2 - swap * 2}deg)`, filter: "drop-shadow(0 40px 70px #000a)" }}>
        <Bezel>
          {chapter > 0 && <Img src={prev} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "top", opacity: 1 - swap }} />}
          <Img src={next} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "top", opacity: chapter === 0 ? 1 : swap, transform: `scale(${1.04 - swap * 0.04})` }} />
          {/* Tap ripple on the phone at key moments. */}
          {((chapter === 0 && local > 6 && local < 40) || (chapter === 3 && local > 8 && local < 40)) && (
            <div style={{ position: "absolute", left: W / 2 - 40, top: chapter === 0 ? 300 : 560, width: 80, height: 80, borderRadius: 80, border: `3px solid ${orange}`, opacity: 1 - (local % 34) / 34, transform: `scale(${0.4 + ((local % 34) / 34) * 1.2})` }} />
          )}
        </Bezel>
      </div>
    </div>
  );
}

function Bezel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: 44, background: "#0a0a0a", padding: 10, boxSizing: "border-box", border: "1px solid #ffffff24" }}>
      <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: 36, overflow: "hidden", background: "#111" }}>{children}</div>
      <div style={{ position: "absolute", left: "50%", top: 18, width: 96, height: 26, marginLeft: -48, borderRadius: 26, background: "#0a0a0a" }} />
    </div>
  );
}
