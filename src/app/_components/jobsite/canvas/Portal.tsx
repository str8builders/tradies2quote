"use client";
/* eslint-disable react-hooks/immutability -- React Three Fiber updates three.js objects (camera, materials, textures, overlay styles) in its frame loop, outside React render; that is how useFrame works. */

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  Float32BufferAttribute,
  SRGBColorSpace,
  ShaderMaterial,
  Vector3,
  type Group,
} from "three";
import { PHONE, PORTAL_ORIGIN, TUNNEL } from "../layout";
import { phoneAwake } from "../timeline";
import { sceneState } from "./scene-state";
import { drawLockScreen, drawTalkScreen, readScreenFonts } from "./textures";
import type { ThreeLevel } from "./types";

/**
 * Scene 2: the phone portal. The phone wakes as the camera comes through
 * the frame: someone is talking the job through, a waveform pulses, the
 * words appear. The camera pushes into the screen, a warm flash covers
 * the cut, and it travels down a tunnel of waveform rings.
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

const VERTEX = /* glsl */ `
  attribute float aAngle;
  attribute float aRing;
  uniform float uTime;
  uniform float uAmp;
  varying float vDepth;
  varying float vAccent;
  void main() {
    float wave = sin(aAngle * 6.0 + uTime * 2.2 + aRing * 0.55) * sin(aAngle * 3.0 - uTime * 1.3 + aRing * 0.31);
    float r = ${TUNNEL.radius.toFixed(3)} + uAmp * wave;
    vec4 mv = modelViewMatrix * vec4(cos(aAngle) * r, sin(aAngle) * r, position.z, 1.0);
    vDepth = -mv.z;
    vAccent = 1.0 - step(0.5, mod(aRing, 6.0));
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uAccent;
  varying float vDepth;
  varying float vAccent;
  void main() {
    float fade = (1.0 - smoothstep(6.0, 46.0, vDepth)) * smoothstep(0.2, 1.4, vDepth);
    gl_FragColor = vec4(mix(uColor, uAccent, vAccent), fade);
  }
`;

/** The waveform tunnel inside the phone: rings that breathe like a voice. */
export function Tunnel({ level }: { level: ThreeLevel }) {
  const group = useRef<Group>(null);
  const invalidate = useThree((s) => s.invalidate);
  const rings = level === "full" ? TUNNEL.rings : 26;
  const segments = level === "full" ? 128 : 72;

  const geometry = useMemo(() => {
    const count = rings * segments * 2;
    const position = new Float32Array(count * 3);
    const angle = new Float32Array(count);
    const ring = new Float32Array(count);
    let v = 0;
    for (let r = 0; r < rings; r++) {
      const z = -r * TUNNEL.spacing * (TUNNEL.rings / rings);
      for (let s = 0; s < segments; s++) {
        for (const k of [s, s + 1]) {
          const a = (k / segments) * Math.PI * 2;
          position[v * 3] = Math.cos(a);
          position[v * 3 + 1] = Math.sin(a);
          position[v * 3 + 2] = z;
          angle[v] = a;
          ring[v] = r;
          v++;
        }
      }
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(position, 3));
    g.setAttribute("aAngle", new Float32BufferAttribute(angle, 1));
    g.setAttribute("aRing", new Float32BufferAttribute(ring, 1));
    return g;
  }, [rings, segments]);

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms: {
          uTime: { value: 0 },
          uAmp: { value: 0.14 },
          // Display colours: this shader writes them straight to the screen.
          uColor: { value: new Vector3(0.95, 0.93, 0.89) },
          uAccent: { value: new Vector3(1, 0.37, 0.08) },
        },
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    [],
  );
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useFrame((_, delta) => {
    const on = sceneState.space === "portal";
    if (group.current) group.current.visible = on;
    if (!on) return;
    material.uniforms.uTime.value += delta;
    invalidate();
  });

  return (
    <group ref={group} position={PORTAL_ORIGIN} visible={false}>
      <lineSegments geometry={geometry} material={material} frustumCulled={false} />
    </group>
  );
}
