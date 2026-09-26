"use client";
/* eslint-disable react-hooks/immutability -- React Three Fiber updates three.js objects (camera, materials, textures, overlay styles) in its frame loop, outside React render; that is how useFrame works. */

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { CanvasTexture, SRGBColorSpace } from "three";
import { PHONE } from "../layout";
import { phoneAwake } from "../timeline";
import { sceneState } from "./scene-state";
import { drawLockScreen, drawTalkScreen, readScreenFonts } from "./textures";
import type { ThreeLevel } from "./types";

/**
 * Scene 2: into the phone. The phone wakes as the camera comes through the
 * frame: someone is talking the job through, a waveform pulses, the words
 * appear. The camera pushes into the screen and a warm flash opens into
 * the first room of the house (page content, see ../HouseWalk.tsx).
 */

/** The phone's live screen (a canvas redrawn ~24 times a second while awake). */
export function PhoneScreen({ level }: { level: ThreeLevel }) {
  const invalidate = useThree((s) => s.invalidate);
  const screen = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = level === "full" ? 360 : 240;
    canvas.height = canvas.width * 2;
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    return { canvas, ctx: canvas.getContext("2d"), texture };
  }, [level]);
  const fonts = useMemo(() => readScreenFonts(), []);
  const clock = useRef(0);
  const lastDraw = useRef(-1);
  const wasAwake = useRef<boolean | null>(null);

  useLayoutEffect(() => {
    if (!screen.ctx) return;
    drawLockScreen(screen.ctx, screen.canvas.width, screen.canvas.height, fonts);
    screen.texture.needsUpdate = true;
  }, [screen, fonts]);
  useEffect(() => () => screen.texture.dispose(), [screen]);

  useFrame((_, delta) => {
    const { ctx, canvas, texture } = screen;
    if (!ctx) return;
    const awake = sceneState.space === "site" && phoneAwake(sceneState.located);
    if (awake) {
      clock.current += delta;
      if (wasAwake.current !== true || clock.current - lastDraw.current > 1 / 24) {
        drawTalkScreen(ctx, canvas.width, canvas.height, clock.current, fonts);
        texture.needsUpdate = true;
        lastDraw.current = clock.current;
      }
      invalidate();
    } else if (wasAwake.current === true) {
      drawLockScreen(ctx, canvas.width, canvas.height, fonts);
      texture.needsUpdate = true;
    }
    wasAwake.current = awake;
  });

  return (
    <mesh position={[0, 0, 0.0047]}>
      <planeGeometry args={[PHONE.width, PHONE.height]} />
      <meshBasicMaterial map={screen.texture} toneMapped={false} />
    </mesh>
  );
}
