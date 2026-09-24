"use client";

import type { CSSProperties } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { SPRING_SNAPPY } from "./motion";

/**
 * The sliding highlight behind the active nav tab (desktop header strip +
 * mobile bottom nav). Isolated into its own module and mounted via
 * `next/dynamic({ ssr: false })` from AppHeaderClient / MobileAppMenuClient
 * (Wave 46 perf pass) so framer-motion's shared-layout engine — needed only
 * for this cross-element slide (`layoutId` FLIP animation between two
 * differently-positioned tabs) — never ships in the initial JS for every
 * /app page. A CSS-only rewrite can't reproduce the slide between two
 * separate DOM nodes without measuring layout, so this one piece keeps
 * framer-motion, just off the critical path.
 *
 * Callers render a static, non-sliding fallback of the same size in their
 * `dynamic(..., { loading })` option so there's no layout shift while this
 * chunk loads.
 */
export function AnimatedTabPill({
  layoutId,
  className,
  style,
}: {
  layoutId: string;
  className: string;
  style?: CSSProperties;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.span
      layoutId={layoutId}
      aria-hidden="true"
      transition={reduce ? { duration: 0 } : SPRING_SNAPPY}
      className={className}
      style={style}
    />
  );
}
