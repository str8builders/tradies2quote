import type { Transition } from "framer-motion";

/**
 * App-shell motion language — ONE set of physics for every /app surface.
 *
 * Design intent (Wave 45 "dynamic app" pass): the app should feel like a
 * native iOS tool — quick, springy, never floaty. Three rules:
 *
 *   1. Everything shares these tokens. A tab pill, a sheet, and a page
 *      enter must all feel like the same material.
 *   2. Enter-only page transitions (~380ms) — exit animations on route
 *      change fight the App Router and read as lag.
 *   3. `useReducedMotion()` short-circuits every consumer to a plain
 *      opacity fade (or nothing) — no translate, no scale, no springs.
 *
 * The mobile shell contract (docs/mobile-shell-contract.md) still rules:
 * bottom-nav TABS never transform on press; the sliding pill is a separate
 * background element, which is why it's allowed to move.
 */

/** Snappy UI spring — tab pills, toggles, small indicators. */
export const SPRING_SNAPPY: Transition = {
  type: "spring",
  stiffness: 480,
  damping: 38,
  mass: 0.7,
};

/** Soft structural spring — sheets, cards, larger surfaces. */
export const SPRING_SOFT: Transition = {
  type: "spring",
  stiffness: 300,
  damping: 30,
  mass: 0.9,
};

/** Page/section enter — ease-out-quint, reads "settled" not "bouncy". */
export const EASE_ENTER: Transition = {
  duration: 0.38,
  ease: [0.22, 1, 0.36, 1],
};

/** Per-item stagger step for list/section cascades (seconds). */
export const STAGGER_STEP = 0.055;
