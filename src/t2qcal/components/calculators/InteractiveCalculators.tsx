"use client";
import type { ToolEntry } from "@/t2qcal/lib/tools";
import { VerifiedCalculator } from "./VerifiedCalculator";

/**
 * Every calculator renders through the shared definition-driven screen. The
 * eight bespoke screens this file used to hold (rafter, stairs, spacing,
 * slab, tile, arc, converter, pitch) computed with older web formulas; the
 * native-parity definitions now drive them, with the native sheet list.
 */
export function InteractiveCalculator({ tool }: { tool: ToolEntry }) {
  return <VerifiedCalculator tool={tool} />;
}
