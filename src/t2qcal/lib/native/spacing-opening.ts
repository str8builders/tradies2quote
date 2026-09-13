import { ceilInt, n, type Values } from "./format";

/**
 * Exact port of the `OpeningLayout` struct in
 * ios/T2QCAL/T2QCAL/Models/OpeningLayout.swift — a rectangular rough opening
 * measured inside the jack studs and below a designed header. The tool closure
 * that consumes it lives in `spacing.ts`.
 */
export type OpeningGeometry = {
  centres: number;
  studLength: number;
  headerBottom: number;
  headerTop: number;
  jackLength: number;
  topCut: number;
  bottomCut: number;
  headerLength: number;
  /** Full-height stud positions (left face), excluding the king studs. */
  regular: number[];
  /** Cripple stud positions (left face) inside the opening. */
  cripples: number[];
};

export function openingLayout(v: Values): OpeningGeometry {
  const t = n(v, "memberWidth");
  const bays = ceilInt((n(v, "span") - t) / n(v, "targetGap") - 1e-10, 1, 1000);
  const centres = (n(v, "span") - t) / bays;
  const studLength = n(v, "height") - n(v, "plates") * t;
  const headerBottom = n(v, "openBottom") + n(v, "openHeight");
  const headerTop = headerBottom + n(v, "headerDepth");
  const jackLength = headerBottom - t;
  const topCut = n(v, "height") - (n(v, "plates") - 1) * t - headerTop;
  const bottomCut = n(v, "openBottom") > 0 ? n(v, "openBottom") - 2 * t : 0;
  const headerLength = n(v, "openWidth") + 2 * t;
  const regular: number[] = [];
  const cripples: number[] = [];
  for (let i = 0; i <= bays; i += 1) {
    const x = i * centres;
    if (x + t <= n(v, "openLeft") - 2 * t + 1e-9 || x >= n(v, "openLeft") + n(v, "openWidth") + 2 * t - 1e-9) {
      regular.push(x);
    }
    if (x >= n(v, "openLeft") - 1e-9 && x + t <= n(v, "openLeft") + n(v, "openWidth") + 1e-9) {
      cripples.push(x);
    }
  }
  return { centres, studLength, headerBottom, headerTop, jackLength, topCut, bottomCut, headerLength, regular, cripples };
}
