/** Phone system surfaces around the app: a push banner and a browser bar. */
import { LockSimple } from "@phosphor-icons/react/dist/ssr";
import { C } from "../marketing/theme";

/** App icon: the T2Q mark on ink, as on the home screen. */
export function AppIcon({ size = 38 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.24,
        background: "linear-gradient(150deg, #1b1d1e, #0a0a0a)",
        border: "1px solid #ffffff1a",
        display: "grid",
        placeItems: "center",
        fontWeight: 800,
        fontSize: size * 0.34,
        letterSpacing: "-0.06em",
        color: "#fff",
      }}
    >
      <span>
        T<span style={{ color: C.brand }}>2</span>Q
      </span>
    </div>
  );
}

/** iOS-style notification banner sliding down from the top (`enter` 0..1). */
export function PushBanner({ title, body, enter }: { title: string; body: string; enter: number }) {
  if (enter <= 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: 10,
        right: 10,
        top: 52,
        zIndex: 70,
        transform: `translateY(${(1 - enter) * -140}px)`,
        opacity: Math.min(1, enter * 1.5),
        borderRadius: 24,
        background: "rgba(44, 46, 46, 0.9)",
        border: "1px solid #ffffff1c",
        boxShadow: "0 18px 40px rgba(0,0,0,0.5)",
        padding: "12px 14px",
        display: "flex",
        gap: 12,
        alignItems: "center",
      }}
    >
      <AppIcon size={38} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{title}</div>
          <div style={{ fontSize: 12, color: "#b9bcbc" }}>now</div>
        </div>
        <div style={{ marginTop: 2, fontSize: 13.5, lineHeight: 1.35, color: "#e8eaea" }}>{body}</div>
      </div>
    </div>
  );
}

/** Mobile Safari's bottom address bar, so the client's view reads as a web page. */
export function BrowserBar({ host }: { host: string }) {
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: 86,
        zIndex: 55,
        background: "rgba(24, 24, 24, 0.94)",
        borderTop: "1px solid #ffffff12",
        display: "flex",
        justifyContent: "center",
        paddingTop: 10,
      }}
    >
      <div
        style={{
          width: 330,
          height: 44,
          borderRadius: 14,
          background: "#2c2c2e",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          fontSize: 15,
          fontWeight: 500,
          color: "#f2f2f2",
        }}
      >
        <LockSimple size={13} weight="fill" color="#bdbdbd" />
        {host}
      </div>
    </div>
  );
}
