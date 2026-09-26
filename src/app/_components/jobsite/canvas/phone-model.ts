import {
  BufferGeometry,
  CanvasTexture,
  CapsuleGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Shape,
  ShapeGeometry,
  type Texture,
} from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * The floating phone inside the house, drawn from primitives like the rest
 * of the site: a black-titanium body with a rounded edge, a black glass
 * front, a frosted back with the camera bump, the side buttons, and a screen
 * that plays the step's clip. Units are the screen's height (the screen is
 * the demo's 390 × 844, so the clips fit exactly).
 */
export const SCREEN = { width: 390 / 844, height: 1, radius: 55 / 844 } as const;
const BEZEL = 0.022;
export const BODY = {
  width: SCREEN.width + 2 * BEZEL,
  height: SCREEN.height + 2 * BEZEL,
  depth: 0.058,
  radius: 0.078,
} as const;
/** Width / height of the whole phone. The page's phone slot uses the same number (jobsite.css). */
export const BODY_ASPECT = BODY.width / BODY.height;
/** The rounded edge: how far it curves in (x/y) and how deep it runs (z). */
export const EDGE = { size: 0.012, thickness: 0.02 } as const;

/** A rounded rectangle centred on the origin. */
export function roundedRect(width: number, height: number, radius: number): Shape {
  const x = -width / 2;
  const y = -height / 2;
  const r = Math.min(radius, width / 2, height / 2);
  const s = new Shape();
  s.moveTo(x + r, y);
  s.lineTo(x + width - r, y);
  s.absarc(x + width - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + width, y + height - r);
  s.absarc(x + width - r, y + height - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + height);
  s.absarc(x + r, y + height - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r);
  s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

/** The screen, with its texture spread corner to corner (0–1 in both directions). */
export function screenGeometry(): ShapeGeometry {
  const g = new ShapeGeometry(roundedRect(SCREEN.width, SCREEN.height, SCREEN.radius), 10);
  const pos = g.getAttribute("position");
  const uv = g.getAttribute("uv");
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, pos.getX(i) / SCREEN.width + 0.5, pos.getY(i) / SCREEN.height + 0.5);
  }
  uv.needsUpdate = true;
  return g;
}

/** Copies the triangles in [start, start + count) whose z passes `keep` into a new geometry. */
function triangles(src: BufferGeometry, start: number, count: number, keep: (z: number) => boolean): BufferGeometry {
  const p = src.getAttribute("position");
  const out: number[] = [];
  for (let v = start; v < start + count; v += 3) {
    if (!keep(p.getZ(v))) continue;
    for (let k = 0; k < 3; k++) out.push(p.getX(v + k), p.getY(v + k), p.getZ(v + k));
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(out, 3));
  return g;
}

/**
 * The body, split for its three finishes: the flat front and back (flat
 * shading is right for flat glass) and the rounded edge, whose normals are
 * smoothed so the metal catches the light in one continuous sweep.
 */
export function bodyGeometries(): { front: BufferGeometry; back: BufferGeometry; edge: BufferGeometry } {
  const depth = BODY.depth - 2 * EDGE.thickness;
  const solid = new ExtrudeGeometry(
    roundedRect(BODY.width - 2 * EDGE.size, BODY.height - 2 * EDGE.size, BODY.radius - EDGE.size),
    {
      depth,
      bevelEnabled: true,
      bevelThickness: EDGE.thickness,
      bevelSize: EDGE.size,
      bevelSegments: 6,
      curveSegments: 10,
    },
  );
  solid.translate(0, 0, -depth / 2);
  // ExtrudeGeometry puts the two flat faces in group 0 and the sides in group 1.
  const caps = solid.groups.find((g) => g.materialIndex === 0);
  const sides = solid.groups.find((g) => g.materialIndex === 1);
  if (!caps || !sides) throw new Error("phone body: unexpected geometry groups");
  const front = triangles(solid, caps.start, caps.count, (z) => z > 0);
  const back = triangles(solid, caps.start, caps.count, (z) => z < 0);
  front.computeVertexNormals();
  back.computeVertexNormals();
  const edge = mergeVertices(triangles(solid, sides.start, sides.count, () => true), 1e-5);
  edge.computeVertexNormals();
  solid.dispose();
  return { front, back, edge };
}

/** Along z (cylinders are made along y). */
function disc(radius: number, height: number, x: number, y: number, z: number): BufferGeometry {
  const g = new CylinderGeometry(radius, radius, height, 40);
  g.rotateX(Math.PI / 2);
  g.translate(x, y, z);
  return g;
}

function capsule(length: number, x: number, y: number): BufferGeometry {
  const g = new CapsuleGeometry(0.0055, length, 4, 10);
  g.translate(x, y, 0);
  return g;
}

/**
 * The camera bump and the side buttons. Seen from the front, the bump sits
 * top right (top left from behind, as on the real thing), with two lenses
 * on its outer side, one in the middle of the inner side, and the flash
 * and sensor beside it.
 */
function backDetails() {
  const back = -BODY.depth / 2;
  const size = 0.25;
  const bx = BODY.width / 2 - 0.03 - size / 2;
  const by = BODY.height / 2 - 0.03 - size / 2;
  const plate = new ExtrudeGeometry(roundedRect(size - 0.008, size - 0.008, 0.066), {
    depth: 0.004,
    bevelEnabled: true,
    bevelThickness: 0.004,
    bevelSize: 0.004,
    bevelSegments: 3,
    curveSegments: 8,
  });
  plate.rotateY(Math.PI); // out of the back
  plate.translate(bx, by, back - 0.004);
  const top = back - 0.012;
  const lenses: Array<[number, number]> = [
    [bx + 0.052, by + 0.055],
    [bx + 0.052, by - 0.055],
    [bx - 0.05, by],
  ];
  const rings = lenses.map(([x, y]) => disc(0.047, 0.012, x, y, top - 0.006));
  const buttons = [
    capsule(0.028, -BODY.width / 2 - 0.001, 0.305),
    capsule(0.062, -BODY.width / 2 - 0.001, 0.205),
    capsule(0.062, -BODY.width / 2 - 0.001, 0.105),
    capsule(0.1, BODY.width / 2 + 0.001, 0.16),
  ];
  const trim = mergeGeometries([...rings, ...buttons].map((g) => g.toNonIndexed()));
  const glass = mergeGeometries(
    [...lenses.map(([x, y]) => disc(0.034, 0.014, x, y, top - 0.007)), disc(0.011, 0.004, bx - 0.062, by - 0.078, top)].map(
      (g) => g.toNonIndexed(),
    ),
  );
  const flash = disc(0.014, 0.004, bx - 0.062, by + 0.078, top);
  [...rings, ...buttons].forEach((g) => g.dispose());
  return { plate, trim, glass, flash };
}

function canvasTexture(width: number, height: number, draw: (g: CanvasRenderingContext2D) => void): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const g = c.getContext("2d");
  if (g) draw(g);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/** A soft oval of shade behind the phone, so it lifts off busy footage. */
function shadeTexture(): CanvasTexture {
  return canvasTexture(128, 256, (g) => {
    g.scale(1, 2);
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, "rgba(255,255,255,0.8)");
    r.addColorStop(0.55, "rgba(255,255,255,0.45)");
    r.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = r;
    g.fillRect(0, 0, 128, 128);
  });
}

export type PhoneModel = {
  /** Positioned and scaled onto the page's phone slot; holds the shade. */
  anchor: Group;
  /** The phone itself: turned and floated each frame (rotation order YXZ, so yaw spins it upright). */
  body: Group;
  /** The screen's material: its map is the step's clip. */
  screen: MeshBasicMaterial;
  /** The shade behind the phone; it narrows as the phone turns edge-on. */
  shade: Mesh;
  dispose(): void;
};

export function buildPhone(env: Texture, blank: Texture): PhoneModel {
  const { front, back, edge } = bodyGeometries();
  const { plate, trim, glass, flash } = backDetails();
  const screenShape = screenGeometry();
  const shadeMap = shadeTexture();
  const shadeGeometry = new PlaneGeometry(BODY.width * 1.9, BODY.height * 1.3);

  const std = { envMap: env, fog: false } as const;
  const titanium = new MeshStandardMaterial({ ...std, color: "#48484b", metalness: 1, roughness: 0.3, envMapIntensity: 1.25 });
  const blackGlass = new MeshStandardMaterial({ ...std, color: "#030304", metalness: 0, roughness: 0.07, envMapIntensity: 0.9 });
  const frosted = new MeshStandardMaterial({ ...std, color: "#222326", metalness: 0.2, roughness: 0.52, envMapIntensity: 0.8 });
  const bumpGlass = new MeshStandardMaterial({ ...std, color: "#27292c", metalness: 0.1, roughness: 0.18, envMapIntensity: 1 });
  const lensGlass = new MeshStandardMaterial({ ...std, color: "#050608", metalness: 0.3, roughness: 0.04, envMapIntensity: 1.4 });
  const flashLens = new MeshStandardMaterial({ ...std, color: "#e9e3cf", metalness: 0, roughness: 0.35, emissive: "#2e281a" });
  // The screen shows the clip's own colours, unlit, with nothing over it: the
  // owner had the glass streak taken off so every step reads clearly.
  const screen = new MeshBasicMaterial({ map: blank, toneMapped: false, fog: false });
  const shadeMat = new MeshBasicMaterial({
    color: "#000000",
    map: shadeMap,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    fog: false,
    opacity: 0.6,
  });

  const body = new Group();
  body.rotation.order = "YXZ";
  const face = BODY.depth / 2;
  const screenMesh = new Mesh(screenShape, screen);
  screenMesh.position.z = face + 0.0008;
  body.add(
    new Mesh(front, blackGlass),
    new Mesh(back, frosted),
    new Mesh(edge, titanium),
    new Mesh(plate, bumpGlass),
    new Mesh(trim, titanium),
    new Mesh(glass, lensGlass),
    new Mesh(flash, flashLens),
    screenMesh,
  );

  const shade = new Mesh(shadeGeometry, shadeMat);
  shade.position.set(0.035, -0.05, -0.3);
  shade.renderOrder = -1;

  const anchor = new Group();
  anchor.add(shade, body);

  const geometries = [front, back, edge, plate, trim, glass, flash, screenShape, shadeGeometry];
  const materials = [titanium, blackGlass, frosted, bumpGlass, lensGlass, flashLens, screen, shadeMat];
  return {
    anchor,
    body,
    screen,
    shade,
    dispose() {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      shadeMap.dispose();
    },
  };
}
