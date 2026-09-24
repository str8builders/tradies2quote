import {describe,expect,it} from "vitest";
import {dominantEdge,edgeTilt,mmPerMetre} from "./edge-level";
import {SteadyTracker} from "./steady";

/** A soft step edge through the image centre at `deg` (clockwise, y down), dark on one side. */
function edgeImage(w:number,h:number,deg:number,extra?:(x:number,y:number)=>number){
  const g=new Float32Array(w*h),t=deg*Math.PI/180,nx=-Math.sin(t),ny=Math.cos(t);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const d=(x-w/2)*nx+(y-h/2)*ny;g[y*w+x]=40+170*Math.min(1,Math.max(0,.5+d/1.5))+(extra?.(x,y)??0);}
  return g;
}

describe("edge level", () => {
  for(const deg of [0,1.3,-2.7,6,-11.5])it(`finds a ${deg}° edge to a tenth of a degree`, () => {
    const e=dominantEdge(edgeImage(320,160,deg),320,160,0)!;
    expect(e).not.toBeNull();
    expect(Math.abs(e.angle-deg)).toBeLessThan(.1);
    expect(e.confidence).toBeGreaterThan(.5);
    expect(e.length).toBeGreaterThan(200);
  });
  it("finds a near-vertical edge in plumb mode", () => {
    const e=dominantEdge(edgeImage(160,320,91.8),160,320,90)!;
    expect(Math.abs(e.angle-91.8)).toBeLessThan(.1);
  });
  it("ignores weak texture and returns null on a blank frame", () => {
    expect(dominantEdge(new Float32Array(200*100).fill(120),200,100,0)).toBeNull();
    const noisy=edgeImage(320,160,2,(x,y)=>((x*7+y*13)%5)-2);
    expect(Math.abs(dominantEdge(noisy,320,160,0)!.angle-2)).toBeLessThan(.2);
  });
  it("picks the strongest of two parallel edges", () => {
    const w=320,h=160,g=new Float32Array(w*h);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++)g[y*w+x]=y<50?30:y<110?220:180;
    const e=dominantEdge(g,w,h,0)!;
    expect(Math.abs(e.angle)).toBeLessThan(.1);
    expect(Math.abs((e.y1+e.y2)/2-49.5)).toBeLessThan(2);
  });
  it("takes the phone roll off and converts to fall", () => {
    expect(edgeTilt(-2,2,0)).toBeCloseTo(0,9);
    expect(edgeTilt(1,0,0)).toBe(1);
    expect(edgeTilt(92,-.5,90)).toBeCloseTo(1.5,9);
    expect(mmPerMetre(1)).toBeCloseTo(17.455,2);
  });
});

describe("steady hold", () => {
  it("locks once readings stop wandering, and holds until moved", () => {
    const s=new SteadyTracker(800,.06,.4,8);
    let r=s.push(10,0);
    for(let t=0;t<600;t+=50)r=s.push(t%100?2:5,t);
    expect(r.state).toBe("moving");
    for(let t=600;t<=1700;t+=50)r=s.push(1+(t%100?.02:-.02),t);
    expect(r.state).toBe("locked");
    expect(r.value).toBeCloseTo(1,1);
    expect(s.push(1.2,1750).state).toBe("locked");
    expect(s.push(3,1800).state).toBe("moving");
  });
});
