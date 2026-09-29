// Plan-set reader — the shapes the screens get from /api/plansets (types only).

import type { EffectiveModel } from "./model/answers";
import type { PlanTakeoff } from "./takeoff/fromModel";
import type { Mark } from "./link/marks";
import type { WallLine } from "./measure/walls";
import type { TextItem } from "./types";

export type PlanSetStatus = "uploading" | "queued" | "reading" | "ready" | "failed";

export type PlanSetListItem = {
  id: string;
  original_filename: string;
  status: PlanSetStatus;
  step: string | null;
  progress: { done?: number; total?: number } | null;
  page_count: number | null;
  quote_id: string | null;
  error: string | null;
  created_at: string;
};

export type PlanSetSheetSummary = {
  page: number;
  sheet_id: string | null;
  title: string | null;
  kind: string | null;
  building: string | null;
  scale_ratio: number | null;
  scale_basis: string | null;
};

export type PlanSetView = {
  id: string;
  name: string;
  status: PlanSetStatus;
  step: string | null;
  progress: { done?: number; total?: number } | null;
  pageCount: number | null;
  quoteId: string | null;
  error: string | null;
  model: EffectiveModel | null;
  answers: Record<string, string | number | boolean>;
  takeoff: PlanTakeoff | null;
  sheets: PlanSetSheetSummary[];
};

export type SheetView = {
  page: number;
  widthMm: number;
  heightMm: number;
  rotate: number;
  sheetId: string | null;
  title: string | null;
  kind: string;
  scale: { ratio: number | null; basis: string | null };
  walls: { ratio: number; lines: WallLine[] } | null;
  marks: Mark[];
  text: TextItem[];
  pdfUrl: string | null;
};
