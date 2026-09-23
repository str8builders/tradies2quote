/**
 * The yellow tape-measure progress gauge (`TapeMeasureProgress` /
 * `src/app/_components/landing/TapeProgress.tsx`), used while transcribing
 * and while a quote is being written.
 */
import { FONT } from "../marketing/theme";

export function TapeGauge({ progress, label, width = 318 }: { progress: number; label?: string; width?: number }) {
  const p = Math.max(0, Math.min(1, progress));
  const ticks = Array.from({ length: 51 }, (_, i) => i);
  return (
    <div style={{ width }}>
      <div
        style={{
          position: "relative",
          height: 30,
          borderRadius: 5,
          overflow: "hidden",
          background: "linear-gradient(180deg, #FFD400 0%, #FFEA00 40%, #FFF26B 62%, #FFEA00 100%)",
          boxShadow: "inset 0 -2px 0 rgba(0,0,0,0.18), 0 0 18px rgba(255,234,0,0.18)",
        }}
      >
        {ticks.map((i) => {
          const major = i % 10 === 0;
          const mid = i % 5 === 0;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: `${(i / 50) * 100}%`,
                top: 0,
                width: major ? 1.6 : 1,
                height: major ? 14 : mid ? 10 : 6,
                background: "#0A0A0A",
                opacity: 0.85,
              }}
            />
          );
        })}
        {[25, 50, 75].map((n) => (
          <div
            key={n}
            style={{
              position: "absolute",
              left: `${n}%`,
              bottom: 2,
              transform: "translateX(-50%)",
              fontFamily: FONT.mono,
              fontSize: 8,
              fontWeight: 600,
              color: "#0A0A0A",
            }}
          >
            {n}
          </div>
        ))}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: `${p * 100}%`,
            background: "linear-gradient(90deg, rgba(255,95,21,0.85), rgba(255,95,21,0.55))",
            mixBlendMode: "multiply",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: `calc(${p * 100}% - 1px)`,
            top: -2,
            bottom: -2,
            width: 2,
            background: "#FF5F15",
            boxShadow: "0 0 10px #FF5F15",
          }}
        />
      </div>
      {label ? (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 8,
            fontFamily: FONT.mono,
            fontSize: 10,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
          }}
        >
          <span style={{ color: "#A8A8A8" }}>{label}</span>
          <span style={{ color: "#FFEA00" }}>{Math.round(p * 100)}mm / 100mm</span>
        </div>
      ) : null}
    </div>
  );
}
