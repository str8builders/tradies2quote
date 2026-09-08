import { openingDefinition } from "./opening-layout";
import type { CalculatorField, VerifiedDefinition, VerifiedUnit } from "./verified-calculators";

const length = (key: string, label: string, value: number, min = .001): CalculatorField => ({key,label,default:value,kind:"length",min});
const count = (key: string, label: string, value: number, min = 0, max = 100): CalculatorField => ({key,label,default:value,kind:"count",min,max});
const f = (n:number) => new Intl.NumberFormat("en-NZ",{maximumFractionDigits:3}).format(n);
const L = (n:number,u:VerifiedUnit) => `${f(n)} ${u === "metric" ? "mm" : "in"}`;
const ceil = (v:number) => Math.ceil(v - 1e-10);
export function wallLayout(v:Record<string,number>) {
  const bays = Math.max(1,ceil((v.span-v.memberWidth)/v.targetGap));
  const centres = (v.span-v.memberWidth)/bays;
  const studLength = v.height-v.plates*v.memberWidth;
  const nogCount = bays*v.nogRows, nogLength = centres-v.memberWidth;
  const plateLength = v.span*v.plates;
  return {count:bays+1, centres, first:v.memberWidth/2, studLength,nogCount,nogLength,plateLength,
    totalLength:(bays+1)*studLength+nogCount*nogLength+plateLength, gap:nogLength,layoutKind:1};
}
export function rebarLayout(v:Record<string,number>) {
  const first=v.cover+v.memberWidth/2;
  const countX=Math.max(2,ceil((v.span-2*first)/v.targetGap)+1);
  const countY=Math.max(2,ceil((v.width-2*first)/v.targetGap)+1);
  const spacingX=(v.span-2*first)/(countX-1),spacingY=(v.width-2*first)/(countY-1);
  const cutX=v.span-2*v.cover,cutY=v.width-2*v.cover;
  return {first,countX,countY,spacingX,spacingY,cutX,cutY,
    count:countX,centres:spacingX,gap:spacingX-v.memberWidth,
    totalLength:(countX*cutY+countY*cutX)*v.layers,layoutKind:2};
}
export function kerfLayout(v:Record<string,number>) {
  const depth=v.thickness-v.skin, sweep=v.angle*Math.PI/180;
  const closeAngle=2*Math.atan(v.kerf/(2*depth));
  const count=Math.max(1,ceil(sweep/closeAngle));
  const neutralRadius=v.radius-v.skin/2, span=neutralRadius*sweep;
  const centres=span/count;
  return {count,span,centres,first:centres/2,depth,neutralRadius,
    innerRadius:v.radius-v.thickness,turn:sweep/count,
    remainingGap:v.kerf-2*depth*Math.tan(sweep/(2*count)),
    layoutKind:3,memberWidth:v.kerf,gap:centres-v.kerf};
}
export function layoutDefinition(slug:string):VerifiedDefinition|undefined {
  if(slug === "opening-layout") return openingDefinition;
  if(slug === "wall-framing") return {
    title:"Wall framing quantities",note:"A straight wall with full-height end studs, equal centres and continuous plates. Openings are handled separately.",diagram:"studwall",
    sheets:[{label:"Framing",diagram:"studwall"},{label:"Plate mark-out",diagram:"platemark"}],showsAssembly:false,
    fields:[length("span","Wall length",6000),length("height","Overall wall height",2400),length("memberWidth","Timber thickness",45),length("targetGap","Maximum stud centres",600),count("plates","Plate runs",3,2,4),count("nogRows","Rows of noggins",1,0,10)],
    compute(v,u) {const g=wallLayout(v);return {diagramValues:{...v,...g},results:[
      {label:"Stud count",value:String(g.count),primary:true},{label:"Stud cut length",value:L(g.studLength,u)},
      {label:"Actual stud centres",value:L(g.centres,u)},{label:"Plate total",value:L(g.plateLength,u)},
      {label:"Noggin count",value:String(g.nogCount)},{label:"Noggin cut length",value:L(g.nogLength,u)},
      {label:"Net timber total",value:L(g.totalLength,u)}],marks:Array.from({length:Math.min(g.count,1000)},(_,i)=>`${i+1} · centre ${L(g.first+i*g.centres,u)}`)};}
  };
  if(slug === "rebar-spacing") return {
    title:"Rebar spacing and weight",note:"Straight bars in both directions, equal centres within the selected maximum. Add lap, bend and anchorage allowances from the design.",diagram:"rebarplan",
    sheets:[{label:"Bar plan",diagram:"rebarplan"},{label:"Bar schedule",diagram:"barsection"}],showsAssembly:false,
    fields:[length("span","Slab length",6000),length("width","Slab width",4000),length("memberWidth","Bar diameter",12),length("targetGap","Maximum bar centres",200),length("cover","Clear edge cover",50,0),count("layers","Mesh layers",1,1,4)],
    compute(v,u) {const g=rebarLayout(v),factor=u === "metric"?.001:.0254;const kg=g.totalLength*factor*Math.PI*(v.memberWidth*factor)**2/4*7850;return {diagramValues:{...v,...g},results:[
      {label:"Total bars",value:String((g.countX+g.countY)*v.layers),primary:true},
      {label:"Lengthwise bars",value:`${g.countY*v.layers} × ${L(g.cutX,u)}`},{label:"Crosswise bars",value:`${g.countX*v.layers} × ${L(g.cutY,u)}`},
      {label:"Centres along length",value:L(g.spacingX,u)},{label:"Centres across width",value:L(g.spacingY,u)},
      {label:"Net bar length",value:L(g.totalLength,u)},{label:"Steel mass",value:`${f(kg)} kg`}],
      marks:Array.from({length:Math.min(g.countX,1000)},(_,i)=>`${i+1} · centre ${L(g.first+i*g.spacingX,u)}`)};}
  };
  if(slug === "kerf-bending") return {
    title:"Kerf bending geometry",note:"Outside radius and saw-cut geometry. Remaining skin and grain flexibility need a test piece; hold the board to the target curve.",diagram:"kerf",
    sheets:[{label:"Cut layout",diagram:"kerf"},{label:"Bent profile",diagram:"kerfbent"}],showsAssembly:false,
    fields:[length("radius","Outside bend radius",500),{key:"angle",label:"Sweep angle",default:90,kind:"angle",min:.1,max:360},length("thickness","Board thickness",18),length("skin","Remaining skin",3),length("kerf","Saw kerf width",3.2)],
    compute(v,u) {const g=kerfLayout(v);return {diagramValues:{...v,...g},results:[
      {label:"Kerf cuts",value:String(g.count),primary:true},{label:"Cut depth",value:L(g.depth,u)},
      {label:"Cut centres",value:L(g.centres,u)},{label:"Bend-zone length",value:L(g.span,u)},
      {label:"Inside radius",value:L(g.innerRadius,u)},{label:"Residual gap at target bend",value:L(Math.max(0,g.remainingGap),u)}],
      marks:Array.from({length:Math.min(g.count,1000)},(_,i)=>`${i+1} · centre ${L(g.first+i*g.centres,u)}`)};}
  };
}
