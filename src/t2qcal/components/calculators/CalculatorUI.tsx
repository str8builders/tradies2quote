"use client";

import Link from "next/link";
import { QuoteTransfer } from "./QuoteTransfer";
import { SaveCalculation } from "./SaveCalculation";
import { validateSnapshot, type CalculationSnapshot } from "@/t2qcal/lib/calculation-record";
import { createContext, useContext, useCallback, useEffect, useRef, useState } from "react";
import type { ToolEntry } from "@/t2qcal/lib/tools";
import { detailKind, drawDiagram, note, prepareSheet, to3DKind, type DiagramKind } from "./technicalDrawing";

const ValidCalculation=createContext(true);

export type UnitSystem = "metric" | "imperial";

export const nfmt = (value: number, digits = 1) =>
  new Intl.NumberFormat("en-NZ", { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(Number.isFinite(value) ? value : 0);

export function CalculatorFrame({ tool, children, unit, onUnitChange, values }: { values?: Record<string,number|string>; tool: ToolEntry; children: React.ReactNode; unit: UnitSystem; onUnitChange: (unit: UnitSystem) => void }) {
  const [copied, setCopied] = useState(false);
  const snapshot:CalculationSnapshot={version:1,slug:tool.slug,unit,values:values??{}};
  let invalid="";
  try {validateSnapshot(snapshot);} catch(e){invalid=e instanceof Error?e.message:"Check the calculator inputs.";}

  async function share() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <main className="calculator-page" data-invalid={invalid?"true":undefined}>
      <div className="calculator-breadcrumb"><Link href="/t2qcal/calculators">All calculators</Link><span>/</span><span>{tool.name}</span></div>
      <header className="calculator-title-row">
        <div>
          <span className="calculator-kicker">Live geometry · {tool.category}</span>
          <h1>{tool.name}</h1>
          <p>{tool.summary}</p>
        </div>
        <div className="calculator-actions">
          <div className="unit-toggle" aria-label="Unit system">
            <button className={unit === "metric" ? "active" : ""} onClick={() => onUnitChange("metric")}>Metric</button>
            <button className={unit === "imperial" ? "active" : ""} onClick={() => onUnitChange("imperial")}>Imperial</button>
          </div>
          <button className="quiet-action" onClick={share}>{copied ? "Link copied" : "Share"}</button>
          <button className="quiet-action" onClick={() => window.print()}>Print</button>
        </div>
      </header>
      {invalid&&<p className="verification-note" role="alert">{invalid}</p>}
      <ValidCalculation.Provider value={!invalid}>{children}</ValidCalculation.Provider>
      <SaveCalculation snapshot={snapshot} title={tool.name}/>
      {!invalid&&<QuoteTransfer snapshot={snapshot}/>}
      <section className="calculator-caution">
        <b>Verify before cutting.</b>
        <span>These results describe geometry only. Confirm stock sizes, tolerances, code and engineering requirements for the actual build.</span>
      </section>
    </main>
  );
}

export function NumberField({ label, value, onChange, unit, min, max, step = 1, hint, range = false }: { label: string; value: number; onChange: (value: number) => void; unit?: string; min?: number; max?: number; step?: number; hint?: string; range?: boolean }) {
  return (
    <label className="number-field">
      <span className="field-label">{label}{hint && <small title={hint}>?</small>}</span>
      <span className="input-wrap">
        <input type="number" value={Number.isFinite(value) ? value : ""} min={min} max={max} step={step} onChange={(event) => onChange(event.target.valueAsNumber)} />
        {unit && <b>{unit}</b>}
      </span>
      {range && min !== undefined && max !== undefined && (
        <input className="fine-range" type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(event.target.valueAsNumber)} />
      )}
    </label>
  );
}

export function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="number-field">
      <span className="field-label">{label}</span>
      <span className="input-wrap select-wrap">
        <select value={value} onChange={(event) => onChange(event.target.value)}>
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </span>
    </label>
  );
}

export function ResultGrid({ results }: { results: { label: string; value: string; primary?: boolean }[] }) {
  return (
    <div className="result-grid">
      {results.map((result) => (
        <div key={result.label} className={result.primary ? "primary-result" : ""}>
          <span>{result.label}</span>
          <strong>{result.value}</strong>
        </div>
      ))}
    </div>
  );
}

export function SectionHead({ index, title, note }: { index: string; title: string; note?: string }) {
  return <div className="calc-section-head"><span>{index}</span><div><h2>{title}</h2>{note && <p>{note}</p>}</div></div>;
}

type DrawFunction = (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
type CanvasModel = { kind: DiagramKind; values: Record<string, number>; unit: string; title: string };

export function TechnicalCanvas({ draw, label, height = 440, zoom = 1, model }: { draw: DrawFunction; label: string; height?: number; zoom?: number; model?: CanvasModel }) {
  const valid=useContext(ValidCalculation);
  const ref = useRef<HTMLCanvasElement>(null);
  // Blocklayer leads with the measured 2D drawing; 3D is a secondary reference view.
  const [view, setView] = useState<"measured" | "detail" | "3d">("measured");
  // Only offer the set-out sheet when it resolves to a genuinely different drawing.
  const hasDetail = !!model && detailKind(model.kind) !== model.kind;
  const active = view === "detail" && !hasDetail ? "measured" : view;
  const render = useCallback(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx || !valid) return;
    ctx.scale(ratio, ratio);
    // Skip drawing until the element has real bounds; a zero-size measurement
    // makes fixed drawing margins go negative and canvas throws on negative radii.
    if (rect.width < 80 || rect.height < 80) return;
    const safeZoom = Math.min(1.8, Math.max(.75, zoom));
    ctx.translate((1 - safeZoom) * rect.width / 2, (1 - safeZoom) * rect.height / 2);
    ctx.scale(safeZoom, safeZoom);
    if (model && active === "3d") drawDiagram(ctx, rect.width, rect.height, to3DKind(model.kind), model.values, model.unit, `${model.title} · 3D assembly`);
    else if (model && active === "detail") drawDiagram(ctx, rect.width, rect.height, detailKind(model.kind), model.values, model.unit, `${model.title} · set-out detail`);
    else draw(ctx, rect.width, rect.height);
  }, [draw, model, active, zoom, valid]);

  useEffect(() => {
    render();
    const observer = new ResizeObserver(render);
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [render]);

  return <>
    {model && <div className="canvas-view-switch" role="tablist" aria-label={`${model.title} drawing views`}>
      <button role="tab" aria-selected={active === "measured"} className={active === "measured" ? "active" : ""} onClick={() => setView("measured")}>Measured profile</button>
      {hasDetail && <button role="tab" aria-selected={active === "detail"} className={active === "detail" ? "active" : ""} onClick={() => setView("detail")}>Set-out detail</button>}
      <button role="tab" aria-selected={active === "3d"} className={active === "3d" ? "active" : ""} onClick={() => setView("3d")}>3D assembly</button>
      <span>Calculated dimensions · scale to fit</span>
    </div>}
    <canvas className="technical-canvas" ref={ref} style={{ height }} role="img" aria-label={model ? `${model.title} ${active} diagram` : label} />
  </>;
}

/** White sheet, Verdana text — matches the blocklayer drawing conventions. */
export function setupCanvas(ctx: CanvasRenderingContext2D, width: number, height: number) {
  prepareSheet(ctx, width, height);
}

export function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color = "#000", width = 1) {
  ctx.save();
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
  ctx.restore();
}

export function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color = "#000", align: CanvasTextAlign = "center") {
  note(ctx, text, x, y, color, align);
}

export { dimension, hairline, member, plate, shape, note, infoLines, angleLabel, setOutMark, wood } from "./technicalDrawing";

export function DimensionLine({ values }: { values: string[] }) {
  return <div className="dimension-list">{values.map((value, index) => <div key={`${value}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><strong>{value}</strong></div>)}</div>;
}
