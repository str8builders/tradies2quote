/**
 * A small web map without a map library: OpenStreetMap's 256 px tiles
 * (Web Mercator), placed around the team's positions. Pure.
 */

import type { LatLng } from "./geo";

export const TILE = 256;
export const TILE_URL = "https://tile.openstreetmap.org";

/** World pixel position at a zoom level. */
export function project({ lat, lng }: LatLng, zoom: number): { x: number; y: number } {
  const scale = TILE * 2 ** zoom;
  const clamped = Math.max(-85.0511, Math.min(85.0511, lat));
  const s = Math.sin((clamped * Math.PI) / 180);
  return {
    x: ((lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale,
  };
}

export interface MapView {
  zoom: number;
  /** World pixel at the top-left of the box. */
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The closest zoom (up to `maxZoom`) that fits every point in a box with a
 * margin, centred on them. One point: street level.
 */
export function fitView(points: readonly LatLng[], width: number, height: number, { maxZoom = 16, margin = 36 } = {}): MapView | null {
  if (points.length === 0 || width <= 0 || height <= 0) return null;
  for (let zoom = maxZoom; zoom >= 3; zoom--) {
    const px = points.map((p) => project(p, zoom));
    const minX = Math.min(...px.map((p) => p.x));
    const maxX = Math.max(...px.map((p) => p.x));
    const minY = Math.min(...px.map((p) => p.y));
    const maxY = Math.max(...px.map((p) => p.y));
    if (maxX - minX <= width - 2 * margin && maxY - minY <= height - 2 * margin) {
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      return { zoom, left: Math.round(cx - width / 2), top: Math.round(cy - height / 2), width, height };
    }
  }
  const p = project(points[0], 3);
  return { zoom: 3, left: Math.round(p.x - width / 2), top: Math.round(p.y - height / 2), width, height };
}

/** The tiles that cover the box, with where each sits in it. */
export function tilesFor(view: MapView): Array<{ key: string; src: string; left: number; top: number }> {
  const count = 2 ** view.zoom;
  const out: Array<{ key: string; src: string; left: number; top: number }> = [];
  const x0 = Math.floor(view.left / TILE);
  const y0 = Math.floor(view.top / TILE);
  const x1 = Math.floor((view.left + view.width - 1) / TILE);
  const y1 = Math.floor((view.top + view.height - 1) / TILE);
  for (let ty = Math.max(0, y0); ty <= Math.min(count - 1, y1); ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const wrapped = ((tx % count) + count) % count;
      out.push({
        key: `${view.zoom}/${tx}/${ty}`,
        src: `${TILE_URL}/${view.zoom}/${wrapped}/${ty}.png`,
        left: tx * TILE - view.left,
        top: ty * TILE - view.top,
      });
    }
  }
  return out;
}

/** Where a point sits in the box (px from its top-left). */
export function placeOnView(point: LatLng, view: MapView): { left: number; top: number } {
  const p = project(point, view.zoom);
  return { left: Math.round(p.x - view.left), top: Math.round(p.y - view.top) };
}

/** A link that opens the spot in Apple Maps (Google Maps on other phones via the web). */
export function mapsLink(point: LatLng, label: string): string {
  const params = new URLSearchParams({ ll: `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`, q: label });
  return `https://maps.apple.com/?${params}`;
}
