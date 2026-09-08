import type { VerifiedDefinition } from "./verified-calculators";

/** Rough opening measured between jack studs and below the header. Header size is supplied by the design. */
export function openingLayout(v: Record<string, number>) {
  const t = v.memberWidth, bays = Math.max(1, Math.ceil((v.span - t) / v.targetGap - 1e-10));
  const centres = (v.span - t) / bays, studLength = v.height - v.plates * t;
  const headerBottom = v.openBottom + v.openHeight, headerTop = headerBottom + v.headerDepth;
  const jackLength = headerBottom - t, topCut = v.height - (v.plates - 1) * t - headerTop;
  const bottomCut = v.openBottom > 0 ? v.openBottom - 2 * t : 0;
  const regular: number[] = [], cripples: number[] = [];
  for (let i = 0; i <= bays; i++) {
    const x = i * centres;
    if (x + t <= v.openLeft - 2 * t + 1e-9 || x >= v.openLeft + v.openWidth + 2 * t - 1e-9) regular.push(x);
    if (x >= v.openLeft - 1e-9 && x + t <= v.openLeft + v.openWidth + 1e-9) cripples.push(x);
  }
  return { centres, studLength, headerBottom, headerTop, jackLength, topCut, bottomCut,
    headerLength: v.openWidth + 2 * t, regular, cripples, fullCount: regular.length + 2,
    topCount: topCut > 0 ? cripples.length : 0, bottomCount: bottomCut > 0 ? cripples.length : 0 };
}
export const openingDefinition: VerifiedDefinition = {
  title: "Door and window framing layout", diagram: "studwall", showsAssembly: false,
  note: "One rectangular rough opening. Enter the header depth from the approved design; this calculator sets out members and does not size structural headers.",
  sheets: [{label:"Framing",diagram:"studwall"},{label:"Opening detail",diagram:"openingdetail"}],
  fields: [
    ["span","Wall length",6000], ["height","Overall wall height",2400], ["memberWidth","Timber thickness",45],
    ["targetGap","Maximum stud centres",600], ["openLeft","Opening left from wall end",1800],
    ["openWidth","Clear opening width",1200], ["openHeight","Clear opening height",1200],
    ["openBottom","Opening bottom above floor",900], ["headerDepth","Designed header depth",190],
  ].map(([key,label,value]) => ({key:String(key),label:String(label),default:Number(value),kind:"length" as const,min:key==="openBottom"?0:.001}))
    .concat([]),
  compute(v,u) {
    // Plate count is explicit and shared by both runtimes.
    const g = openingLayout(v), suffix = u === "metric" ? "mm" : "in";
    const len = (n:number) => `${new Intl.NumberFormat("en-NZ",{maximumFractionDigits:3}).format(n)} ${suffix}`;
    return {diagramValues:{...v,layoutKind:4,centres:g.centres,studLength:g.studLength,headerBottom:g.headerBottom,
      headerTop:g.headerTop,jackLength:g.jackLength,topCut:g.topCut,bottomCut:g.bottomCut,headerLength:g.headerLength},
      results:[{label:"Full-height studs including kings",value:String(g.fullCount),primary:true},
      {label:"Full-height stud cut",value:len(g.studLength)},{label:"Jack studs",value:`2 × ${len(g.jackLength)}`},
      {label:"Header cut length",value:len(g.headerLength)},{label:"Top cripples",value:`${g.topCount} × ${len(g.topCut)}`},
      {label:"Bottom cripples",value:`${g.bottomCount} × ${len(g.bottomCut)}`},
      {label:"Sill cut length",value:v.openBottom>0?len(v.openWidth):"Door opening — no sill"},
      {label:"Plate total",value:len(v.span*v.plates)}],
      marks:[...g.regular.map(x=>({label:"Stud",x:x+v.memberWidth/2})),
        {label:"Left king",x:v.openLeft-1.5*v.memberWidth},{label:"Left jack",x:v.openLeft-.5*v.memberWidth},
        {label:"Right jack",x:v.openLeft+v.openWidth+.5*v.memberWidth},{label:"Right king",x:v.openLeft+v.openWidth+1.5*v.memberWidth}]
        .sort((a,b)=>a.x-b.x).map(p=>`${p.label} centre ${len(p.x)}`)};
  },
};
openingDefinition.fields.push({key:"plates",label:"Plate runs",default:3,kind:"count",min:2,max:4});
