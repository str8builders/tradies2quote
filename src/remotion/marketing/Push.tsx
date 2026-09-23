import type { ReactNode } from "react";
import { easeInOut } from "./anim";

/**
 * iOS-style navigation push between two screens: the new screen slides in
 * from the right over the old one, which drifts left and dims. The screens
 * never overlap semi-transparently, so no frame shows doubled text.
 * `back` reverses the direction (a pop).
 */
export function Push({ p, from, to, back = false }: { p: number; from: ReactNode; to: ReactNode; back?: boolean }) {
  const e = easeInOut(Math.min(1, Math.max(0, p)));
  if (e <= 0) return <>{from}</>;
  if (e >= 1) return <>{to}</>;
  const dir = back ? -1 : 1;
  const under = back ? to : from;
  const over = back ? from : to;
  const overShift = back ? e * 100 : (1 - e) * 100;
  const underShift = back ? -(1 - e) * 30 : -e * 30;
  const dim = back ? 0.45 * (1 - e) : 0.45 * e;
  return (
    <>
      <div style={{ position: "absolute", inset: 0, transform: `translateX(${underShift}%)` }}>
        {under}
        <div style={{ position: "absolute", inset: 0, background: `rgba(0,0,0,${dim})`, zIndex: 90 }} />
      </div>
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `translateX(${overShift}%)`,
          boxShadow: `${-14 * dir}px 0 34px rgba(0,0,0,0.55)`,
          overflow: "hidden",
        }}
      >
        {over}
      </div>
    </>
  );
}
