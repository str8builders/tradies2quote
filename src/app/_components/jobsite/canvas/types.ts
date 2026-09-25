import type { RefObject } from "react";

/** The two levels that get a 3D canvas (see ../level.ts). */
export type ThreeLevel = "full" | "lite";

export type CanvasProps = {
  level: ThreeLevel;
  /** The fixed layer holding the canvas; the rig fades it at the end of the tunnel. */
  layer: RefObject<HTMLDivElement | null>;
  /** The warm flash overlay that hides the cut into the phone. */
  flash: RefObject<HTMLDivElement | null>;
  /** First frame drawn: the still poster can fade out. */
  onReady: () => void;
  /** The canvas went away (level changed or motion paused). */
  onLost: () => void;
};
