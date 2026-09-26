import type { RefObject } from "react";

/** The two levels that get a 3D canvas (see ../level.ts). */
export type ThreeLevel = "full" | "lite";

/** How sharp the canvas draws (min and max device pixel ratio): the site's cost scales with it. */
export const SITE_DPR: Record<ThreeLevel, [number, number]> = { full: [1, 1.75], lite: [1, 1.25] };
/** Inside the house only the small floating phone is drawn, so it can be sharp everywhere. */
export const HOUSE_DPR: [number, number] = [1, 2];

export type CanvasProps = {
  level: ThreeLevel;
  /** The fixed layer holding the canvas; the rig fades it into the flash, the house phone fades it after. */
  layer: RefObject<HTMLDivElement | null>;
  /** The warm flash overlay that hides the cut into the phone. */
  flash: RefObject<HTMLDivElement | null>;
  /** First frame drawn: the still poster can fade out. */
  onReady: () => void;
  /** The canvas went away (level changed or motion paused). */
  onLost: () => void;
};
