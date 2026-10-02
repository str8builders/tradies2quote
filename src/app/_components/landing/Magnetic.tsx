"use client";

import { useRef, type ReactNode } from "react";

/**
 * Magnetic wrapper — children translate slightly toward the cursor on hover.
 * Used for primary CTAs to give them a premium feel without committing to a
 * full Framer Motion animation. Pure DOM, no extra deps.
 *
 * Ported from the Emergent landing-export bundle to TSX. Wraps a single
 * child and forwards pointer events to the wrapping span. Disabled on
 * touch devices automatically — `onPointerMove` only fires for fine
 * pointers, so the inner transform stays at 0,0,0 on phones.
 */
type Props = {
  children: ReactNode;
  /** How far children slide toward the cursor. 0.25 ≈ Emergent default. */
  strength?: number;
  className?: string;
};

export function Magnetic({ children, strength = 0.25, className = "" }: Props) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const innerRef = useRef<HTMLSpanElement>(null);

  function onMove(e: React.PointerEvent<HTMLSpanElement>) {
    const wrap = wrapRef.current;
    const inner = innerRef.current;
    if (!wrap || !inner) return;
    const r = wrap.getBoundingClientRect();
    const x = e.clientX - (r.left + r.width / 2);
    const y = e.clientY - (r.top + r.height / 2);
    inner.style.transform = `translate3d(${x * strength}px, ${y * strength}px, 0)`;
  }

  function onLeave() {
    const inner = innerRef.current;
    if (!inner) return;
    inner.style.transform = "translate3d(0,0,0)";
  }

  return (
    <span
      ref={wrapRef}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className={`inline-block ${className}`}
    >
      <span
        ref={innerRef}
        className="inline-block will-change-transform"
        style={{ transition: "transform 240ms cubic-bezier(.21,.6,.27,1)" }}
      >
        {children}
      </span>
    </span>
  );
}
