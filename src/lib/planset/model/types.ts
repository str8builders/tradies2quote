// ─────────────────────────────────────────────────────────────────────────
// Plan-set reader — the building model (types only).
//
// What the reader believes about the building, fact by fact, each with the
// evidence it came from and how sure it is. The tradie's answers override
// facts; materials are only worked out from a model the tradie has checked.
// ─────────────────────────────────────────────────────────────────────────

import type { Evidence } from "../types";
import type { WallLine } from "../measure/walls";

export type FactStatus =
  /** Read off the plans and checked a second way (e.g. chain = overall). */
  | "checked"
  /** Read off the plans once. */
  | "read"
  /** Read, but something disagrees — the tradie must look. */
  | "needs_check"
  /** An estimating default, not a measurement (always shown as such). */
  | "assumed"
  /** Given or corrected by the tradie. */
  | "tradie";

export type Fact<T> = { value: T; status: FactStatus; evidence: Evidence[]; note?: string };

export type ModelWalls = {
  /** Page the walls were measured on, and its proven scale. */
  page: number;
  ratio: number;
  /** How the scale was known: proven (dimensions, scale bar, matching sheet), printed (needs the tradie's OK), or lengths typed by the tradie. */
  scaleBasis: "dimensions" | "scale_bar" | "sibling" | "declared" | "tradie";
  externalLengthMm: Fact<number>;
  internalLengthMm: Fact<number>;
  /** Inside the outside face of the framing. */
  enclosedAreaM2: Fact<number> | null;
  /** The floor area printed on the plans, if any. */
  printedAreaM2: Fact<number> | null;
  lines: WallLine[];
};

export type ModelOpening = {
  mark: string;
  kind: "window" | "door";
  widthMm: number | null;
  heightMm: number | null;
  sillMm: number | null;
  headMm: number | null;
  count: number;
  /** Raw schedule fields as printed. */
  fields: Record<string, string>;
  schedulePage: number | null;
  /** The plan page its mark is on, and the gap in the wall it sits in. */
  planPage: number | null;
  /** The gap it sits in on its plan page: which wall, how wide, and its centre (page mm). */
  wall: { line: number; external: boolean; gapWidthMm: number; x: number; y: number } | null;
  lintel: string | null;
  /** Schedule width vs the gap measured in the wall. */
  sizeCheck: "ok" | "differs" | "unchecked";
  evidence: Evidence[];
};

export type ModelLintel = {
  mark: string;
  spec: string;
  page: number;
  evidence: Evidence[];
  /** The window/door it sits over (lintel plan lined up with the floor plan), when found. */
  opening?: string;
  openingWidthMm?: number;
};

export type ModelScheduleRow = { mark: string; fields: Record<string, string>; page: number; title: string | null };

export type FlagTopic =
  | "scale"
  | "dimensions"
  | "revision"
  | "draft"
  | "missing_sheet"
  | "opening"
  | "area"
  | "renovation"
  | "building"
  | "unreadable"
  | "approximate"
  | "spec"
  | "other";

export type Question =
  | { kind: "confirm"; prompt: string }
  | { kind: "number"; prompt: string; unit: string }
  | { kind: "choice"; prompt: string; options: string[] };

export type Flag = {
  id: string;
  /** blocker: materials can't be worked out until answered; check: look at it; info: worth knowing. */
  level: "blocker" | "check" | "info";
  topic: FlagTopic;
  message: string;
  evidence: Evidence[];
  question?: Question;
  /** A question to send the designer (RFI), when the plans themselves disagree. */
  rfi?: string;
};

export type ProjectKind = "new_build" | "alteration" | "addition" | "unknown";

export type BuildingModel = {
  version: 1;
  project: {
    kind: ProjectKind;
    buildings: string[];
    consentNumber: string | null;
    authority: string | null;
    /** A consent was found: a text stamp on the drawings, or the Form 5 papers in the set. */
    approved: boolean;
    consentSource: "stamp" | "papers" | null;
  };
  sheets: { total: number; drawings: number; documents: number; provenScale: number; unreadable: number };
  walls: ModelWalls | null;
  /** Multi-building sets: each building's own walls (chosen by the tradie). */
  wallsByBuilding: Record<string, ModelWalls>;
  openings: ModelOpening[];
  lintels: ModelLintel[];
  /** Every other schedule row (engineer's columns, walls, floors, finishes …). */
  schedules: Record<string, ModelScheduleRow[]>;
  /** Filled in by the AI reading of notes, sections and consent papers (cited). */
  specs: Record<string, Fact<string>[]>;
  heights: { studMm: Fact<number> | null; ceilingMm: Fact<number> | null };
  roof: { pitchDeg: Fact<number> | null; areaM2: Fact<number> | null; material: Fact<string> | null };
  zones: { wind: Fact<string> | null; earthquake: Fact<string> | null; exposure: Fact<string> | null; snow: Fact<string> | null };
  consent: { inspections: Fact<string>[]; documents: Fact<string>[]; conditions: Fact<string>[] };
  /** Room finishes where the plans schedule them. */
  rooms: Array<{ name: string; finishes: string; wet: boolean; evidence: Evidence[] }>;
  /** What the legend says line styles mean (existing / remove / new). */
  legend: Array<{ meaning: "existing_to_remain" | "to_be_removed" | "new_work" | "other"; label: string; evidence: Evidence[] }>;
  /** Designed or supplied by others (trusses by supplier, engineer to design …). */
  byOthers: Fact<string>[];
  /** Which sheets the AI read, and what it cost. */
  ai: { sheetsRead: number; itemsKept: number; itemsDropped: number; skipped: string | null };
  flags: Flag[];
};
