"use client";

import { Canvas } from "@react-three/fiber";
import { useEffect } from "react";
import { CameraRig } from "./CameraRig";
import { DawnSite } from "./DawnSite";
import { Tunnel } from "./Portal";
import type { CanvasProps } from "./types";

/**
 * The one WebGL canvas behind the job-site story. It renders on demand:
 * a frame when the visitor scrolls, and continuously only while something
 * is animating (the phone's waveform, the tunnel). "full" adds shadows,
 * antialiasing and sharper rendering; "lite" is the phone version.
 */
export default function JobSiteCanvas({ level, layer, flash, onReady, onLost }: CanvasProps) {
  useEffect(() => () => onLost(), [onLost]);
  return (
    <Canvas
      frameloop="demand"
      dpr={level === "full" ? [1, 1.75] : [1, 1.25]}
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
      <Tunnel level={level} />
    </Canvas>
  );
}
