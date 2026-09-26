/**
 * New-look Talk (app/app/quotes/new/_v2/TalkScreen.tsx → TalkView,
 * MicLevelBars.tsx) and "Check what you said" (ReviewScreen.tsx): the big
 * orange mic with its rings, the 24-bar level meter, "I'm listening · 0:42",
 * then the transcript with its sizes marked in hi-vis. The app's own words.
 */
import { ArrowCounterClockwise, Check, Microphone } from "@phosphor-icons/react/dist/ssr";
import { EXAMPLE } from "../../demo-script";
import { BRAND_GRADIENT, BottomBar, Button, Card, Heading, Muted, NL, NL_FONT, Page, TopBar } from "./ui";

export type TalkPhase = "idle" | "recording" | "writing";

const BARS = 24;

/** One bar's height (0–1) at time `t`: speech-like, never flat while listening. */
function level(i: number, t: number, speaking: number) {
  const wave = Math.sin(t * 7.1 + i * 0.9) * 0.5 + Math.sin(t * 3.3 + i * 1.7) * 0.3 + Math.sin(t * 11.3 + i * 0.4) * 0.2;
  return 0.18 + speaking * (0.45 + 0.37 * wave);
}

function MicArea({ phase, t }: { phase: TalkPhase; t: number }) {
  const pulse = phase === "idle" ? 1 + Math.sin(t * 2.4) * 0.03 : 1;
  return (
    <div style={{ position: "relative", height: 192, display: "grid", placeItems: "center" }}>
      {[0, 1, 2].map((k) => {
        // Rings spread outward while listening.
        const spread = phase === "recording" ? ((t * 0.8 + k / 3) % 1) : 0.15 + k * 0.12;
        const size = 120 + spread * 72;
        return (
          <div
            key={k}
            style={{
              position: "absolute",
              width: size,
              height: size,
              borderRadius: 999,
              border: `2px solid rgba(255, 95, 21, ${phase === "recording" ? 0.5 * (1 - spread) : 0.18 - k * 0.05})`,
            }}
          />
        );
      })}
      <div
        style={{
          width: 120,
          height: 120,
          borderRadius: 999,
          background: BRAND_GRADIENT,
          display: "grid",
          placeItems: "center",
          color: NL.onBrand,
          transform: `scale(${pulse})`,
          boxShadow: "0 18px 40px -16px rgba(255,95,21,0.8)",
        }}
      >
        {phase === "writing" ? (
          <div style={{ width: 34, height: 34, borderRadius: 999, border: `4px solid rgba(18,18,17,0.35)`, borderTopColor: NL.onBrand, transform: `rotate(${t * 360}deg)` }} />
        ) : (
          <Microphone size={44} weight="fill" />
        )}
      </div>
    </div>
  );
}

function LevelBars({ t, speaking }: { t: number; speaking: number }) {
  return (
    <div style={{ height: 64, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
      {Array.from({ length: BARS }, (_, i) => {
        const h = Math.max(8, level(i, t, speaking) * 64);
        return (
          <div
            key={i}
            style={{
              width: 6,
              height: h,
              borderRadius: 999,
              background: `linear-gradient(0deg, ${NL.brand}, ${NL.hivis})`,
              opacity: 0.55 + 0.45 * speaking,
            }}
          />
        );
      })}
    </div>
  );
}

/** "Talk": `seconds` on the timer; `speaking` 0–1 drives the bars. */
export function TalkScreen({ phase, t, seconds = 0, speaking = 0, press = 0 }: { phase: TalkPhase; t: number; seconds?: number; speaking?: number; press?: number }) {
  const clock = `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
  const status =
    phase === "idle"
      ? ["Tap the mic to start.", "Sizes, materials, how long it’ll take. Up to 3 minutes."]
      : phase === "recording"
        ? [`I’m listening · ${clock}`, "Tap Done when you’ve finished."]
        : ["Writing down what you said…", "This usually takes a few seconds."];
  return (
    <>
      <Page top={134}>
        <Heading size={27}>Say the job like you’d tell a mate.</Heading>
        <div style={{ marginTop: 26 }}>
          <MicArea phase={phase} t={t} />
        </div>
        <div style={{ marginTop: 22 }}>
          <LevelBars t={t} speaking={phase === "recording" ? speaking : 0.05} />
        </div>
        <div style={{ marginTop: 22, textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 600, color: NL.text, fontVariantNumeric: "tabular-nums" }}>{status[0]}</div>
          <Muted size={15} style={{ marginTop: 4, padding: "0 20px" }}>
            {status[1]}
          </Muted>
        </div>
      </Page>
      <TopBar back="Cancel" title="Talk" />
      <BottomBar>
        {phase === "idle" ? (
          <Button icon={<Microphone size={20} weight="fill" />} pressed={press}>
            Start talking
          </Button>
        ) : phase === "recording" ? (
          <>
            <Button variant="ghost" icon={<ArrowCounterClockwise size={18} weight="bold" />}>
              Start again
            </Button>
            <Button icon={<Check size={20} weight="bold" />} pressed={press}>
              Done
            </Button>
          </>
        ) : (
          <Button style={{ opacity: 0.7 }}>Writing it down…</Button>
        )}
      </BottomBar>
    </>
  );
}

/** The transcript, with the sizes and amounts marked the way the app marks them. */
function Marked({ text, shown }: { text: string; shown: number }) {
  const visible = text.slice(0, shown);
  const marks = [/24 square metres/];
  const parts: Array<{ s: string; mark: boolean }> = [];
  let rest = visible;
  for (const re of marks) {
    const m = re.exec(rest);
    if (!m) continue;
    parts.push({ s: rest.slice(0, m.index), mark: false }, { s: m[0], mark: true });
    rest = rest.slice(m.index + m[0].length);
  }
  parts.push({ s: rest, mark: false });
  return (
    <>
      {parts.map((p, i) =>
        p.mark ? (
          <span key={i} style={{ background: NL.mark, color: NL.hivis, borderRadius: 4, padding: "0 3px", fontWeight: 600 }}>
            {p.s}
          </span>
        ) : (
          <span key={i}>{p.s}</span>
        ),
      )}
    </>
  );
}

/** "Check what you said": `shown` characters of the transcript so far. */
export function ReviewScreen({ shown = 999, press = 0 }: { shown?: number; press?: number }) {
  return (
    <>
      <Page top={134}>
        <Heading size={27}>Did I hear you right?</Heading>
        <Muted style={{ marginTop: 8 }}>Sizes and amounts are highlighted. That’s where a slip makes a wrong quote.</Muted>
        <Card style={{ marginTop: 18 }}>
          <div style={{ fontSize: 18, lineHeight: 1.55, color: NL.text, fontFamily: NL_FONT.sans }}>
            <Marked text={EXAMPLE.transcript} shown={shown} />
          </div>
        </Card>
        <div style={{ marginTop: 18, fontSize: 16, fontWeight: 600 }}>Fix anything that’s wrong</div>
        <div
          style={{
            marginTop: 8,
            minHeight: 96,
            borderRadius: 12,
            border: `1px solid ${NL.line}`,
            background: NL.bg,
            padding: "12px 14px",
            fontSize: 16,
            lineHeight: 1.5,
            color: NL.muted,
          }}
        >
          {EXAMPLE.transcript.slice(0, Math.min(shown, 70))}
          {shown > 70 ? "…" : ""}
        </div>
      </Page>
      <TopBar title="Check what you said" />
      <BottomBar>
        <Button variant="ghost">Say it again</Button>
        <Button pressed={press}>Write my quote</Button>
      </BottomBar>
    </>
  );
}
