# Mobile shell contract (iOS PWA safe-area)

**Status:** canonical. This is the known-good shell that fixed the white bottom-strip
regression. Treat it as locked. Change it only with the checklist at the bottom of this
file, and only after testing in installed Home-Screen mode on a real iPhone.

## Why this doc exists

The white strip under the bottom nav was **not** a one-component bug. It came from
changing the **shell architecture**: the canonical "fixed bottom nav + document scroll"
pattern was replaced by a `position: fixed; inset: 0` canvas that contained the scroll,
plus `html, body { overflow: hidden; height: 100% }`. On iOS standalone that fixed-inset
container resolves to the **safe-area** viewport, not the physical one, so it stopped
above the home-indicator zone and the background behind it showed through. Later commits
then **masked** the gap by forcing `html`/`body`/`--t2q-app-page` and the `/app`
`theme-color` to white — which is what made the strip visibly white.

The fix was to delete all of that and return to the canonical pattern. This doc records
it so we never re-derive it the hard way.

## The four owners (exactly one each)

There is exactly **one** owner for each paint/scroll concern. If you ever find two things
fighting over one of these, that is the bug.

| Concern | Single owner | Where it lives |
|---|---|---|
| **Root fallback paint** (what shows in any over-scroll / un-covered edge) | `html` / `body` — cream `#F5F4EE`, the same colour the splash uses | `globals.css` — `html:has([data-shell="app"]), body:has([data-shell="app"])` |
| **App page paint** (the page surface behind cards) | `.t2q-app-canvas` — grey `#F4F7FA` via `--t2q-app-page` | `globals.css` — `[data-shell="app"][data-theme="light"].t2q-app-canvas` |
| **Scrolling** | the **document** (root scroller); normal flow, no nested scroll container | `app/layout.tsx` canvas (`min-h-dvh`, no fixed positioning) |
| **Bottom safe-area paint** | `.t2q-bottomnav-bar` — `position: fixed; bottom: 0` + background + `padding-bottom: …env(safe-area-inset-bottom)` | `globals.css` — `.t2q-bottomnav-bar` base rule |

`.t2q-app-scroll` is **not** a scroll owner. It is the content wrapper, and its only
shell job is `padding-bottom: calc(4.05rem + env(safe-area-inset-bottom))` so content
clears the fixed nav. That `4.05rem` must stay equal to the nav's content height
(`.t2q-bottomnav-bar { min-height: calc(4.05rem + env(safe-area-inset-bottom)) }`).
It uses `overflow-x: clip` to prevent sideways page drift without creating another
scroll container. Never replace `clip` with `hidden`: CSS computes the other axis to
`auto`, which silently turns the wrapper into a nested scroller on mobile.

## Canonical pattern (do this)

1. **Viewport** comes from the Next.js App Router `viewport` export in
   `src/app/layout.tsx` — never hand-written `<meta name="viewport">` tags.
   - `viewportFit: "cover"` **must stay on** — `env(safe-area-inset-bottom)` is `0`
     without it, and the whole contract collapses.
   - `themeColor` is set **once** at the root (`#0A0A0A`, for the dark landing).
     `/app` does **not** re-declare `themeColor`.
2. **Canvas** (`.t2q-app-canvas`, the `data-shell="app"` element) is normal flow:
   `min-h-dvh`, no `position: fixed`, no `inset: 0`, and `overflow-x: clip` (never
   `hidden`).
3. **Bottom nav** (`.t2q-bottomnav-bar`) is the safe-area owner: `position: fixed;
   bottom: 0`, explicit background, `padding-bottom: …env(safe-area-inset-bottom)`.
4. **Scroll content** (`.t2q-app-scroll`) carries `padding-bottom = nav height +
   safe-area inset`. The document is the only scroller.
5. **Root fallback** (`html`/`body`) is painted the same colour as the splash, so any
   uncovered edge can never contrast.

## Banned patterns (do NOT do this)

- ❌ A full `/app` shell with `position: fixed; inset: 0` (the regression). Allowed only
  if **proven necessary by device testing**, documented here, and re-verified on iPhone.
- ❌ `html, body { overflow: hidden; height: 100% }` as a general shell scroll-lock.
- ❌ `overflow-x: hidden` on `.t2q-app-canvas` or `.t2q-app-scroll`; it creates an
  implicit cross-axis scroll container. Use `overflow-x: clip`.
- ❌ Forced white root/page backgrounds (`html`/`body`/`--t2q-app-page: #FFFFFF`) to
  "match the nav". That is masking — it just changes the strip's colour.
- ❌ Route-level `themeColor` overrides (e.g. an `/app` `theme-color: #FFFFFF`) as a
  safe-area fix. The OS chrome is not the bottom nav.
- ❌ A spacer / filler band / `::after` strip / overlay below the nav to "fill" the
  home-indicator zone. The nav's own `padding-bottom` already owns it.
- ❌ Hand-written duplicate `<meta name="viewport">` tags. Use the `viewport` export.
- ❌ A second `@media (max-width: 639px)` shell block. There must be exactly one.

## Files that define the shell contract

- **`src/app/layout.tsx`** — root `viewport` export (`viewportFit: cover`, root
  `themeColor`) and `appleWebApp` / `mobile-web-app-capable` PWA metadata.
- **`src/app/app/layout.tsx`** — the `/app` shell JSX: the `.t2q-app-canvas` page-paint
  element, the `.t2q-app-scroll` content/scroll-clearance wrapper, and the `<MobileAppMenu/>`
  nav mount.
- **`src/app/globals.css`** — the single `@media (max-width: 639px)` shell block, the
  `.t2q-bottomnav-bar` base rule (safe-area owner), the `html/body:has([data-shell="app"])`
  root paint, and the `.t2q-app-canvas` page paint.
- **`src/app/app/_components/MobileAppMenu*.tsx`** — renders the `.t2q-bottomnav-bar`
  with no inline positioning (so the base CSS rule governs it).

## Future-change checklist

Any change to the files above is a **shell change**. Before merging one, test all four
states — the regression passed three of them and only showed on the fourth:

- [ ] **Loading screen** — splash runs edge-to-edge, no strip at the bottom.
- [ ] **Dashboard / tab shell** — no seam/strip below the nav; nav flush to the edge.
- [ ] **Long scrolling page** (e.g. a long quote or Settings) — content clears the nav,
      scroll is smooth, no clipped last field, no nested-scroll jank.
- [ ] **Installed Home-Screen mode on a real iPhone** — the only test that reproduces
      safe-area rendering. A browser tab and `curl` cannot. This is the gate for promotion.

Before changing anything, confirm the four owners above each still have **exactly one**
owner afterward. If your change adds a second owner for any of them, it is wrong.

---

## Addendum — 2026-07-17: floating island nav

The bottom nav became a floating rounded island (user-requested mockup
parity): `left/right 0.75rem; margin-inline auto; max-width 26rem;
bottom: calc(env(safe-area-inset-bottom) + 0.75rem); min-height 4.15rem;
border-radius 1.6rem`, with a central circular orange "+" (`.t2q-bottomnav-plus`,
icon-only, aria-label "New quote").

Ownership change: the nav no longer paints the home-indicator zone — the
**root/canvas dark paint** (#0A0A0A, already asserted by the contract test)
owns the bottom edge, and the island floats above it. Same colour everywhere →
the white-strip regression remains impossible.

Geometry contract (mobile-shell-contract.test.ts asserts the starred rows):

| thing                         | value                                   |
|-------------------------------|-----------------------------------------|
| island claimed space          | 4.9rem + env(inset)  (0.75 lift + 4.15) |
| `.t2q-app-scroll` clearance ★ | 5.8rem + env(inset)  (+0.9 breathing)   |
| island geometry ★             | left/right 0.75rem, bottom env+0.75rem  |
| fixed sticky bars dock at     | 5.3rem + env(inset)  (+0.4 gap)         |

Sticky-bar call sites to keep in sync: `StickyActionBar.tsx`,
`SupplierBrowser.tsx`. Page-tail clearance beyond the shell padding is the
page's job (e.g. quote preview `<main>` adds `pb-24` for the StickyActionBar).
