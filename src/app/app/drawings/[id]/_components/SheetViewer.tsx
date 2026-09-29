"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MagnifyingGlassMinus, MagnifyingGlassPlus } from "@phosphor-icons/react";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { IconButton } from "@/components/ui/icon-button";
import { Skeleton } from "@/components/ui/skeleton";
import type { PlanSetSheetSummary, SheetView } from "@/lib/planset/api-types";
import type { EffectiveModel } from "@/lib/planset/model/answers";
import { textBox } from "@/lib/planset/sheet/text";

const PDFJS = "/t2qcal/vendor/pdfjs/6.3.289";
/** Sheets worth looking at first: plans, then everything else. */
const PLAN_FIRST = ["dimension_plan", "floor_plan", "lintel_plan", "bracing_plan", "framing_plan", "foundation_plan", "roof_plan", "structural_plan"];

/**
 * One sheet of the set with what the reader found drawn over it: walls
 * (outside red, inside blue), window/door openings (green) with their
 * marks, and — when you came from a fact — the text it was read from.
 * The PDF page is drawn by pdf.js in the browser from a short-lived link.
 */
export function SheetViewer({ setId, sheets, model, focus }: { setId: string; sheets: PlanSetSheetSummary[]; model: EffectiveModel; focus: { page: number; text?: number[] } | null }) {
  const ordered = useMemo(
    () => [...sheets].sort((a, b) => rank(a.kind) - rank(b.kind) || a.page - b.page),
    [sheets],
  );
  const [page, setPage] = useState<number>(focus?.page ?? model.walls?.page ?? ordered[0]?.page ?? 1);
  const [sheet, setSheet] = useState<SheetView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const highlight = focus && focus.page === page ? focus.text ?? [] : [];

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/plansets/${setId}/sheet/${page}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Couldn't load that sheet."))))
      .then((s: SheetView) => !cancelled && setSheet(s))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [setId, page]);

  // Draw the PDF page to fit the width (× zoom).
  useEffect(() => {
    if (!sheet?.pdfUrl || !canvas.current || !box.current) return;
    let cancelled = false;
    let task: { destroy: () => Promise<void> } | null = null;
    (async () => {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = `${PDFJS}/pdf.worker.min.mjs`;
      const loading = pdfjs.getDocument({ url: sheet.pdfUrl!, cMapUrl: `${PDFJS}/cmaps/`, cMapPacked: true, standardFontDataUrl: `${PDFJS}/standard_fonts/`, wasmUrl: `${PDFJS}/wasm/`, disableAutoFetch: true, disableStream: false });
      task = loading;
      const doc = await loading.promise;
      if (cancelled) return;
      const p = await doc.getPage(sheet.page);
      const base = p.getViewport({ scale: 1 });
      const width = box.current!.clientWidth * zoom;
      const scale = (width / base.width) * Math.min(window.devicePixelRatio || 1, 2);
      const vp = p.getViewport({ scale });
      const c = canvas.current!;
      c.width = Math.floor(vp.width);
      c.height = Math.floor(vp.height);
      c.style.width = `${width}px`;
      c.style.height = `${(width * vp.height) / vp.width}px`;
      await p.render({ canvas: c, canvasContext: c.getContext("2d")!, viewport: vp }).promise;
    })().catch(() => !cancelled && setError("The drawing couldn't be shown. The facts are still there."));
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [sheet, zoom]);

  const openings = model.openings.filter((o) => o.planPage === page);

  return (
    <div className="space-y-3" data-testid="planset-viewer">
      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor="sheet-pick">Sheet</label>
        <select
          id="sheet-pick"
          className="min-h-12 min-w-0 flex-1 rounded-ui-md border border-ui-line bg-ui-surface-2 px-3 text-ui-base text-ui-text"
          value={page}
          onChange={(e) => {
            setSheet(null);
            setError(null);
            setPage(Number(e.target.value));
          }}
        >
          {ordered.map((s) => (
            <option key={s.page} value={s.page}>
              {s.sheet_id ?? `Page ${s.page}`} — {s.title ?? (s.kind ?? "sheet").replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <IconButton label="Zoom out" icon={<MagnifyingGlassMinus weight="bold" />} onClick={() => setZoom((z) => Math.max(1, z / 1.5))} disabled={zoom <= 1} />
        <IconButton label="Zoom in" icon={<MagnifyingGlassPlus weight="bold" />} onClick={() => setZoom((z) => Math.min(4, z * 1.5))} disabled={zoom >= 4} />
      </div>
      {error ? <Callout tone="warn">{error}</Callout> : null}
      <Card padding="none" className="overflow-hidden">
        <div ref={box} className="relative w-full overflow-auto bg-ui-surface-2" style={{ maxHeight: "70vh" }}>
          {!sheet ? <Skeleton className="aspect-[1.414] w-full" /> : null}
          <div className="relative" style={{ width: `${zoom * 100}%` }}>
            <canvas ref={canvas} className="block" aria-label={sheet ? `${sheet.sheetId ?? "Sheet"} ${sheet.title ?? ""}` : "Sheet"} />
            {sheet ? (
              <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${sheet.widthMm} ${sheet.heightMm}`} preserveAspectRatio="none" aria-hidden="true">
                {sheet.walls?.lines.map((l) => {
                  const half = l.thicknessMm / sheet.walls!.ratio / 2 + 0.25;
                  const r = l.orientation === "h" ? { x: l.from, y: l.at - half, w: l.to - l.from, h: half * 2 } : { x: l.at - half, y: l.from, w: half * 2, h: l.to - l.from };
                  return (
                    <g key={l.id}>
                      <rect x={r.x} y={r.y} width={r.w} height={r.h} className={l.external ? "fill-ui-bad/30 stroke-ui-bad" : "fill-ui-info/25 stroke-ui-info"} strokeWidth={0.2} />
                      {l.gaps.map((g, i) => {
                        const gr = l.orientation === "h" ? { x: g.from, y: l.at - half - 0.5, w: g.to - g.from, h: half * 2 + 1 } : { x: l.at - half - 0.5, y: g.from, w: half * 2 + 1, h: g.to - g.from };
                        return <rect key={i} x={gr.x} y={gr.y} width={gr.w} height={gr.h} className="fill-ui-ok/30 stroke-ui-ok" strokeWidth={0.25} />;
                      })}
                    </g>
                  );
                })}
                {sheet.marks
                  .filter((mk) => openings.some((o) => o.mark === mk.id))
                  .map((mk) => (
                    <circle key={`${mk.id}-${mk.textId}`} cx={mk.x} cy={mk.y} r={3} className="fill-none stroke-ui-ok" strokeWidth={0.5} />
                  ))}
                {highlight.map((id) => {
                  const t = sheet.text.find((x) => x.id === id);
                  if (!t) return null;
                  const [x0, y0, x1, y1] = textBox(t);
                  return <rect key={id} x={x0 - 1} y={y0 - 1} width={x1 - x0 + 2} height={y1 - y0 + 2} className="fill-ui-warn/30 stroke-ui-warn" strokeWidth={0.5} />;
                })}
              </svg>
            ) : null}
          </div>
        </div>
      </Card>
      {sheet ? (
        <p className="text-ui-sm text-ui-muted">
          {sheet.scale.ratio ? `Scale 1:${sheet.scale.ratio} (${sheet.scale.basis === "sibling" ? "proven by the matching plan" : "proven from its dimensions"}).` : "No proven scale on this sheet — nothing is measured off it."}{" "}
          {sheet.walls ? "Red: outside walls · Blue: inside walls · Green: openings." : ""}
        </p>
      ) : null}
    </div>
  );
}

function rank(kind: string | null): number {
  const i = PLAN_FIRST.indexOf(kind ?? "");
  return i === -1 ? 100 : i;
}
