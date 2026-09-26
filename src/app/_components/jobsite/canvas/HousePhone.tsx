"use client";
/* eslint-disable react-hooks/immutability -- React Three Fiber updates three.js objects (the phone, its materials and textures, the layer's style) in its frame loop, outside React render; that is how useFrame works. */

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import {
  DirectionalLight,
  PMREMGenerator,
  type Camera,
  type Group,
  type PerspectiveCamera,
  type Texture,
  type WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { blendSlots, containIn, walkAt, type Box } from "../house-walk";
import { STUDIO } from "../layout";
import { ROOMS } from "../story";
import { BODY, BODY_ASPECT, buildPhone, type PhoneModel } from "./phone-model";
import { sceneState } from "./scene-state";
import { StepScreens } from "./step-screens";
import type { CanvasProps } from "./types";

/** Seconds for the turn from one room's step to the next. */
const SPIN_S = 1.1;
/** At rest the screen turns a little towards the words beside it. */
const REST_YAW = -0.3;
const easeInOut = (s: number) => (s < 0.5 ? 4 * s * s * s : 1 - Math.pow(-2 * s + 2, 3) / 2);
const NOWHERE: Box = { left: 0, top: 0, width: 0, height: 0 };

type Spin = { start: number; dir: 1 | -1; swapped: boolean };

type Rig = {
  /** The component's group: the lights and the phone are added to it. */
  group: Group;
  env: Texture;
  model: PhoneModel;
  screens: StepScreens;
  rooms: HTMLElement[];
  slots: (HTMLElement | null)[];
  /** The room whose step is on the screen, the room you're in, the room whose clip is playing (-1: none). */
  shown: number;
  want: number;
  playing: number;
  spin: Spin | null;
  onScreen: boolean;
};

function boxOf(el: HTMLElement | null): Box {
  if (!el) return NOWHERE;
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

/** Builds the phone once the house is close, so visitors who never get there never pay for it. */
function buildRig(gl: WebGLRenderer, camera: Camera, group: Group, width: 600 | 420, redraw: () => void): Rig {
  const pmrem = new PMREMGenerator(gl);
  const room = new RoomEnvironment();
  const env = pmrem.fromScene(room, 0.04).texture;
  room.dispose();
  pmrem.dispose();

  const screens = new StepScreens(width, redraw);
  const model = buildPhone(env, screens.blank);
  // A soft key light, a warm orange rim along the edge, a cool fill from below.
  const lights: Array<[string, number, [number, number, number]]> = [
    ["#ffffff", 1.7, [2.2, 3, 5]],
    ["#ff7a33", 2.4, [3, 1.2, -2.2]],
    ["#9fb4ff", 0.45, [-3, -1, 2.5]],
  ];
  for (const [color, intensity, [x, y, z]] of lights) {
    const light = new DirectionalLight(color, intensity);
    light.position.set(x, y, z);
    group.add(light, light.target);
  }
  group.add(model.anchor);

  // Compile the phone's shaders now, under its own lights, rather than on
  // the frame it first appears. (Lights only count when visible.)
  const was = group.visible;
  group.visible = true;
  gl.compile(group, camera);
  group.visible = was;

  const rooms = Array.from(document.querySelectorAll<HTMLElement>("[data-room]"));
  return {
    group,
    env,
    model,
    screens,
    rooms,
    slots: rooms.map((el) => el.querySelector<HTMLElement>("[data-phone-slot]")),
    shown: 0,
    want: 0,
    playing: -1,
    spin: null,
    onScreen: false,
  };
}

function offScreen(rig: Rig) {
  rig.onScreen = false;
  rig.spin = null;
  if (rig.playing !== -1) {
    rig.screens.pauseAll();
    rig.playing = -1;
  }
}

/**
 * Inside the house: a real phone floating in each room, playing that step
 * of the job (Talk, Draft, Check, Send, Invoice). The page decides where:
 * each room has an empty phone slot beside its words, and the phone floats
 * over the slot of the room you're in, riding in with the first room and
 * away with the last. Walking into the next room turns it round; the
 * screen changes while its back is to you and the new step plays from the
 * start. It sways gently while you read.
 */
export function HousePhone({
  level,
  layer,
  onHouse,
}: Pick<CanvasProps, "level" | "layer"> & {
  /** The camera moved into the house or back out to the site (the canvas draws sharper in the house). */
  onHouse: (inHouse: boolean) => void;
}) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const invalidate = useThree((s) => s.invalidate);
  const root = useRef<Group>(null);
  const rig = useRef<Rig | null>(null);
  const housed = useRef(false);

  useEffect(
    () => () => {
      const r = rig.current;
      rig.current = null;
      housed.current = false;
      if (!r) return;
      r.group.clear();
      r.screens.dispose();
      r.model.dispose();
      r.env.dispose();
    },
    [],
  );

  useFrame((state) => {
    const group = root.current;
    if (!group) return;
    const where = sceneState.located;
    const near =
      where.scene === "house" || where.scene === "details" || (where.scene === "portal" && where.t > 0.25);
    if (!rig.current && near) rig.current = buildRig(gl, camera, group, level === "full" ? 600 : 420, invalidate);
    const r = rig.current;
    const inHouse = sceneState.space === "house";

    if (inHouse !== housed.current) {
      housed.current = inHouse;
      onHouse(inHouse);
    }
    if (!r || !inHouse) {
      group.visible = false;
      if (r?.onScreen) offScreen(r);
      return;
    }

    // Where the rooms are, and where this frame's phone slot is.
    const walk = walkAt(
      r.rooms.map((el) => el.getBoundingClientRect().top),
      window.innerHeight,
    );
    const slot = blendSlots(
      r.slots.map((el, i) => (i === 0 || walk.enter[i] > 0 ? boxOf(el) : NOWHERE)),
      walk.enter,
    );
    const canvas = state.gl.domElement.getBoundingClientRect();
    const fit = slot ? containIn(slot, BODY_ASPECT, "bottom") : null;
    const seen = fit !== null && fit.height > 40 && fit.top < canvas.bottom && fit.top + fit.height > canvas.top;
    const fade = seen ? walk.enter[0] : 0;
    const el = layer.current;
    if (el) {
      el.style.opacity = fade.toFixed(3);
      el.style.visibility = fade > 0.001 ? "visible" : "hidden";
    }
    if (!fit || fade <= 0.001) {
      group.visible = false;
      if (r.onScreen) offScreen(r);
      return;
    }
    group.visible = true;

    // Float over the slot: the studio camera looks straight at the phone,
    // so a pixel on the page is a fixed size at the phone's distance.
    const perPx = (2 * STUDIO.distance * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, canvas.height);
    const cx = fit.left + fit.width / 2 - canvas.left;
    const cy = fit.top + fit.height / 2 - canvas.top;
    r.model.anchor.position.set((cx - canvas.width / 2) * perPx, (canvas.height / 2 - cy) * perPx, 0);
    r.model.anchor.scale.setScalar((fit.height * perPx) / BODY.height);

    // Which step is on the screen: straight on when the phone appears, a turn between rooms.
    const t = state.clock.elapsedTime;
    const want = Math.max(0, walk.active);
    const prepare = (i: number) => {
      r.screens.prepare(ROOMS[i].id);
      if (i + 1 < ROOMS.length) r.screens.prepare(ROOMS[i + 1].id);
    };
    if (!r.onScreen) {
      r.onScreen = true;
      r.shown = want;
      r.want = want;
      r.spin = null;
      prepare(want);
    }
    if (want !== r.want) {
      r.want = want;
      prepare(want);
      if (!r.spin) r.spin = { start: t, dir: want > r.shown ? 1 : -1, swapped: false };
    }
    let turn = 0;
    let facingAway = false;
    if (r.spin) {
      const s = Math.min(1, (t - r.spin.start) / SPIN_S);
      const e = easeInOut(s);
      turn = r.spin.dir * e * Math.PI * 2;
      facingAway = e > 0.25 && e < 0.75;
      // A quarter of the way round the screen is edge-on: change it then, to wherever you are now.
      if (!r.spin.swapped && e >= 0.25) {
        r.spin.swapped = true;
        r.shown = r.want;
      }
      if (s >= 1) r.spin = r.shown !== r.want ? { start: t, dir: r.want > r.shown ? 1 : -1, swapped: false } : null;
    }

    // Play the step once you're in its room and the screen faces you.
    if (walk.active < 0) {
      if (r.playing !== -1) {
        r.screens.pauseAll();
        r.playing = -1;
      }
    } else if (!facingAway && r.playing !== r.shown) {
      r.screens.pauseAll();
      r.screens.play(ROOMS[r.shown].id);
      r.playing = r.shown;
    }
    r.model.screen.map = r.screens.texture(ROOMS[r.shown].id);

    // The float: a slow bob and sway, turned a little towards the words.
    const yaw = REST_YAW + Math.sin(t * 0.5) * 0.08 + turn;
    r.model.body.rotation.set(-0.05 + Math.sin(t * 0.77 + 1.2) * 0.03, yaw, 0.03 + Math.sin(t * 0.61 + 0.4) * 0.018);
    r.model.body.position.y = Math.sin(t * 1.1) * 0.014;
    r.model.shade.scale.x = 0.55 + 0.45 * Math.abs(Math.cos(yaw));
    invalidate();
  });

  return <group ref={root} position={STUDIO.centre} visible={false} />;
}
