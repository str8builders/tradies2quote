import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  buildTerrainSvg,
  projectTerrain,
  terrainHeight,
  TERRAIN_PHASE,
  TERRAIN_VARIANTS,
  viewBoxFor,
  type TerrainVariant,
} from "./terrain";

const VARIANTS: TerrainVariant[] = ["wide", "compact"];
type Pt = [number, number];

/** Relative "m" path data back to absolute points, one array per subpath. */
function decode(d: string): Pt[][] {
  let x = 0;
  let y = 0;
  return d
    .split("m")
    .filter(Boolean)
    .map((chunk) => {
      const n = (chunk.match(/-?\d+/g) ?? []).map(Number);
      const pts: Pt[] = [];
      for (let i = 0; i < n.length; i += 2) {
        x += n[i];
        y += n[i + 1];
        pts.push([x, y]);
      }
      return pts;
    });
}

const pathData = (svg: string) => /<path[^>]* d="([^"]*)"/.exec(svg)?.[1] ?? "";

/** Same test the generator applies (pad 2); pad 3 also absorbs rounding. */
function reachesBox(
  a: readonly number[],
  b: readonly number[],
  variant: TerrainVariant,
  pad = 2,
) {
  const box = viewBoxFor(variant);
  return (
    Math.max(a[0], b[0]) >= box.x - pad &&
    Math.min(a[0], b[0]) <= box.x + box.width + pad &&
    Math.max(a[1], b[1]) >= box.y - pad &&
    Math.min(a[1], b[1]) <= box.y + box.height + pad
  );
}

describe("wallpaper terrain generator", () => {
  it("reproduces the retired Three.js scene vertex for vertex", () => {
    for (const variant of VARIANTS) {
      const { widthSegments: gx, heightSegments: gy } = TERRAIN_VARIANTS[variant];
      const geometry = new THREE.PlaneGeometry(95, 58, gx, gy);
      const position = geometry.attributes.position;
      for (let i = 0; i < position.count; i++) {
        position.setZ(i, terrainHeight(position.getX(i), position.getY(i), TERRAIN_PHASE));
      }
      const mesh = new THREE.Mesh(geometry);
      mesh.rotation.set(-0.58, 0.1, -0.22);
      mesh.position.set(12, -6, -10);
      mesh.updateMatrixWorld();
      const aspect = 1.6; // any aspect: the old camera scaled by height only
      const camera = new THREE.PerspectiveCamera(48, aspect, 0.1, 150);
      camera.position.z = 40;
      camera.updateMatrixWorld();

      const grid = projectTerrain(variant);
      expect(grid.length * grid[0].length).toBe(position.count);
      for (let i = 0; i < position.count; i++) {
        const ndc = new THREE.Vector3()
          .fromBufferAttribute(position, i)
          .applyMatrix4(mesh.matrixWorld)
          .project(camera);
        const [x, y] = grid[Math.floor(i / (gx + 1))][i % (gx + 1)];
        // Three.js stores positions as float32; 1e-3 units is ~0.001 px.
        expect(x).toBeCloseTo(ndc.x * aspect * 500, 3);
        expect(y).toBeCloseTo(-ndc.y * 500, 3);
      }
    }
  });

  it("is deterministic and matches the committed public/wallpaper assets", async () => {
    for (const variant of VARIANTS) {
      const svg = buildTerrainSvg(variant);
      expect(buildTerrainSvg(variant)).toBe(svg);
      // Regenerate after an intended change: npx vitest run <this file> --update
      await expect(svg).toMatchFileSnapshot(
        `../../../../public/wallpaper/terrain-${variant}.svg`,
      );
    }
  });

  it("stays small enough to be a background asset", () => {
    expect(Buffer.byteLength(buildTerrainSvg("wide"))).toBeLessThanOrEqual(25_000);
    expect(Buffer.byteLength(buildTerrainSvg("compact"))).toBeLessThanOrEqual(10_000);
  });

  it("emits well-formed, finite, clipped path data without rounding drift", () => {
    for (const variant of VARIANTS) {
      const svg = buildTerrainSvg(variant);
      const box = viewBoxFor(variant);
      expect(svg).toContain(
        `viewBox="${[box.x, box.y, box.width, box.height].map(Math.round).join(" ")}"`,
      );
      expect(svg).not.toMatch(/NaN|Infinity/);
      const d = pathData(svg);
      expect(d).toMatch(/^(m-?\d+(?: ?-?\d+)*)+$/);

      const vertices = new Set(
        projectTerrain(variant)
          .flat()
          .map(([x, y]) => `${Math.round(x) || 0},${Math.round(y) || 0}`),
      );
      const subpaths = decode(d);
      for (const pts of subpaths) {
        expect(pts.length).toBeGreaterThanOrEqual(2);
        for (const p of pts) expect(vertices.has(`${p[0]},${p[1]}`)).toBe(true);
        for (let i = 1; i < pts.length; i++) {
          expect(reachesBox(pts[i - 1], pts[i], variant, 3)).toBe(true);
        }
      }
    }
  });

  it("keeps every wireframe edge the old renderer drew on screen, diagonals included", () => {
    for (const variant of VARIANTS) {
      const grid = projectTerrain(variant);
      let expected = 0;
      for (let iy = 0; iy < grid.length; iy++) {
        for (let ix = 0; ix < grid[0].length; ix++) {
          const here = grid[iy][ix];
          if (ix + 1 < grid[0].length && reachesBox(here, grid[iy][ix + 1], variant)) expected++;
          if (iy + 1 < grid.length && reachesBox(here, grid[iy + 1][ix], variant)) expected++;
          if (ix > 0 && iy + 1 < grid.length && reachesBox(here, grid[iy + 1][ix - 1], variant)) {
            expected++; // quad diagonal b→d: (ix, iy+1) ↔ (ix+1, iy)
          }
        }
      }
      const drawn = decode(pathData(buildTerrainSvg(variant))).reduce(
        (sum, pts) => sum + pts.length - 1,
        0,
      );
      expect(drawn).toBe(expected);
      expect(expected).toBeGreaterThan(grid.length * grid[0].length); // three families
    }
  });

  it("keeps a faint particle field", () => {
    for (const variant of VARIANTS) {
      const count = (buildTerrainSvg(variant).match(/<circle /g) ?? []).length;
      expect(count).toBeGreaterThan(5);
      expect(count).toBeLessThanOrEqual(TERRAIN_VARIANTS[variant].particles);
    }
  });

  it("keeps the old height field", () => {
    expect(terrainHeight(0, 0, 0)).toBe(2);
    expect(terrainHeight(10 * Math.PI / 2, 0, 0)).toBeCloseTo(5, 10);
  });
});
