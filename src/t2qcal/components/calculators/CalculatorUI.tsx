"use client";

import { QuoteTransfer } from "./QuoteTransfer";
import {useCalculationSeed} from "./CalculationSeed";
import {planSourceNote} from "@/t2qcal/lib/plan-measurement";
import { SaveCalculation } from "./SaveCalculation";
import { CalculatorResources } from "./CalculatorResources";
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
  const seed=useCalculationSeed();
  const snapshot:CalculationSnapshot={version:1,slug:tool.slug,unit,values:values??{},...(seed?.snapshot.planSource?{planSource:seed.snapshot.planSource}:{})};
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
      <header className="native-calculator-intro">
        <div className="unit-toggle" role="group" aria-label="Unit system">
          <button aria-pressed={unit === "metric"} className={unit === "metric" ? "active" : ""} onClick={() => onUnitChange("metric")}>Metric</button>
          <button aria-pressed={unit === "imperial"} className={unit === "imperial" ? "active" : ""} onClick={() => onUnitChange("imperial")}>Imperial</button>
        </div>
        <h1 className="sr-only">{tool.name}</h1><p>{tool.summary}</p>
        <details className="native-calculator-menu"><summary>Share & print</summary><button className="quiet-action" onClick={share}>{copied ? "Link copied" : "Copy link"}</button><button className="quiet-action" onClick={() => window.print()}>Print</button></details>
      </header>
      {invalid&&<p className="verification-note" role="alert">{invalid}</p>}
      <ValidCalculation.Provider value={!invalid}>{children}</ValidCalculation.Provider>
      {snapshot.planSource&&<p className="verification-note">{planSourceNote(snapshot.planSource)}</p>}
      <SaveCalculation snapshot={snapshot} title={tool.name}/>
      {!invalid&&<QuoteTransfer snapshot={snapshot}/>}
      <section className="calculator-caution">
        <b>Verify before cutting.</b>
        <span>These results describe geometry only. Confirm stock sizes, tolerances, code and engineering requirements for the actual build.</span>
      </section>
      <CalculatorResources tool={tool}/>
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
        <input className="fine-range" type="range" aria-label={`${label} slider`} value={Number.isFinite(value)?value:min} min={Math.ceil(min/step)*step} max={max} step={step} onChange={(event) => onChange(event.target.valueAsNumber)} />
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

type DrawFunction = (ctx: CanvasRenderingContext2D, width: number, height: number) => {unitsPerPixel:number;unit:string} | void;
type CanvasModel = { kind: DiagramKind; values: Record<string, number>; unit: string; title: string };

export function TechnicalCanvas({ draw, label, height = 440, zoom = 1, model, measurable = false }: { draw: DrawFunction; label: string; height?: number; zoom?: number; model?: CanvasModel; measurable?: boolean }) {
  const valid=useContext(ValidCalculation);
  const ref = useRef<HTMLCanvasElement>(null);
  const scaleRef = useRef<{unitsPerPixel:number;unit:string} | null>(null);
  const dragRef = useRef<{x:number;y:number;panX:number;panY:number;moved:boolean} | null>(null);
  const [magnification,setMagnification]=useState(1);
  const [pan,setPan]=useState({x:0,y:0});
  const [measuring,setMeasuring]=useState(false);
  const [measurement,setMeasurement]=useState<{x:number;y:number;endX:number;endY:number;scale:number;unit:string;key:string}|null>(null);
  const [copies,setCopies]=useState<{id:number;image:string;caption:string}[]>([]);
  const copyID=useRef(0);
  const tapAnchor=useRef<{x:number;y:number;key:string}|null>(null);
  const drawingSize=useRef("");
  const [imageError,setImageError]=useState("");
  // Blocklayer leads with the measured 2D drawing; 3D is a secondary reference view.
  const [view, setView] = useState<"measured" | "detail" | "template" | "3d">("measured");
  // Only offer the set-out sheet when it resolves to a genuinely different drawing.
  const hasDetail = !!model && detailKind(model.kind) !== model.kind;
  const active = view === "detail" && !hasDetail ? "measured" : view;
  const drawingKey=JSON.stringify([model?.values,model?.unit,active,magnification,pan,zoom]);
  const currentMeasurement=measurement?.key===drawingKey?measurement:null;
  const measureEnabled=measurable && (active==="measured"||active==="template") && measuring;
  function fit(){tapAnchor.current=null;setMagnification(1);setPan({x:0,y:0});setMeasurement(null);}
  const render = useCallback(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sizeKey=`${rect.width}:${rect.height}`;if(drawingSize.current!==sizeKey){drawingSize.current=sizeKey;setMeasurement(null);tapAnchor.current=null;}
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx || !valid) return;
    ctx.scale(ratio, ratio);
    // Skip drawing until the element has real bounds; a zero-size measurement
    // makes fixed drawing margins go negative and canvas throws on negative radii.
    if (rect.width < 80 || rect.height < 80) return;
    const safeZoom = Math.min(1.8, Math.max(.75, zoom))*magnification;
    ctx.fillStyle="#fff";ctx.fillRect(0,0,rect.width,rect.height);
    const px=Math.max(-(magnification-1)*rect.width/2,Math.min((magnification-1)*rect.width/2,pan.x));
    const py=Math.max(-(magnification-1)*rect.height/2,Math.min((magnification-1)*rect.height/2,pan.y));
    ctx.translate((1 - safeZoom) * rect.width / 2+px, (1 - safeZoom) * rect.height / 2+py);
    ctx.scale(safeZoom, safeZoom);
    scaleRef.current=null;
    if (model && active === "3d") drawDiagram(ctx, rect.width, rect.height, to3DKind(model.kind), model.values, model.unit, `${model.title} · 3D assembly`);
    else if(model && active === "template"){const scale=drawDiagram(ctx,rect.width,rect.height,"stringermark",model.values,model.unit,model.title);if(scale)scaleRef.current={unitsPerPixel:scale.unitsPerPixel/safeZoom,unit:scale.unit};}
    else if (model && active === "detail") drawDiagram(ctx, rect.width, rect.height, detailKind(model.kind), model.values, model.unit, `${model.title} · set-out detail`);
    else {const scale=draw(ctx, rect.width, rect.height);if(scale)scaleRef.current={unitsPerPixel:scale.unitsPerPixel/safeZoom,unit:scale.unit};}
  }, [draw, model, active, zoom, valid,magnification,pan]);

  useEffect(() => {
    render();
    const observer = new ResizeObserver(render);
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [render]);

  return <>
    {model && <div className="diagram-toolbar"><label className="native-drawing-picker">Drawing<select aria-label={`${model.title} drawing view`} value={active} onChange={e=>{setView(e.target.value as "measured"|"detail"|"template"|"3d");fit();}}><option value="measured">Measured view</option>{hasDetail&&<option value="detail">{model.kind==="stairs"?"Tread detail":"Set-out detail"}</option>}{model.kind==="stairs"&&<option value="template">Stringer template</option>}<option value="3d">3D assembly</option></select></label></div>}
    <div className="drawing-controls" aria-label="Drawing controls">
      <label>Zoom <input aria-label="Drawing zoom" type="range" min="1" max="4" step="0.25" value={magnification} onChange={e=>setMagnification(Number(e.target.value))}/><output>{Math.round(magnification*100)}%</output></label>
      <button onClick={fit}>Fit drawing</button>
      {measurable&&<button disabled={active!=="measured"&&active!=="template"} aria-pressed={measureEnabled} onClick={()=>{setMeasuring(!measuring);setMeasurement(null);tapAnchor.current=null;}}>Measure diagram</button>}
      <button disabled={!valid||copies.length>=4} onClick={()=>{try{const image=ref.current?.toDataURL("image/png");if(image){const id=++copyID.current;setCopies(old=>[...old,{id,image,caption:`${model?.title??label} · ${active} · ${model?.unit??""} · option ${id}`}]);setImageError("");}}catch{setImageError("Could not copy the drawing. Please try again.");}}}>Keep comparison</button>
    </div>
    <details className="drawing-help"><summary>Drawing controls & help</summary><p>{measureEnabled?"Tap two points or drag to measure. Keyboard: Enter starts at the centre; arrows move the endpoint.":"Zoom in, then drag to inspect. Arrow keys pan the focused drawing; Home fits it."} Comparisons keep the visible drawing; print at page-fit size.</p></details>
    {imageError&&<p role="alert">{imageError}</p>}
    <div className="drawing-viewport">
    <canvas className="technical-canvas" ref={ref} style={{ height,touchAction:measureEnabled||magnification>1?"none":"pan-y",cursor:measureEnabled?"crosshair":magnification>1?"grab":"default" }} role="img" tabIndex={0} aria-label={model ? `${model.title} ${active} diagram` : label}
      onKeyDown={e=>{if(measureEnabled && (e.key==="Enter" || e.key.startsWith("Arrow"))){e.preventDefault();const r=e.currentTarget.getBoundingClientRect(),scale=scaleRef.current;if(!scale)return;const delta=e.shiftKey?1:10;setMeasurement(m=>{if(e.key==="Enter"||!m||m.key!==drawingKey)return {x:r.width/2,y:r.height/2,endX:r.width/2,endY:r.height/2,scale:scale.unitsPerPixel,unit:scale.unit,key:drawingKey};return {...m,endX:Math.max(0,Math.min(r.width,m.endX+(e.key==="ArrowRight"?delta:e.key==="ArrowLeft"?-delta:0))),endY:Math.max(0,Math.min(r.height,m.endY+(e.key==="ArrowDown"?delta:e.key==="ArrowUp"?-delta:0)))};});}else if(e.key==="Home"){e.preventDefault();fit();}else if(magnification>1&&["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)){e.preventDefault();setPan(p=>({x:p.x+(e.key==="ArrowLeft"?30:e.key==="ArrowRight"?-30:0),y:p.y+(e.key==="ArrowUp"?30:e.key==="ArrowDown"?-30:0)}));}}}
      onPointerDown={e=>{if(e.button!==0||(!measureEnabled&&magnification===1))return;const r=e.currentTarget.getBoundingClientRect();const x=e.clientX-r.left,y=e.clientY-r.top;e.currentTarget.setPointerCapture(e.pointerId);dragRef.current={x,y,panX:pan.x,panY:pan.y,moved:false};if(measureEnabled&&scaleRef.current){const anchor=tapAnchor.current?.key===drawingKey?tapAnchor.current:null;setMeasurement({x:anchor?.x??x,y:anchor?.y??y,endX:x,endY:y,scale:scaleRef.current.unitsPerPixel,unit:scaleRef.current.unit,key:drawingKey});}}}
      onPointerMove={e=>{const d=dragRef.current;if(!d)return;const r=e.currentTarget.getBoundingClientRect(),x=Math.max(0,Math.min(r.width,e.clientX-r.left)),y=Math.max(0,Math.min(r.height,e.clientY-r.top));if(Math.hypot(x-d.x,y-d.y)>3)d.moved=true;if(measureEnabled){if(d.moved)setMeasurement(m=>m?{...m,x:d.x,y:d.y,endX:x,endY:y}:null);}else setPan({x:Math.max(-(magnification-1)*r.width/2,Math.min((magnification-1)*r.width/2,d.panX+x-d.x)),y:Math.max(-(magnification-1)*r.height/2,Math.min((magnification-1)*r.height/2,d.panY+y-d.y))});}}
      onPointerUp={()=>{const d=dragRef.current;if(measureEnabled&&d){tapAnchor.current=d.moved||tapAnchor.current?.key===drawingKey?null:{x:d.x,y:d.y,key:drawingKey};}dragRef.current=null;}} onPointerCancel={()=>{dragRef.current=null;}} onLostPointerCapture={()=>{dragRef.current=null;}}/>
    {currentMeasurement&&<svg className="measurement-overlay" aria-hidden="true"><line x1={currentMeasurement.x} y1={currentMeasurement.y} x2={currentMeasurement.endX} y2={currentMeasurement.endY} stroke="#d51919" strokeWidth="2"/><circle cx={currentMeasurement.x} cy={currentMeasurement.y} r="4" fill="#d51919"/><circle cx={currentMeasurement.endX} cy={currentMeasurement.endY} r="4" fill="#d51919"/></svg>}
    </div>
    {currentMeasurement&&<p className="measurement-result" role="status">Horizontal {nfmt(Math.abs(currentMeasurement.endX-currentMeasurement.x)*currentMeasurement.scale,2)} {currentMeasurement.unit} · Vertical {nfmt(Math.abs(currentMeasurement.endY-currentMeasurement.y)*currentMeasurement.scale,2)} {currentMeasurement.unit} · Distance {nfmt(Math.hypot(currentMeasurement.endX-currentMeasurement.x,currentMeasurement.endY-currentMeasurement.y)*currentMeasurement.scale,2)} {currentMeasurement.unit}</p>}
    {copies.length > 0 && <section className="drawing-comparisons" aria-label="Comparison drawings">
      <h3>Compare your options</h3>
      {copies.map(copy => <figure key={copy.id}>
        {/* Local canvas snapshot: no remote image request or optimisation is needed. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={copy.image} alt={copy.caption}/>
        <figcaption>{copy.caption}</figcaption>
        <button onClick={() => setCopies(old => old.filter(c => c.id !== copy.id))}>Remove option {copy.id}</button>
      </figure>)}
    </section>}
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
