import { getTool } from "./tools";
import { getVerifiedDefinition, type CalculatorOutput, type CalculatorField } from "./verified-calculators";
import { calculatorInputErrors } from "./calculator-inputs";
import { calculateRafter, calculateStairs, calculateEqualSpacing, calculateConcrete, calculateTileFit, calculateCircle, calculatePitch } from "./calculations";
export type CalculationSnapshot = {version:1;slug:string;unit:"metric"|"imperial";values:Record<string,number|string>};
export const isUUID=(v:unknown):v is string=>typeof v==="string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const field=(key:string,kind:CalculatorField["kind"]="length",min=0.001,max=1e6):CalculatorField=>({key,label:key,kind,min,max,default:0});
const custom:Record<string,CalculatorField[]>={
  "common-rafter":[field("run"),field("angle","angle",0,85),field("overhang","length",0),field("depth"),field("thickness"),field("seat","length",0),field("wallHeight","length",0)],
  "straight-stairs":[field("totalRise"),field("idealRise"),field("run"),field("width"),field("floorThickness","length",0),field("headroom","length",0)],
  "equal-spacing":[field("span"),field("width","length",0),field("target","length",0)],
  "concrete-slab":[field("length"),field("width"),field("thickness"),field("waste","percent",0,100),field("rate","money",0,1e6)],
  "tile-layout":[field("floor"),field("tile"),field("joint","length",0),field("rowsInput","count",1,24),field("waste","percent",0,100)],
  "arc-circle":[field("diameter"),field("segmentsInput","count",3,48)],
  "pitch-angle":[field("rise","length",0),field("run")],
  "all-unit-converter":[field("value","number",0,1e9)],
};
export const lengthFactors:Record<string,number>={mm:.001,cm:.01,m:1,km:1000,in:.0254,ft:.3048,yd:.9144,mi:1609.344};
export function validateSnapshot(input:unknown):CalculationSnapshot {
  if(!input || typeof input!=="object" || Array.isArray(input))throw new Error("Choose a calculator and enter its measurements.");
  const s=input as Partial<CalculationSnapshot>;
  if(s.version!==1 || typeof s.slug!=="string" || !getTool(s.slug) || !["metric","imperial"].includes(s.unit??"") || !s.values || typeof s.values!=="object" || Array.isArray(s.values))throw new Error("This calculation format is not supported.");
  const unit=s.unit!,fields=custom[s.slug]??getVerifiedDefinition(s.slug).fields;
  const allowed=new Set([...fields.map(f=>f.key),...(s.slug==="all-unit-converter"?["from","to"]:[])]);
  if(Object.keys(s.values).some(k=>!allowed.has(k)) || Object.keys(s.values).length!==allowed.size)throw new Error("The saved inputs do not match this calculator.");
  const errors=calculatorInputErrors(fields,s.values as Record<string,number>,unit);
  if(errors.length)throw new Error(errors[0]);
  const v=s.values as Record<string,number>;
  if(s.slug==="all-unit-converter" && (!["from","to"].every(k=>typeof s.values![k]==="string" && Object.prototype.hasOwnProperty.call(lengthFactors,s.values![k]))))throw new Error("Select a supported length unit.");
  if(s.slug==="common-rafter" && v.seat*Math.tan(v.angle*Math.PI/180)>=v.depth)throw new Error("The seat cut must leave timber above the notch.");
  if(s.slug==="straight-stairs" && Math.round(v.totalRise/v.idealRise)>60)throw new Error("This layout supports up to 60 risers. Split a longer stair into flights.");
  if(s.slug==="equal-spacing" && (v.width>v.span || v.width+v.target<=0 || (v.span-v.target)/(v.width+v.target)>500))throw new Error("Members must fit within the span, with at most 500 positions.");
  if(s.slug==="tile-layout" && (v.floor+v.joint)/(v.tile+v.joint)>499)throw new Error("Split this layout into runs of at most 499 tiles.");
  const snapshot:CalculationSnapshot={version:1,slug:s.slug,unit,values:Object.fromEntries([...allowed].sort().map(k=>[k,s.values![k]]))};
  const output=computeSnapshot(snapshot);
  if(output.errors?.length)throw new Error(output.errors[0]);
  return snapshot;
}
export function computeSnapshot(s:CalculationSnapshot):CalculatorOutput {
  const v=s.values as Record<string,number>,metric=s.unit==="metric",u=metric?"mm":"in";
  const text=(x:number)=>Number.isFinite(x)?Number(x.toPrecision(12)).toString():"Invalid";
  const result=(label:string,value:number,unit="",primary=false)=>({label,value:`${text(value)}${unit?" "+unit:""}`,primary});
  switch(s.slug){
    case "common-rafter": {const g=calculateRafter(v.run,v.angle,v.overhang,v.depth,v.seat,v.wallHeight);return{diagramValues:g,results:[result("Rafter length",g.totalLength,u,true),result("Rise",g.rise,u),result("Plumb cut",g.plumbCut,u)]};}
    case "straight-stairs": {const g=calculateStairs(v.totalRise,v.idealRise,v.run,v.floorThickness,v.headroom);return{diagramValues:g,results:[result("Actual rise",g.actualRise,u,true),result("Risers",g.risers),result("Treads",g.treads),result("Total run",g.totalRun,u),result("Stringer line",g.stringer,u)]};}
    case "equal-spacing": {const g=calculateEqualSpacing(v.span,v.width,v.target);return{results:[result("Clear gap",g.gap,u,true),result("Members",g.count),result("Centres",g.center,u)]};}
    case "concrete-slab": {const g=calculateConcrete(v.length,v.width,v.thickness,v.waste,metric);return{diagramValues:g,results:[result("Order volume",metric?g.orderVolume:g.orderVolume/27,metric?"m³":"yd³",true),result("Net volume",metric?g.rawVolume:g.rawVolume/27,metric?"m³":"yd³"),result("Plan area",g.area,metric?"m²":"ft²")]};}
    case "tile-layout": {const g=calculateTileFit(v.floor,v.tile,v.joint);return{diagramValues:{count:g.count,edge:g.edge},results:[result("Equal end cuts",g.edge,u,true),result("Tiles across",g.count),result("Tiles with allowance",Math.ceil(g.count*v.rowsInput*(1+v.waste/100)),"tiles")]};}
    case "arc-circle": {const g=calculateCircle(v.diameter,v.segmentsInput);return{diagramValues:g,results:[result("Circumference",g.circumference,u,true),result("Chord",g.chord,u),result("Segment angle",g.angle,"°")]};}
    case "pitch-angle": {const g=calculatePitch(v.rise,v.run);return{diagramValues:g,results:[result("Angle",g.angle,"°",true),result("Grade",g.percent,"%"),result("Slope length",g.slopeLength,u)]};}
    case "all-unit-converter": {const from=s.values.from as string,to=s.values.to as string;return{results:[result("Converted length",v.value*lengthFactors[from]/lengthFactors[to],to,true)]};}
    default:return getVerifiedDefinition(s.slug).compute(v,s.unit);
  }
}
