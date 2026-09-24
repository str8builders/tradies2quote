import {describe,expect,it} from "vitest";
import {convexHull,lassoSegment,measureMask,minAreaRect,regionGrow,snapToCorner,squareCheck,polygonMask} from "./photo-auto";
import {layoutCount,layoutSegments,LAYOUTS} from "./setout-overlay";
import {rectifyFromRectangle,unrectifyFromRectangle} from "./measure";

/** RGBA image: grey wall with a darker door rectangle (and a little noise). */
function doorImage(w:number,h:number,door:{x0:number;y0:number;x1:number;y1:number}){
  const data=new Uint8ClampedArray(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4,inDoor=x>=door.x0&&x<door.x1&&y>=door.y0&&y<door.y1,n=((x*31+y*17)%7)-3;
    const v=inDoor?[120+n,82+n,50+n]:[210+n,208+n,200+n];data[i]=v[0];data[i+1]=v[1];data[i+2]=v[2];data[i+3]=255;}
  return {data,width:w,height:h};
}
const scale2=(p:{x:number;y:number})=>({x:p.x*2,y:p.y*2}); // 2 mm per pixel, square-on

describe("tap to measure", () => {
  const img=doorImage(200,300,{x0:60,y0:40,x1:141,y1:239});
  it("grows the tapped object and measures it true", () => {
    const m=regionGrow(img,{x:100,y:150})!;
    expect(m.count).toBe(81*199);
    const r=measureMask(m,scale2)!;
    expect(r.widthMm).toBeCloseTo(398,0);expect(r.heightMm).toBeCloseTo(162,0);
    expect(r.areaMm2).toBeCloseTo(81*199*4,0);
  });
  it("refuses a tap that leaks across the whole photo", () => {
    const flat=doorImage(100,100,{x0:0,y0:0,x1:0,y1:0});
    expect(regionGrow(flat,{x:50,y:50})).toBeNull();
  });
  it("finds the object inside a rough loop", () => {
    const loop=[{x:40,y:20},{x:165,y:25},{x:170,y:270},{x:35,y:260}];
    const m=lassoSegment(img,loop)!;
    expect(Math.abs(m.count-81*199)).toBeLessThan(81*199*.02);
  });
  it("fills polygons, hulls and fits a rotated rectangle", () => {
    expect(polygonMask(10,10,[{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10}]).reduce((a,b)=>a+b,0)).toBe(100);
    const t=30*Math.PI/180,pts=[[0,0],[400,0],[400,200],[0,200],[200,100]].map(([x,y])=>({x:x*Math.cos(t)-y*Math.sin(t),y:x*Math.sin(t)+y*Math.cos(t)}));
    const hull=convexHull(pts);expect(hull.length).toBe(4);
    const r=minAreaRect(hull)!;expect(r.long).toBeCloseTo(400,6);expect(r.short).toBeCloseTo(200,6);
  });
  it("snaps a near miss onto the real corner", () => {
    const w=120,h=120,g=new Float32Array(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++)g[y*w+x]=x>=60&&y>=50?200:40;
    const s=snapToCorner(g,w,h,{x:66,y:45},10);
    expect(Math.hypot(s.x-60,s.y-50)).toBeLessThanOrEqual(1.5);
    const flat=new Float32Array(w*h).fill(90);expect(snapToCorner(flat,w,h,{x:30,y:30})).toEqual({x:30,y:30});
  });
  it("checks square by diagonals", () => {
    const s=squareCheck([{x:0,y:0},{x:100,y:0},{x:100,y:50},{x:0,y:50}],scale2)!;
    expect(s.diff).toBeCloseTo(0,9);
    expect(squareCheck([{x:0,y:0},{x:100,y:0},{x:104,y:50},{x:0,y:50}],scale2)!.diff).toBeGreaterThan(5);
  });
});

describe("layout on the photo", () => {
  it("round-trips plane millimetres through the photo", () => {
    const photo=[{x:100,y:80},{x:560,y:100},{x:550,y:720},{x:180,y:840}];
    const toMm=rectifyFromRectangle(photo,1200,2400)!,toPx=unrectifyFromRectangle(photo,1200,2400)!;
    const p=toPx({x:600,y:900});expect(p.ok).toBe(true);const back=toMm(p);
    expect(back.x).toBeCloseTo(600,4);expect(back.y).toBeCloseTo(900,4);
  });
  it("sets out stud centres and tile joints from the reference corner", () => {
    const studs=LAYOUTS.find(l=>l.id==="studs600")!;
    const segs=layoutSegments(studs,{x0:-100,y0:0,x1:2500,y1:2400});
    expect(segs.map(s=>s[0].x)).toEqual([0,600,1200,1800,2400]);
    expect(layoutCount(studs,[{x:0,y:0},{x:3000,y:0},{x:3000,y:2400},{x:0,y:2400}])!.lines).toBe(6);
  });
  it("counts full and cut tiles in a traced floor", () => {
    const tile=LAYOUTS.find(l=>l.id==="tile600")!;
    const c=layoutCount(tile,[{x:0,y:0},{x:1900,y:0},{x:1900,y:1300},{x:0,y:1300}])!;
    expect(c.full).toBe(6);expect(c.cut).toBe(6);
    // a 1 mm strip down one side still needs a cut on each tile it touches
    expect(layoutCount(tile,[{x:0,y:0},{x:1810,y:0},{x:1810,y:1206},{x:0,y:1206}])!.cut).toBe(2);
  });
});

describe("tap to measure on an angled wall", () => {
  // the browser test scene: a 1200 × 2400 GIB sheet and a 900 × 1200 window on a wall shot at an angle
  const P=(p:{x:number;y:number})=>{const w=.00008*p.x+.00003*p.y+1;return {x:(.18*p.x+.012*p.y+60)/w,y:(.006*p.x+.17*p.y+40)/w};};
  const W=700,H=520,data=new Uint8ClampedArray(W*H*4);
  const paint=(x0:number,y0:number,x1:number,y1:number,c:number[])=>{const m=polygonMask(W,H,[[x0,y0],[x1,y0],[x1,y1],[x0,y1]].map(([x,y])=>P({x,y})));for(let i=0;i<W*H;i++)if(m[i]){data[i*4]=c[0];data[i*4+1]=c[1];data[i*4+2]=c[2];data[i*4+3]=255;}};
  paint(0,0,4000,2600,[217,212,199]);paint(200,100,1400,2500,[244,239,226]);paint(2200,500,3100,1700,[44,74,107]);
  it("reads the window within 1% from exact reference corners", () => {
    const toMm=rectifyFromRectangle([[200,100],[1400,100],[1400,2500],[200,2500]].map(([x,y])=>P({x,y})),1200,2400)!;
    const m=regionGrow({data,width:W,height:H},P({x:2650,y:1100}))!;
    const r=measureMask(m,p=>{const q=toMm(p);return {x:q.x-200,y:q.y-100};})!;
    expect(Math.abs(r.widthMm-1200)/1200).toBeLessThan(.01);
    expect(Math.abs(r.heightMm-900)/900).toBeLessThan(.015);
  });
});
