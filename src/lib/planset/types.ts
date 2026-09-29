// ─────────────────────────────────────────────────────────────────────────
// Plan-set reader — shared types.
//
// A plan set is the whole consented PDF (20–60 sheets). Everything here is
// measured in millimetres ON THE PAGE AS DISPLAYED (the page's /Rotate
// applied), origin top-left, y down — unless a name says "real", which is
// full-size millimetres on the building (page mm × the sheet's proven scale).
//
// Evidence: every fact the reader states points back at the sheet and the
// text items / shapes it came from, so the tradie can tap it and see it on
// the plan, and so nothing can be stated that isn't on the plans.
// ─────────────────────────────────────────────────────────────────────────

/** One run of text as the drawing program wrote it. */
export type TextItem = {
  /** Index on its page — evidence refers to text by (page, id). */
  id: number;
  s: string;
  /** Start of the baseline, page mm. */
  x: number;
  y: number;
  /** Reading direction, degrees anticlockwise: 0 = left→right, 90 = bottom→top. */
  angle: number;
  /** Font height, page mm. */
  h: number;
  /** Advance width along the reading direction, page mm. */
  w: number;
};

/** One straight stroked line. Curves are dropped (arcs are door swings). */
export type Segment = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Stroke colour, "#rrggbb". */
  c: string;
  /** Stroke width, page mm. */
  w: number;
  dashed: boolean;
};

/** One filled shape (walls are usually drawn as filled polygons). */
export type FillShape = {
  /** Fill colour, "#rrggbb". */
  c: string;
  /** Outline points of the first ring, page mm. */
  pts: Array<[number, number]>;
  /** [x0, y0, x1, y1], page mm. */
  bbox: [number, number, number, number];
};

/** Everything read off one page, before any interpretation. */
export type SheetRaw = {
  /** 1-based page number in the PDF. */
  page: number;
  widthMm: number;
  heightMm: number;
  /** The page's /Rotate (0, 90, 180, 270) — already applied to every position. */
  rotate: number;
  text: TextItem[];
  segs: Segment[];
  fills: FillShape[];
  /** Raster images painted on the page. */
  images: number;
  /** Share of the page covered by the largest image, 0–1 (a scan is ~1). */
  imageCover: number;
};

/** Where a fact came from. */
export type Evidence = {
  page: number;
  /** Text item ids on that page. */
  text?: number[];
  /** A page-mm box on that page, for facts read from shapes. */
  box?: [number, number, number, number];
  /** How it was read: "text", "geometry", "table", "ai", "tradie". */
  method: "text" | "geometry" | "table" | "ai" | "tradie";
};
