/**
 * Static stand-in for the former Three.js wallpaper scene.
 *
 * It reproduces that scene's maths exactly — a 95 × 58 PlaneGeometry
 * wireframe (Euler XYZ −0.58 / 0.1 / −0.22 at 12 / −6 / −10) with its
 * sine-noise height field frozen at one phase, a yellow particle field, and
 * a 48° perspective camera at z = 40 — and projects it ONCE into SVG path
 * data. The browser then only rasterises a flat image; motion is a CSS
 * transform on the layer, so there is no per-frame JavaScript or WebGL.
 *
 * Units: 1000 SVG units = viewport height. A perspective camera scales its
 * scene by viewport height and centres it, so the SVG drawn centred at
 * `background-size: cover` matches the old canvas at every aspect ratio up
 * to the variant's `maxAspect` (wider screens get a gentle zoom instead of
 * an empty edge). `OVERSCAN` extra viewport on every side lets the layer
 * drift without exposing a cut edge.
 *
 * Pure and deterministic: `public/wallpaper/*.svg` are generated from here
 * (see terrain.test.ts: `npx vitest run src/app/_components/wallpaper --update`).
 */

export type TerrainVariant = "wide" | "compact";

type VariantSpec = {
  /** PlaneGeometry segments, as the old renderer used per breakpoint. */
  widthSegments: number;
  heightSegments: number;
  /**
   * Line alpha. Three.js drew every shared wireframe edge twice at the
   * material opacity (0.095 wide / 0.055 compact), so interior lines
   * composited to 1 − (1 − a)²; each edge is drawn once here at that value.
   */
  lineOpacity: number;
  particles: number;
  /** Widest viewport (width / height) the image covers without zooming. */
  maxAspect: number;
};

export const TERRAIN_VARIANTS: Record<TerrainVariant, VariantSpec> = {
  wide: {
    widthSegments: 48,
    heightSegments: 26,
    lineOpacity: 0.18,
    particles: 80,
    maxAspect: 2.4,
  },
  compact: {
    widthSegments: 25,
    heightSegments: 14,
    lineOpacity: 0.11,
    particles: 35,
    maxAspect: 1.5,
  },
};

/** Fraction of the viewport added on every side (CSS: `inset: -8%`). */
export const OVERSCAN = 0.08;
/** Height-field phase (the old `time * 0.00013` a few seconds after load). */
export const TERRAIN_PHASE = 0.9;

const UNITS = 1000; // viewport height in SVG units
const HALF_H = (UNITS / 2) * (1 + 2 * OVERSCAN); // half the viewBox height
const FOCAL = 1 / Math.tan(((48 / 2) * Math.PI) / 180); // PerspectiveCamera(48)
const CAMERA_Z = 40;
const PLANE_WIDTH = 95;
const PLANE_HEIGHT = 58;
const MESH_ROTATION = [-0.58, 0.1, -0.22] as const;
const MESH_POSITION = [12, -6, -10] as const;

type Vec3 = readonly [number, number, number];
type Point = readonly [number, number];

/** Old per-frame vertex displacement, evaluated at a fixed phase. */
export function terrainHeight(x: number, y: number, phase = TERRAIN_PHASE) {
  return Math.sin(x * 0.1 + phase) * 3 + Math.cos(y * 0.12 + phase * 0.7) * 2;
}

/** Row-major 3×3 rotation for a Three.js Euler in the default XYZ order. */
function eulerXYZ(rx: number, ry: number, rz: number): number[] {
  const a = Math.cos(rx);
  const b = Math.sin(rx);
  const c = Math.cos(ry);
  const d = Math.sin(ry);
  const e = Math.cos(rz);
  const f = Math.sin(rz);
  return [
    c * e, -c * f, d,
    a * f + b * e * d, a * e - b * f * d, -b * c,
    b * f - a * e * d, b * e + a * f * d, a * c,
  ];
}

function transform(m: number[], p: Vec3, offset: Vec3 = [0, 0, 0]): Vec3 {
  return [
    m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + offset[0],
    m[3] * p[0] + m[4] * p[1] + m[5] * p[2] + offset[1],
    m[6] * p[0] + m[7] * p[1] + m[8] * p[2] + offset[2],
  ];
}

/** World point → SVG units (origin at the viewport centre, y down). */
function project(p: Vec3): Point {
  const scale = (FOCAL * (UNITS / 2)) / (CAMERA_Z - p[2]);
  return [p[0] * scale, -p[1] * scale];
}

export function viewBoxFor(variant: TerrainVariant) {
  const halfW = HALF_H * TERRAIN_VARIANTS[variant].maxAspect;
  return { x: -halfW, y: -HALF_H, width: halfW * 2, height: HALF_H * 2 };
}

/** Projected grid vertices, indexed [iy][ix] exactly like PlaneGeometry. */
export function projectTerrain(variant: TerrainVariant, phase = TERRAIN_PHASE) {
  const { widthSegments: gx, heightSegments: gy } = TERRAIN_VARIANTS[variant];
  const rotation = eulerXYZ(...MESH_ROTATION);
  const rows: Point[][] = [];
  for (let iy = 0; iy <= gy; iy++) {
    const y = -(iy * (PLANE_HEIGHT / gy) - PLANE_HEIGHT / 2);
    const row: Point[] = [];
    for (let ix = 0; ix <= gx; ix++) {
      const x = ix * (PLANE_WIDTH / gx) - PLANE_WIDTH / 2;
      row.push(
        project(transform(rotation, [x, y, terrainHeight(x, y, phase)], MESH_POSITION)),
      );
    }
    rows.push(row);
  }
  return rows;
}

/**
 * The wireframe edges Three.js drew for an indexed PlaneGeometry: every row,
 * every column and each quad's b→d diagonal, chained into anti-diagonals.
 */
function wireframePolylines(grid: Point[][]): Point[][] {
  const gy = grid.length - 1;
  const gx = grid[0].length - 1;
  const lines: Point[][] = [...grid];
  for (let ix = 0; ix <= gx; ix++) lines.push(grid.map((row) => row[ix]));
  for (let s = 1; s < gx + gy; s++) {
    const line: Point[] = [];
    for (let ix = Math.max(0, s - gy); ix <= Math.min(gx, s); ix++) {
      line.push(grid[s - ix][ix]);
    }
    lines.push(line);
  }
  return lines;
}

function particlePositions(variant: TerrainVariant, phase: number) {
  const spin = eulerXYZ(0, 0, Math.sin(phase * 0.3) * 0.08);
  const out: { point: Point; depth: number }[] = [];
  const count = TERRAIN_VARIANTS[variant].particles;
  for (let i = 0; i < count * 3; i += 3) {
    const world = transform(spin, [
      Math.sin(i * 17.1) * 45,
      Math.cos(i * 8.3) * 30,
      Math.sin(i * 2.7) * 10 - 8,
    ]);
    out.push({ point: project(world), depth: CAMERA_Z - world[2] });
  }
  return out;
}

const round = (n: number) => {
  const r = Math.round(n);
  return r === 0 ? 0 : r; // never emit "-0"
};

/** SVG number list: a separator is only needed before non-negative values. */
function numbers(values: number[]) {
  let out = "";
  values.forEach((v, i) => {
    const s = String(v);
    out += i > 0 && v >= 0 ? ` ${s}` : s;
  });
  return out;
}

/**
 * Relative path data for the polylines, dropping every segment that cannot
 * reach the viewBox. Points are rounded to whole units (≈ 0.9 px on a
 * 900 px-tall viewport) before deltas are taken, so rounding never drifts.
 */
export function encodePolylines(
  lines: Point[][],
  box: { x: number; y: number; width: number; height: number },
) {
  const pad = 2;
  const minX = box.x - pad;
  const maxX = box.x + box.width + pad;
  const minY = box.y - pad;
  const maxY = box.y + box.height + pad;
  const visible = (a: Point, b: Point) =>
    Math.max(a[0], b[0]) >= minX &&
    Math.min(a[0], b[0]) <= maxX &&
    Math.max(a[1], b[1]) >= minY &&
    Math.min(a[1], b[1]) <= maxY;

  let d = "";
  let cx = 0;
  let cy = 0;
  for (const line of lines) {
    const pts = line.map(([x, y]) => [round(x), round(y)] as const);
    let run: number[] | null = null;
    for (let i = 1; i < pts.length; i++) {
      if (!visible(line[i - 1], line[i])) {
        if (run) d += numbers(run);
        run = null;
        continue;
      }
      if (!run) {
        d += "m";
        run = [pts[i - 1][0] - cx, pts[i - 1][1] - cy];
        cx = pts[i - 1][0];
        cy = pts[i - 1][1];
        // After "m", further pairs are implicit relative line-tos.
      }
      run.push(pts[i][0] - cx, pts[i][1] - cy);
      cx = pts[i][0];
      cy = pts[i][1];
    }
    if (run) d += numbers(run);
  }
  return d;
}

/** Complete, deterministic SVG document for one breakpoint variant. */
export function buildTerrainSvg(variant: TerrainVariant, phase = TERRAIN_PHASE) {
  const spec = TERRAIN_VARIANTS[variant];
  const box = viewBoxFor(variant);
  const d = encodePolylines(wireframePolylines(projectTerrain(variant, phase)), box);
  const dots = particlePositions(variant, phase)
    .filter(
      ({ point: [x, y] }) =>
        x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height,
    )
    .map(({ point: [x, y], depth }) => {
      // PointsMaterial size attenuation: nearer particles read larger.
      const r = Math.round(Math.min(1, Math.max(0.6, 40 / depth)) * 10) / 10;
      return `<circle cx="${round(x)}" cy="${round(y)}" r="${r}"/>`;
    })
    .join("");
  const [x, y, width, height] = [box.x, box.y, box.width, box.height].map(round);
  return (
    // Explicit size = viewBox, so every engine knows the intrinsic ratio for
    // `background-size: cover`.
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${x} ${y} ${width} ${height}">` +
    `<path fill="none" stroke="#ff5f15" stroke-opacity="${spec.lineOpacity}" vector-effect="non-scaling-stroke" d="${d}"/>` +
    `<g fill="#ffea00" fill-opacity=".45">${dots}</g>` +
    `</svg>\n`
  );
}
