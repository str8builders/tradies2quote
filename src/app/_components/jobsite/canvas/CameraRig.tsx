"use client";
/* eslint-disable react-hooks/immutability -- React Three Fiber updates three.js objects (camera, materials, textures, overlay styles) in its frame loop, outside React render; that is how useFrame works. */

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { Vector3, type PerspectiveCamera } from "three";
import { scrollStore } from "../scroll-store";
import { damp, fovFor, locatedAt, progressOf, shotAt } from "../timeline";
import { sceneState } from "./scene-state";
import type { CanvasProps } from "./types";

/**
 * The camera is the main character. It follows the scroll through the
 * master timeline, easing the journey (not its position) so it glides
 * along the route and never cuts through timber. It also drives the flash
 * into the phone and hides the 3D once the flash covers it, and only asks
 * for new frames while something is moving.
 */
export function CameraRig({ level, layer, flash, onReady }: Pick<CanvasProps, "level" | "layer" | "flash" | "onReady">) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const invalidate = useThree((s) => s.invalidate);
  const progress = useRef<number | null>(null);
  const look = useRef(new Vector3());
  const told = useRef(false);

  useEffect(() => {
    sceneState.space = null;
    scrollStore.start();
    const off = scrollStore.subscribe(() => invalidate());
    invalidate();
    return () => {
      off();
      scrollStore.stop();
    };
  }, [invalidate]);

  useFrame((state, delta) => {
    const target = progressOf(scrollStore.located);
    const lambda = level === "full" ? 3.2 : 4.5;
    const eased = progress.current === null ? target : damp(progress.current, target, lambda, Math.min(delta, 0.1));
    progress.current = Math.abs(eased - target) < 1e-4 ? target : eased;

    const located = locatedAt(progress.current);
    const shot = shotAt(located);
    camera.position.set(shot.pos[0], shot.pos[1], shot.pos[2]);
    camera.lookAt(look.current.set(shot.look[0], shot.look[1], shot.look[2]));
    const fov = fovFor(state.size.width / Math.max(1, state.size.height));
    if (camera.fov !== fov) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }

    sceneState.space = shot.space;
    sceneState.located = located;

    if (flash.current) flash.current.style.opacity = shot.flash.toFixed(3);
    if (layer.current) {
      layer.current.style.opacity = (1 - shot.fade).toFixed(3);
      layer.current.style.visibility = shot.fade >= 1 ? "hidden" : "visible";
    }

    if (progress.current !== target) invalidate();
    if (!told.current) {
      told.current = true;
      onReady();
    }
  });

  return null;
}
