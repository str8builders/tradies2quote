"use client";

import { useMemo, useState } from "react";
import { useCalculationSeed } from "./CalculationSeed";
import { fieldBounds, initialCalculatorValues, displayFactor, fieldVisible } from "@/t2qcal/lib/calculator-inputs";
import type { ToolEntry } from "@/t2qcal/lib/tools";
import { getVerifiedDefinition, type VerifiedUnit } from "@/t2qcal/lib/verified-calculators";
import { CalculatorFrame, DimensionLine, NumberField, SelectField, ResultGrid, SectionHead, TechnicalCanvas } from "./CalculatorUI";
import { detailKind, drawDiagram, to3DKind, type DiagramKind } from "./technicalDrawing";

const inchFactor = 25.4;

function calculatorModelKind(slug: string, base: DiagramKind): DiagramKind {
  if (slug === "spiral-stairs") return "spiral3d";
  if (slug === "cone-pattern" || slug === "round-square-reducer") return "cone3d";
  if (slug === "masonry-arch" || slug === "gothic-arch" || slug === "arched-fence") return "arch3d";
  if (slug === "slab-edge-beams") return "slab3d";
  if (slug === "pyramid") return "pyramid3d";
  if (slug === "gazebo") return "roof3d";
  return to3DKind(base);
}

/** Input suffix per native field kind, in the selected unit system. */
function fieldUnitLabel(kind: string | undefined, unit: VerifiedUnit): string | undefined {
  const metric = unit === "metric";
  switch (kind) {
    case "length": return metric ? "mm" : "in";
    case "area": return metric ? "m²" : "ft²";
    case "volumeRate": return metric ? "$/m³" : "$/yd³";
    case "linearRate": return metric ? "$/m" : "$/ft";
    case "cubicFootRate": return metric ? "$/m³" : "$/ft³";
    case "angle": return "°";
    case "percent": return "%";
    case "money": return "$";
    default: return undefined;
  }
}

export function VerifiedCalculator({ tool }: { tool: ToolEntry }) {
  const saved = useCalculationSeed();
  const definition = useMemo(() => getVerifiedDefinition(tool.slug), [tool.slug]);
  const [unit, setUnit] = useState<VerifiedUnit>(saved?.snapshot.unit ?? (tool.units === "imperial" ? "imperial" : "metric"));
  const [values, setValues] = useState<Record<string, number>>(() => saved ? saved.snapshot.values as Record<string,number> : initialCalculatorValues(definition.fields, tool.units === "imperial" ? "imperial" : "metric"));
  const [sheet, setSheet] = useState(0);
  const output = useMemo(() => {
    try { return definition.compute(values, unit); }
    catch { return { errors: ["Calculation could not be completed"], results: [{ label: "Check inputs", value: "Enter valid positive dimensions", primary: true }] }; }
  }, [definition, values, unit]);
  const measuredSheets = definition.sheets || [{ label: "Measured view", diagram: definition.diagram }];
  // Measured drawings lead, matching blocklayer; the 3D assembly is a trailing reference sheet.
  // The set-out sheet is only added when it would actually differ from the measured one.
  const detail = detailKind(definition.diagram);
  const addDetail = measuredSheets.length < 2 && detail !== definition.diagram;
  const sheets = [
    ...measuredSheets,
    ...(addDetail ? [{ label: "Set-out detail", diagram: detail }] : []),
    // a converter or a construction has nothing to stand up in three dimensions,
    // so those tools carry measured sheets only rather than a stand-in solid
    ...(definition.showsAssembly === false ? []
      : [{ label: "3D assembly", diagram: definition.assembly ?? calculatorModelKind(tool.slug, definition.diagram) }]),
  ];
  const activeSheet = sheets[Math.min(sheet, sheets.length - 1)];
  const diagramValues = { ...values, ...(output.diagramValues || {}) };
  const unitLabel = unit === "metric" ? "mm" : "in";

  function update(key: string, next: number) {
    setValues((current) => ({ ...current, [key]: next }));
  }

  function changeUnit(next: VerifiedUnit) {
    if (next === unit) return;
    const factor = next === "imperial" ? 1 / inchFactor : inchFactor;
    setValues((current) => Object.fromEntries(definition.fields.map((field) => {
      // Native kinds convert by their own factor; the two legacy money-rate
      // fields keep their historical per-length / per-volume behaviour.
      if (field.kind === "length") return [field.key, current[field.key] * factor];
      if (field.kind === "area" || field.kind === "volumeRate" || field.kind === "linearRate" || field.kind === "cubicFootRate") {
        return [field.key, current[field.key] * displayFactor(field.kind, next) / displayFactor(field.kind, unit)];
      }
      if (field.key === "rate" && tool.slug === "deck-boards") return [field.key, current[field.key] * (next === "imperial" ? .3048 : 1/.3048)];
      if (field.key === "rate" && tool.slug === "timber-volume") return [field.key, current[field.key] * (next === "imperial" ? .028316846592 : 1/.028316846592)];
      return [field.key, current[field.key]];
    })));
    setUnit(next);
  }

  const draw = (ctx: CanvasRenderingContext2D, width: number, height: number) => drawDiagram(ctx, width, height, activeSheet.diagram, diagramValues, unitLabel, `${definition.title} · ${activeSheet.label}`);

  return <CalculatorFrame values={values} tool={tool} unit={unit} onUnitChange={changeUnit}>
    <div className="calculator-workbench">
      <section className="input-panel">
        <SectionHead index="01" title={definition.title} note={definition.note} />
        <div className="field-grid">
          {definition.fields.filter((field) => fieldVisible(field, values)).map((field) => field.options ? <SelectField
            key={field.key}
            label={field.label}
            value={String(Math.round(values[field.key]))}
            onChange={(next) => update(field.key, Number(next))}
            options={field.options.map((option) => ({ value: String(option.id), label: option.label }))}
          /> : <NumberField
            key={field.key}
            label={field.label}
            value={values[field.key]}
            onChange={(next) => update(field.key, field.kind === "count" ? Math.round(next) : next)}
            unit={fieldUnitLabel(field.kind, unit)}
            min={fieldBounds(field, unit).min}
            max={fieldBounds(field, unit).max}
            step={field.kind === "length" ? (unit === "metric" ? field.step || 1 : field.step || .0625) : field.step}
            hint={field.hint}
          />)}
        </div>
        <div className="verification-note"><b>Live calculation</b><span>Check dimensions · inspect the drawing · save your working</span></div>
      </section>
      <section className="diagram-panel detailed-diagram-panel">
        <div className="diagram-toolbar">
          <label className="native-drawing-picker">Drawing<select aria-label="Drawing view" value={sheet} onChange={e=>setSheet(Number(e.target.value))}>{sheets.map((item,index)=><option key={item.label} value={index}>{item.label}</option>)}</select></label>
        </div>
        {output.errors?.length ? <div className="verification-note" role="alert">Correct the highlighted inputs to generate this drawing.</div> : <TechnicalCanvas draw={draw} label={`${definition.title} ${activeSheet.label} technical diagram`} height={350} />}
        <div className="drawing-legend"><span><i className="legend-cut" />Geometry &amp; dimensions</span><span><i className="legend-setout" />Running set-out</span><span><i className="legend-adjust" />Adjusted value</span><span><i className="legend-angle" />Angle</span><span>Measured dimensions govern</span></div>
      </section>
    </div>
    <section className="results-section">
      <SectionHead index="02" title="Calculated dimensions" note="All values update from the same geometry used to render the drawing." />
      <ResultGrid results={output.results} />
    </section>
    {output.marks && output.marks.length > 0 && <section className="markout-section">
      <SectionHead index="03" title="Running set-out" note="Measured from the first datum; confirm the final mark against the overall span." />
      <DimensionLine values={output.marks} />
    </section>}
  </CalculatorFrame>;
}
