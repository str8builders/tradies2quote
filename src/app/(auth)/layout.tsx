/**
 * Auth route-group layout. Pass-through — each page (`/login`, `/signup`,
 * `/forgot-password`, `/reset-password`) owns its own visual chrome.
 *
 * The earlier version of this file rendered a header + `max-w-md` shell
 * using semantic tokens (`bg-surface`, `border-border`, …) that aren't
 * declared in our Tailwind v4 `@theme` block, so the header rendered
 * unstyled in production. The split-screen login/signup shells are
 * full-bleed; the simpler forgot/reset-password pages center themselves
 * via the wrapper they already render. Centralising chrome here would
 * fight both layouts.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="studio-public studio-auth-pages">{children}</div>;
}
