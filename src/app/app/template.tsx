import { isNewLookOn } from "@/lib/ui/newLook";

/**
 * New look (redesign phase 2): a 200 ms fade, opacity only — the kit's
 * motion rule (transform/opacity, 250 ms or less, none for reduced motion).
 * With no transform on the wrapper, fixed parts inside a page (toasts, a
 * fixed save bar) stay pinned to the screen while the page comes in.
 */
const NEW_LOOK_ENTER = "animate-ui-fade-in motion-reduce:animate-none";

/**
 * /app route-change transition (Wave 45 "dynamic app" pass).
 *
 * Next re-mounts a `template.tsx` on every navigation inside the segment,
 * which makes it the one sanctioned place for a page-enter animation:
 * each tab/page rises 12px and fades in with the shared ease-out-quint.
 * Enter-only by design — exit animations fight the App Router's eager
 * rendering and read as latency, not polish.
 *
 * 2026-07-17 — converted from framer-motion to the CSS `.t2q-page-enter`
 * animation (globals.css). The framer version serialized `opacity:0`
 * into the server HTML and only became visible after the JS bundle
 * hydrated — on a cold launch the whole page rendered INVISIBLE for
 * seconds (or forever, if hydration stalled). CSS starts at first paint
 * with no JS dependency, and its failure mode is "content just shows".
 * This also drops framer-motion from every /app page's critical path
 * and lets the template be a server component (less JS, same motion).
 * Reduced motion is honored in the stylesheet, not per-component.
 *
 * Shell-contract note (docs/mobile-shell-contract.md): this wrapper is
 * normal document flow inside `.t2q-app-scroll` — it owns no scroll, no
 * paint, no safe-area. While the ~380ms enter transform is live, `fixed`
 * descendants (StickyActionBar) are positioned against the wrapper and
 * ride in with the page — intended. The keyframe ends at
 * `transform: none`, so fixed positioning is back to the viewport at
 * rest, exactly like framer's transform removal was.
 */
export default async function AppTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  if (await isNewLookOn()) return <div className={NEW_LOOK_ENTER}>{children}</div>;
  return <div className="t2q-page-enter">{children}</div>;
}
