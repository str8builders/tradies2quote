/**
 * Layout on the photo. With a known rectangle tapped on a wall or floor, the
 * photo has a true millimetre grid; this lays stud centres, sheet joints,
 * tile joints or board courses onto that surface at their real spacing, set
 * out from corner 1 of the reference. Traced areas then give honest counts —
 * full and cut tiles or sheets, studs across a wall — before anything is
 * bought, and the marked-up photo shows the customer where joints will land.
 */
export type P={x:number;y:number};
export type LayoutSpec=
  |{id:string;label:string;type:"lines-v"|"lines-h";spacing:number;unit:string}
  |{id:string;label:string;type:"grid";w:number;h:number;joint:number;unit:string};

export const LAYOUTS:LayoutSpec[]=[
  {id:"studs600",label:"Studs at 600 mm centres",type:"lines-v",spacing:600,unit:"studs"},
  {id:"studs400",label:"Studs at 400 mm centres",type:"lines-v",spacing:400,unit:"studs"},
  {id:"gib-v",label:"GIB 1200 × 2400, standing",type:"grid",w:1200,h:2400,joint:0,unit:"sheets"},
  {id:"gib-h",label:"GIB 2400 × 1200, laid flat",type:"grid",w:2400,h:1200,joint:0,unit:"sheets"},
  {id:"tile600",label:"Tiles 600 × 600, 3 mm joint",type:"grid",w:600,h:600,joint:3,unit:"tiles"},
  {id:"tile300",label:"Tiles 300 × 300, 3 mm joint",type:"grid",w:300,h:300,joint:3,unit:"tiles"},
  {id:"tile300x600",label:"Tiles 600 × 300, 3 mm joint",type:"grid",w:600,h:300,joint:3,unit:"tiles"},
  {id:"deck140",label:"Deck boards 140 + 5 mm gap",type:"lines-h",spacing:145,unit:"boards"},
  {id:"weather180",label:"Weatherboards, 180 mm cover",type:"lines-h",spacing:180,unit:"courses"},
];

export type Extent={x0:number;y0:number;x1:number;y1:number};

/** Joint and centre lines (mm) covering `extent`, capped so a runaway extent cannot flood the drawing. */
export function layoutSegments(spec:LayoutSpec,extent:Extent,cap=600):Array<[P,P]>{
  const out:Array<[P,P]>=[];const {x0,y0,x1,y1}=extent;
  const run=(pitch:number,from:number,to:number,fn:(v:number)=>void)=>{if(!(pitch>0))return;for(let k=Math.ceil(from/pitch);k<=Math.floor(to/pitch)&&out.length<cap;k++)fn(k*pitch+0);};
  if(spec.type==="grid"){run(spec.w+spec.joint,x0,x1,x=>out.push([{x,y:y0},{x,y:y1}]));run(spec.h+spec.joint,y0,y1,y=>out.push([{x:x0,y},{x:x1,y}]));}
  else if(spec.type==="lines-v")run(spec.spacing,x0,x1,x=>out.push([{x,y:y0},{x,y:y1}]));
  else run(spec.spacing,y0,y1,y=>out.push([{x:x0,y},{x:x1,y}]));
  return out;
}

export function pointInPolygon(p:P,poly:P[]):boolean{
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;}
  return inside;
}

/**
 * Counts inside a traced outline (mm on the plane). Grids: pieces wholly
 * inside and pieces that need cutting. Lines: how many run through the area.
 */
export function layoutCount(spec:LayoutSpec,poly:P[]):{full:number;cut:number;lines:number}|null{
  if(poly.length<3)return null;
  const xs=poly.map(p=>p.x),ys=poly.map(p=>p.y),bx0=Math.min(...xs),bx1=Math.max(...xs),by0=Math.min(...ys),by1=Math.max(...ys);
  if(![bx0,bx1,by0,by1].every(Number.isFinite))return null;
  if(spec.type!=="grid"){
    const pitch=spec.spacing,lo=spec.type==="lines-v"?bx0:by0,hi=spec.type==="lines-v"?bx1:by1;
    let lines=0;
    for(let k=Math.ceil(lo/pitch);k<=Math.floor(hi/pitch)&&lines<10000;k++){
      const v=k*pitch,steps=40;let hit=false;
      // nudge either side so a line lying on the outline (an end stud) still counts
      for(let s=0;s<=steps&&!hit;s++)for(const e of [-.5,.5]){const t=spec.type==="lines-v"?{x:v+e,y:by0+(by1-by0)*s/steps}:{x:bx0+(bx1-bx0)*s/steps,y:v+e};if(pointInPolygon(t,poly)){hit=true;break;}}
      if(hit)lines++;
    }
    return {full:0,cut:0,lines};
  }
  const pw=spec.w+spec.joint,ph=spec.h+spec.joint;let full=0,cut=0;
  const cells=(Math.floor(bx1/pw)-Math.floor(bx0/pw)+1)*(Math.floor(by1/ph)-Math.floor(by0/ph)+1);
  if(!(cells>0)||cells>20000)return null;
  const tile=spec.w*spec.h;
  for(let i=Math.floor(bx0/pw);i<=Math.floor(bx1/pw);i++)for(let j=Math.floor(by0/ph);j<=Math.floor(by1/ph);j++){
    // exact overlap of this piece with the outline, so thin edge strips still count as cuts
    const share=polygonArea(clipToRect(poly,i*pw,j*ph,i*pw+spec.w,j*ph+spec.h))/tile;
    if(share>=.9999)full++;else if(share>1e-4)cut++;
  }
  return {full,cut,lines:0};
}

export function polygonArea(poly:P[]):number{let s=0;for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length];s+=a.x*b.y-b.x*a.y;}return Math.abs(s)/2;}

/** Sutherland–Hodgman clip of a polygon to an axis-aligned rectangle. */
export function clipToRect(poly:P[],x0:number,y0:number,x1:number,y1:number):P[]{
  let out=poly;
  const edges:Array<[(p:P)=>boolean,(a:P,b:P)=>P]>=[
    [p=>p.x>=x0,(a,b)=>({x:x0,y:a.y+(b.y-a.y)*(x0-a.x)/(b.x-a.x)})],
    [p=>p.x<=x1,(a,b)=>({x:x1,y:a.y+(b.y-a.y)*(x1-a.x)/(b.x-a.x)})],
    [p=>p.y>=y0,(a,b)=>({x:a.x+(b.x-a.x)*(y0-a.y)/(b.y-a.y),y:y0})],
    [p=>p.y<=y1,(a,b)=>({x:a.x+(b.x-a.x)*(y1-a.y)/(b.y-a.y),y:y1})],
  ];
  for(const [inside,cross] of edges){
    const input=out;out=[];if(!input.length)break;
    for(let i=0;i<input.length;i++){const cur=input[i],prev=input[(i+input.length-1)%input.length],ci=inside(cur),pi=inside(prev);
      if(ci){if(!pi)out.push(cross(prev,cur));out.push(cur);}else if(pi)out.push(cross(prev,cur));}
  }
  return out;
}
