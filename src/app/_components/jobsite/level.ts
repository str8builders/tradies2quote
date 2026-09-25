/**
 * How much 3D a visitor gets on the job-site website.
 *
 *   full  — the whole world: shadows, antialiasing, sharper rendering.
 *   lite  — phones and older machines: no shadows, lower resolution,
 *           fewer tunnel rings. Same story, same camera.
 *   still — no WebGL, reduced motion, "Pause background motion", data
 *           saver or a low-end device: drawn stills and the HTML story.
 */
export type Level = "full" | "lite" | "still";

export type LevelInput = {
  /** A hardware-accelerated WebGL context is available. */
  webgl: boolean;
  /** The OS asks for reduced motion. */
  reducedMotion: boolean;
  /** The site's own "Pause background motion" choice. */
  motionPaused: boolean;
  /** navigator.connection.saveData */
  saveData: boolean;
  /** navigator.connection.effectiveType ("4g", "3g", "2g", "slow-2g"). */
  effectiveType?: string;
  /** navigator.deviceMemory, in GB (Chromium only). */
  deviceMemory?: number;
  /** navigator.hardwareConcurrency */
  cores?: number;
  /** (pointer: coarse) — a phone or tablet. */
  coarsePointer: boolean;
  viewportWidth: number;
};

export function chooseLevel(i: LevelInput): Level {
  if (!i.webgl || i.reducedMotion || i.motionPaused || i.saveData) return "still";
  if (i.effectiveType === "2g" || i.effectiveType === "slow-2g") return "still";
  if ((i.deviceMemory !== undefined && i.deviceMemory <= 2) || (i.cores !== undefined && i.cores <= 2)) {
    return "still";
  }
  if (
    i.coarsePointer ||
    i.viewportWidth < 768 ||
    i.effectiveType === "3g" ||
    (i.deviceMemory !== undefined && i.deviceMemory <= 4)
  ) {
    return "lite";
  }
  return "full";
}

let webglProbe: boolean | undefined;

/** A real GPU context, not a software fallback. Probed once per page. */
function hasHardwareWebGL(): boolean {
  if (webglProbe !== undefined) return webglProbe;
  try {
    const canvas = document.createElement("canvas");
    const options: WebGLContextAttributes = { failIfMajorPerformanceCaveat: true };
    const gl: WebGL2RenderingContext | WebGLRenderingContext | null =
      canvas.getContext("webgl2", options) ?? canvas.getContext("webgl", options);
    webglProbe = gl !== null;
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    webglProbe = false;
  }
  return webglProbe;
}

type NavigatorExtras = Navigator & {
  connection?: { saveData?: boolean; effectiveType?: string };
  deviceMemory?: number;
};

/** Read the browser's capabilities for chooseLevel. Client only. */
export function readLevelInput(motionPaused: boolean): LevelInput {
  const nav = navigator as NavigatorExtras;
  return {
    webgl: hasHardwareWebGL(),
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    motionPaused,
    saveData: nav.connection?.saveData === true,
    effectiveType: nav.connection?.effectiveType,
    deviceMemory: nav.deviceMemory,
    cores: nav.hardwareConcurrency || undefined,
    coarsePointer: window.matchMedia("(pointer: coarse)").matches,
    viewportWidth: window.innerWidth,
  };
}
