import type { CSSProperties } from "react";

/**
 * StaggerIn — cascades a server-rendered section onto the page.
 *
 * Wave 45 "dynamic app" pass; pages wrap each section in
 * `<StaggerIn index={n}>` and the sections rise in sequence
 * (index × 55ms) with the same ease-out-quint as the route transition.
 *
 * 2026-07-17 — converted from framer-motion to the CSS `.t2q-stagger`
 * animation (globals.css). The framer version shipped `opacity:0` in the
 * server HTML and waited for hydration to animate — on a cold launch the
 * dashboard's sections (weather, work board, calendar) were INVISIBLE
 * until the JS arrived, which users read as "everything is missing".
 * CSS runs at first paint, needs no JavaScript, and if it can't run the
 * content simply shows. No hooks left, so this is now a server
 * component: zero bytes of client JS for the cascade.
 *
 * Reduced motion is honored in the stylesheet (@media rule disables the
 * animation; `both` fill never applies, content renders instantly).
 */
export function StaggerIn({
  index = 0,
  className,
  children,
}: {
  /** Position in the cascade — delay is index × 55ms. */
  index?: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={className ? `t2q-stagger ${className}` : "t2q-stagger"}
      style={{ "--t2q-stagger-i": index } as CSSProperties}
    >
      {children}
    </div>
  );
}
