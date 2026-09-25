"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  BackSide,
  Color,
  Float32BufferAttribute,
  Matrix4,
  SphereGeometry,
  type DirectionalLight,
  type Group,
  type InstancedMesh,
} from "three";
import { PHONE, SAWHORSE } from "../layout";
import { frameMembers } from "./frame";
import { PhoneScreen } from "./Portal";
import { sceneState } from "./scene-state";
import { memberMatrix, seeded, slabTexture, woodTexture } from "./textures";
import type { ThreeLevel } from "./types";

const FOG = "#d49a73";

/**
 * Scene 1: a quiet New Zealand building site at first light. A concrete
 * slab, a half-built 90 × 45 frame at 600 centres, a few rafters, a
 * sawhorse with a phone propped on it, and a low sun throwing long
 * shadows through the studs. All of it is drawn here: no models, no
 * photos, one draw call for every piece of timber.
 */
export function DawnSite({ level }: { level: ThreeLevel }) {
  const group = useRef<Group>(null);
  useFrame(() => {
    if (group.current) group.current.visible = sceneState.space !== "portal";
  });
  return (
    <>
      <fog attach="fog" args={[FOG, 16, 62]} />
      <group ref={group}>
        <Sky />
        <Light level={level} />
        <Ground level={level} />
        <Timber level={level} />
        <Phone level={level} />
        <TapeMeasure />
      </group>
    </>
  );
}

/** A dawn dome whose horizon is the fog colour, so the ground fades into it. */
function Sky() {
  const geometry = useMemo(() => {
    const g = new SphereGeometry(150, 32, 20);
    const zenith = new Color("#141a2b");
    const mid = new Color("#4a3d4f");
    const horizon = new Color(FOG);
    const below = new Color("#6b4f3f");
    const pos = g.attributes.position;
    const col = new Color();
    const out: number[] = [];
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 150;
      if (y < 0) col.copy(horizon).lerp(below, Math.min(1, -y * 4));
      else if (y < 0.18) col.copy(horizon).lerp(mid, y / 0.18);
      else col.copy(mid).lerp(zenith, Math.min(1, (y - 0.18) / 0.5));
      out.push(col.r, col.g, col.b);
    }
    g.setAttribute("color", new Float32BufferAttribute(out, 3));
    return g;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} renderOrder={-1}>
      <meshBasicMaterial vertexColors side={BackSide} fog={false} depthWrite={false} />
    </mesh>
  );
}

/** Low sun from the left, beyond the wall, so shadows run back towards the camera. */
function Light({ level }: { level: ThreeLevel }) {
  const sun = useRef<DirectionalLight>(null);
  useLayoutEffect(() => {
    sun.current?.shadow.camera.updateProjectionMatrix();
  }, []);
  return (
    <>
      <hemisphereLight args={["#9fb0d8", "#3a2e24", 0.9]} />
      <directionalLight
        ref={sun}
        position={[-10, 3.6, 6]}
        color="#ffc893"
        intensity={3.2}
        castShadow={level === "full"}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={7}
        shadow-camera-bottom={-7}
        shadow-camera-near={1}
        shadow-camera-far={32}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
    </>
  );
}

function Ground({ level }: { level: ThreeLevel }) {
  const slab = useMemo(() => slabTexture(level === "full" ? 1024 : 512), [level]);
  useEffect(() => () => slab.dispose(), [slab]);
  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.1, 0]} receiveShadow>
        <planeGeometry args={[160, 160]} />
        <meshStandardMaterial color="#3a3129" roughness={1} />
      </mesh>
      {/* 8.6 × 8.9 m slab, 100 mm proud of the ground, top at y = 0 */}
      <mesh position={[0, -0.05, 4.1]} receiveShadow>
        <boxGeometry args={[8.6, 0.1, 8.9]} />
        <meshStandardMaterial attach="material-0" color="#77736c" roughness={1} />
        <meshStandardMaterial attach="material-1" color="#77736c" roughness={1} />
        <meshStandardMaterial attach="material-2" map={slab} roughness={0.95} />
        <meshStandardMaterial attach="material-3" color="#77736c" roughness={1} />
        <meshStandardMaterial attach="material-4" color="#77736c" roughness={1} />
        <meshStandardMaterial attach="material-5" color="#77736c" roughness={1} />
      </mesh>
    </>
  );
}

function Timber({ level }: { level: ThreeLevel }) {
  const members = useMemo(() => frameMembers(), []);
  const wood = useMemo(() => woodTexture(level === "full" ? 512 : 256), [level]);
  const mesh = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const matrix = new Matrix4();
    const tint = new Color();
    const rand = seeded(11);
    members.forEach((member, i) => {
      m.setMatrixAt(i, memberMatrix(member, matrix));
      const k = 0.88 + rand() * 0.18;
      m.setColorAt(i, tint.setRGB(k, k * 0.97, k * 0.93));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [members]);
  useEffect(() => () => wood.dispose(), [wood]);
  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, members.length]}
      castShadow={level === "full"}
      receiveShadow={level === "full"}
      frustumCulled={false}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial map={wood} roughness={0.82} />
    </instancedMesh>
  );
}

/** The phone, propped on the offcut and leaning back, screen towards the wall. */
function Phone({ level }: { level: ThreeLevel }) {
  const lean = (PHONE.leanDeg * Math.PI) / 180;
  return (
    <group position={PHONE.centre} rotation={[-lean, Math.PI, 0, "YXZ"]}>
      <mesh castShadow={level === "full"}>
        <boxGeometry args={[PHONE.width + 0.004, PHONE.height + 0.004, 0.009]} />
        <meshStandardMaterial color="#1c1c1f" roughness={0.35} metalness={0.4} />
      </mesh>
      <PhoneScreen level={level} />
    </group>
  );
}

/** A hi-vis tape measure on the sawhorse, for scale. */
function TapeMeasure() {
  const y = SAWHORSE.beamTop;
  return (
    <group position={[SAWHORSE.x + 0.32, y, SAWHORSE.z]}>
      <mesh position={[0, 0.035, 0]} rotation-y={0.3}>
        <boxGeometry args={[0.075, 0.07, 0.036]} />
        <meshStandardMaterial color="#ffd400" roughness={0.5} />
      </mesh>
      <mesh position={[-0.19, 0.001, 0.005]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[0.3, 0.019]} />
        <meshStandardMaterial color="#f2d54a" roughness={0.6} />
      </mesh>
    </group>
  );
}
