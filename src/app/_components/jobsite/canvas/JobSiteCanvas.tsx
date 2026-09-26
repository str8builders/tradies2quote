"use client";

import { Canvas } from "@react-three/fiber";
import { useEffect, useState } from "react";
import { CameraRig } from "./CameraRig";
import { DawnSite } from "./DawnSite";
import { HousePhone } from "./HousePhone";
import { HOUSE_DPR, SITE_DPR, type CanvasProps } from "./types";

/**
 * The one WebGL canvas behind the job-site story: the dawn site, then the
 * phone floating through the house. It renders on demand: a frame when the
 * visitor scrolls, and continuously only while something is animating (the
 * sawhorse phone's waveform, the floating phone). "full" adds shadows,
 * antialiasing and sharper rendering; "lite" is the phone version.
 */
export default function JobSiteCanvas({ level, layer, flash, onReady, onLost }: CanvasProps) {
  useEffect(() => () => onLost(), [onLost]);
  // Inside the house only the small floating phone is drawn, so draw it
  // sharp. (A prop, not setDpr: the Canvas re-applies its dpr prop on every render.)
  const [inHouse, setInHouse] = useState(false);
  return (
    <Canvas
      frameloop="demand"
      dpr={inHouse ? HOUSE_DPR : SITE_DPR[level]}
      shadows={level === "full" ? "soft" : false}
      gl={{ antialias: level === "full", powerPreference: "high-performance" }}
      camera={{ fov: 45, near: 0.05, far: 260, position: [1.4, 1.8, -7.8] }}
      style={{ position: "absolute", inset: 0 }}
      onCreated={({ gl }) => {
        gl.toneMappingExposure = 1.15;
      }}
    >
      <CameraRig level={level} layer={layer} flash={flash} onReady={onReady} />
      <DawnSite level={level} />
      <HousePhone level={level} layer={layer} onHouse={setInHouse} />
    </Canvas>
  );
}
