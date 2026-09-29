"use client";

import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import type { PlanSetView } from "@/lib/planset/api-types";
import { FactRow, FactStatusPill, firstEvidence } from "./parts";

const m = (mm: number | string) => `${(Number(mm) / 1000).toLocaleString("en-NZ", { maximumFractionDigits: 2 })} m`;
const mm = (v: number | string) => `${Number(v).toLocaleString("en-NZ")} mm`;
const m2 = (v: number | string) => `${Number(v).toLocaleString("en-NZ", { maximumFractionDigits: 1 })} m²`;

const SPEC_LABEL: Record<string, string> = {
  framing_timber: "Framing timber",
  stud_spacing: "Stud spacing",
  nogs: "Nogs",
  top_plates: "Top plates",
  lintels: "Lintels",
  wall_underlay: "Wall underlay",
  cavity: "Cavity",
  cladding: "Cladding",
  roofing: "Roofing",
  roof_underlay: "Roof underlay",
  insulation_walls: "Wall insulation",
  insulation_ceiling: "Ceiling insulation",
  insulation_floor: "Floor insulation",
  lining_walls: "Wall linings",
  lining_ceilings: "Ceiling linings",
  lining_wet_areas: "Wet-area linings",
  floor_system: "Floor / slab",
  slab_thickness: "Slab thickness",
  slab_reinforcing: "Slab reinforcing",
  joinery: "Joinery",
  glazing: "Glazing",
  bracing: "Bracing",
  fixings: "Fixings",
};

/** What the plans say about the building, fact by fact, each with how sure it is and where it came from. */
export function SummaryTab({ view, onShow, onSaved }: { view: PlanSetView; onShow: (page: number, text?: number[]) => void; onSaved: () => void }) {
  const model = view.model!;
  const w = model.walls;
  const windows = model.openings.filter((o) => o.kind === "window");
  const doors = model.openings.filter((o) => o.kind === "door");
  const blockers = model.flags.filter((f) => f.level === "blocker" && !f.resolved);
  const row = (props: Omit<Parameters<typeof FactRow>[0], "setId" | "onSaved" | "onShow">) => <FactRow {...props} setId={view.id} onSaved={onSaved} onShow={onShow} />;
  return (
    <div className="space-y-5" data-testid="planset-summary">
      {blockers.length ? (
        <Callout tone="warn" title={`${blockers.length} question${blockers.length === 1 ? "" : "s"} to answer before the materials`}>
          {blockers.map((b) => b.message).join(" ")}
        </Callout>
      ) : null}

      <Card padding="none" as="section" aria-label="The building">
        <h2 className="px-4 pt-4 text-ui-sm font-semibold text-ui-muted">The building</h2>
        <div className="divide-y divide-ui-line">
          {row({ label: "Floor area (inside the outside walls)", fact: w?.enclosedAreaM2 ?? null, format: m2, editKey: "set:floor_area_m2", unit: "m²" })}
          {w?.printedAreaM2 ? row({ label: "Floor area printed on the plans", fact: w.printedAreaM2, format: m2 }) : null}
          {row({ label: "Outside walls", fact: w?.externalLengthMm ?? null, format: m, editKey: "set:external_wall_mm", unit: "mm" })}
          {row({ label: "Inside walls", fact: w?.internalLengthMm ?? null, format: m, editKey: "set:internal_wall_mm", unit: "mm" })}
          {row({ label: "Stud height", fact: model.heights.studMm, format: mm, editKey: "set:stud_mm", unit: "mm" })}
          {model.heights.ceilingMm ? row({ label: "Ceiling height", fact: model.heights.ceilingMm, format: mm, editKey: "set:ceiling_mm", unit: "mm" }) : null}
          {row({ label: "Roof area (plan)", fact: model.roof.areaM2, format: m2, editKey: "set:roof_area_m2", unit: "m²" })}
          {row({ label: "Roof pitch", fact: model.roof.pitchDeg, format: (v) => `${v}°`, editKey: "set:pitch_deg", unit: "°" })}
          {model.roof.material ? row({ label: "Roofing", fact: model.roof.material }) : null}
        </div>
        {w ? (
          <p className="px-4 pb-4 text-ui-sm text-ui-muted">
            Measured on sheet page {w.page} at 1:{w.ratio} ({w.scaleBasis === "sibling" ? "scale proven by the matching dimension plan" : "scale proven from its own dimensions"}).
          </p>
        ) : null}
      </Card>

      <Card padding="none" as="section" aria-label="Windows, doors and lintels">
        <h2 className="px-4 pt-4 text-ui-sm font-semibold text-ui-muted">Windows, doors and lintels</h2>
        <ul className="divide-y divide-ui-line">
          {model.openings.map((o) => {
            const ev = firstEvidence(o.evidence.slice(1).length ? o.evidence.slice(1) : o.evidence);
            return (
              <li key={o.mark} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-ui-base font-semibold text-ui-text">
                    {o.mark} · {o.widthMm && o.heightMm ? `${o.widthMm} × ${o.heightMm}` : "size not scheduled"}
                    {o.count > 1 ? ` × ${o.count}` : ""}
                  </p>
                  <p className="text-ui-sm text-ui-muted">
                    {o.kind === "window" ? "Window" : "Door"}
                    {o.wall ? (o.wall.external ? " · outside wall" : " · inside wall") : ""}
                    {o.lintel ? ` · lintel ${o.lintel}` : ""}
                    {o.sizeCheck === "ok" ? " · matches the gap on the plan" : o.sizeCheck === "differs" ? ` · gap drawn ${o.wall?.gapWidthMm} wide` : ""}
                  </p>
                </div>
                {ev ? (
                  <button type="button" className="shrink-0 text-ui-sm font-semibold text-ui-brand-text" onClick={() => onShow(ev.page, ev.text)}>
                    Show
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
        <p className="px-4 py-3 text-ui-sm text-ui-muted">
          {windows.length} windows, {doors.length} doors from the schedules · {model.lintels.length} lintels on the lintel plan.
        </p>
      </Card>

      {Object.keys(model.specs).length ? (
        <Card padding="none" as="section" aria-label="Specified on the plans">
          <h2 className="px-4 pt-4 text-ui-sm font-semibold text-ui-muted">Specified on the plans</h2>
          <ul className="divide-y divide-ui-line">
            {Object.entries(model.specs).map(([topic, facts]) => (
              <li key={topic} className="space-y-1 px-4 py-3">
                <p className="text-ui-sm text-ui-muted">{SPEC_LABEL[topic] ?? topic.replace(/_/g, " ")}</p>
                {facts.map((f, i) => {
                  const ev = firstEvidence(f.evidence);
                  return (
                    <div key={i} className="flex items-start justify-between gap-3">
                      <p className="text-ui-base text-ui-text">{f.value}</p>
                      <div className="flex shrink-0 items-center gap-2">
                        <FactStatusPill status={f.status} />
                        {ev ? (
                          <button type="button" className="text-ui-sm font-semibold text-ui-brand-text" onClick={() => onShow(ev.page, ev.text)}>
                            Show
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card padding="none" as="section" aria-label="Zones and consent">
        <h2 className="px-4 pt-4 text-ui-sm font-semibold text-ui-muted">Zones and consent</h2>
        <div className="divide-y divide-ui-line">
          {row({ label: "Wind zone", fact: model.zones.wind })}
          {row({ label: "Earthquake zone", fact: model.zones.earthquake })}
          {row({ label: "Exposure zone", fact: model.zones.exposure })}
          <div className="px-4 py-3">
            <p className="text-ui-sm text-ui-muted">Building consent</p>
            <p className="text-ui-base text-ui-text">
              {model.project.approved
                ? `${model.project.consentNumber ?? "Consent"}${model.project.authority ? `, ${model.project.authority}` : ""} (${model.project.consentSource === "papers" ? "from the consent papers in this set" : "from the stamp on the drawings"}).`
                : "Couldn't read a consent number (council stamps are usually pictures). Check you're pricing the stamped, approved set."}
            </p>
          </div>
          {model.consent.inspections.length ? (
            <div className="px-4 py-3">
              <p className="text-ui-sm text-ui-muted">Council inspections</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-ui-base text-ui-text">
                {model.consent.inspections.map((f, i) => (
                  <li key={i}>{f.value}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {model.consent.documents.length ? (
            <div className="px-4 py-3">
              <p className="text-ui-sm text-ui-muted">Documents needed for sign-off</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-ui-base text-ui-text">
                {model.consent.documents.map((f, i) => (
                  <li key={i}>{f.value}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {model.byOthers.length ? (
            <div className="px-4 py-3">
              <p className="text-ui-sm text-ui-muted">By others (not in your price)</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-ui-base text-ui-text">
                {model.byOthers.map((f, i) => (
                  <li key={i}>{f.value}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </Card>

      <p className="text-ui-sm text-ui-muted">
        {model.sheets.drawings} drawings and {model.sheets.documents} consent pages read; scale proven on {model.sheets.provenScale}.
        {model.ai.skipped ? ` Notes weren't read: ${model.ai.skipped}` : ` The AI read ${model.ai.sheetsRead} sheets of notes; ${model.ai.itemsDropped} answers it couldn't back up with the plan's own text were left out.`}
      </p>
    </div>
  );
}
