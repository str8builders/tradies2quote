import { getTool } from "./tools";
import { getVerifiedDefinition, type CalculatorOutput } from "./verified-calculators";
import { calculatorInputErrors, displayFactor } from "./calculator-inputs";

export type CalculationSnapshot = {version:1;slug:string;unit:"metric"|"imperial";values:Record<string,number|string>};
export const isUUID=(v:unknown):v is string=>typeof v==="string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

/** Legacy web length-converter unit codes; the native converter stores option ids. */
export const lengthFactors:Record<string,number>={mm:.001,cm:.01,m:1,km:1000,in:.0254,ft:.3048,yd:.9144,mi:1609.344};
const CONVERTER_UNIT_IDS:Record<string,number>={mm:0,in:1,cm:2,m:3,ft:4,yd:5,km:6,mi:7};

/**
 * Saved working written by the older web calculators used different input
 * keys from the native app. Records are upgraded on read, never rejected:
 * renamed keys move across, web-only keys are dropped, and any native input
 * the record predates is filled with its unit-converted default.
 */
const RENAMED_KEYS:Record<string,Record<string,string>>={
  "equal-spacing":{width:"memberWidth",target:"targetGap"},
  "tile-layout":{floor:"floorWidth",tile:"tileWidth",rowsInput:"rows"},
  "arc-circle":{segmentsInput:"segments"},
  "straight-stairs":{idealRise:"preferredRise"},
};
const DROPPED_KEYS:Record<string,string[]>={
  "tube-miter":["parentDiameter"],
  "tube-through-sheet":["parentDiameter"],
};

export function upgradeSnapshotValues(slug:string,unit:"metric"|"imperial",values:Record<string,number|string>):Record<string,number|string> {
  const out:Record<string,number|string>={...values};
  for(const [legacy,next] of Object.entries(RENAMED_KEYS[slug]??{}))if(legacy in out){if(!(next in out))out[next]=out[legacy];delete out[legacy];}
  for(const key of DROPPED_KEYS[slug]??[])delete out[key];
  if(slug==="all-unit-converter")for(const [legacy,next] of [["from","fromUnit"],["to","toUnit"]] as const){
    const v=out[legacy];if(typeof v==="string"){out[next]=CONVERTER_UNIT_IDS[v]??0;delete out[legacy];}
  }
  const fields=getVerifiedDefinition(slug).fields;
  for(const field of fields)if(!(field.key in out)){
    const value=field.default*displayFactor(field.kind,unit);
    out[field.key]=field.kind==="count"?Math.round(value):value;
  }
  return out;
}

export function validateSnapshot(input:unknown):CalculationSnapshot {
  if(!input || typeof input!=="object" || Array.isArray(input))throw new Error("Choose a calculator and enter its measurements.");
  const s={...input} as Partial<CalculationSnapshot>;
  if(s.version!==1 || typeof s.slug!=="string" || !getTool(s.slug) || !["metric","imperial"].includes(s.unit??"") || !s.values || typeof s.values!=="object" || Array.isArray(s.values))throw new Error("This calculation format is not supported.");
  const unit=s.unit!,slug=s.slug;
  const upgraded=upgradeSnapshotValues(slug,unit,s.values);
  const fields=getVerifiedDefinition(slug).fields;
  const allowed=new Set(fields.map(f=>f.key));
  if(Object.keys(upgraded).some(k=>!allowed.has(k)) || Object.keys(upgraded).length!==allowed.size || Object.values(upgraded).some(v=>typeof v!=="number"))throw new Error("The saved inputs do not match this calculator.");
  const values=upgraded as Record<string,number>;
  const errors=calculatorInputErrors(fields,values,unit);
  if(errors.length)throw new Error(errors[0]);
  const snapshot:CalculationSnapshot={version:1,slug,unit,values:Object.fromEntries([...allowed].sort().map(k=>[k,values[k]]))};
  const output=computeSnapshot(snapshot);
  if(output.errors?.length)throw new Error(output.errors[0]);
  return snapshot;
}

/** Every calculator, including the eight that used to have bespoke web screens, computes through its definition. */
export function computeSnapshot(s:CalculationSnapshot):CalculatorOutput {
  const values=Object.fromEntries(Object.entries(s.values).filter((e):e is [string,number]=>typeof e[1]==="number"));
  return getVerifiedDefinition(s.slug).compute(values,s.unit);
}
