import {describe,expect,it} from "vitest";
import {angleAtVertex,angleFromPitch,cameraElevation,cameraRoll,compassPoint,distanceFromBase,fallRatio,formatArea,formatMm,gradePercent,headingFromEvent,heightFromTop,pitchFromAngle,plumbError,polygonAreaMm2,polygonAreaPx,quadSidesMm,scaleFromReference,screenUp,smooth,surfaceTilt,upVector} from "./measure";

const close=(a:number,b:number,tol=0.05)=>expect(Math.abs(a-b)).toBeLessThanOrEqual(tol);

describe("gravity from orientation",()=>{
  it("points out of the screen when flat and along the top edge when upright",()=>{
    const [x,y,z]=upVector(0,0);close(x,0);close(y,0);close(z,1);
    const [ux,uy,uz]=upVector(90,0);close(ux,0);close(uy,1);close(uz,0);
  });
  it("stays continuous where Euler angles flip near vertical",()=>{
    const a=upVector(89.9,0),b=upVector(90.1,0);
    close(a[1],b[1],0.01);close(a[2],-b[2],0.01);
  });
  it("rotates in-screen components with the screen",()=>{
    const [x,y]=screenUp([0.5,0,0.87],90);close(x,0);close(y,0.5);
  });
});

describe("camera angles",()=>{
  it("reads level, down and up from beta",()=>{
    close(cameraElevation(90,0),0);
    close(cameraElevation(60,0),-30);
    close(cameraElevation(120,0),30);
  });
  it("reads roll of an upright phone from the gamma/beta pair",()=>{
    // Rolled 20° right: gamma parks at ±90 and beta carries the roll.
    close(Math.abs(cameraRoll(70,90)),20,0.1);
    close(cameraRoll(90,0),0);
  });
  it("reads surface tilt and fall",()=>{
    close(surfaceTilt(0,0),0);close(surfaceTilt(10,0),10);close(surfaceTilt(0,-10),10);
    expect(fallRatio(0)).toBeNull();
    expect(fallRatio(Math.atan(1/60)/(Math.PI/180))).toBe(60);
    close(gradePercent(45),100);
  });
  it("converts pitch and angle both ways",()=>{
    const p=pitchFromAngle(45);close(p.risePer12,12);close(p.risePerMetre,1000);
    close(angleFromPitch(4,12),18.43,0.01);
    expect(angleFromPitch(4,0)).toBe(0);
  });
});

describe("clinometer",()=>{
  it("finds distance from the base angle and height from the top angle",()=>{
    const d=distanceFromBase(1.6,-30)!;close(d,2.771,0.001);
    close(heightFromTop(1.6,d,40)!,1.6+d*Math.tan(40*Math.PI/180),0.001);
  });
  it("refuses angles that cannot give a distance",()=>{
    expect(distanceFromBase(1.6,10)).toBeNull();
    expect(distanceFromBase(0,-30)).toBeNull();
    expect(distanceFromBase(1.6,-89.9)).toBeNull();
    expect(heightFromTop(1.6,0,20)).toBeNull();
  });
});

describe("photo measure",()=>{
  it("scales from a known reference span",()=>{
    const s=scaleFromReference({x:0,y:0},{x:300,y:400},1000)!;close(s,2);
    expect(scaleFromReference({x:0,y:0},{x:1,y:1},90)).toBeNull();
    expect(scaleFromReference({x:0,y:0},{x:100,y:0},0)).toBeNull();
  });
  it("formats lengths for both unit systems",()=>{
    expect(formatMm(456)).toBe("456 mm");
    expect(formatMm(2450)).toBe("2.450 m");
    expect(formatMm(12450)).toBe("12.45 m");
    expect(formatMm(25.4,"imperial")).toBe("1.00″");
    expect(formatMm(914.4,"imperial")).toBe("3′ 0.0″");
  });
});

describe("compass",()=>{
  it("prefers the iOS heading, then absolute alpha",()=>{
    expect(headingFromEvent({alpha:100,webkitCompassHeading:45})).toBe(45);
    expect(headingFromEvent({alpha:90,absolute:true})).toBe(270);
    expect(headingFromEvent({alpha:90,absolute:false})).toBeNull();
    expect(compassPoint(0)).toBe("N");expect(compassPoint(210)).toBe("SW");expect(compassPoint(359)).toBe("N");
  });
  it("smooths readings",()=>{expect(smooth(null,10)).toBe(10);expect(smooth(0,10,0.5)).toBe(5);});
});

describe("photo shapes and plumb",()=>{
  it("measures a traced area and its sides",()=>{
    const sq=[{x:0,y:0},{x:100,y:0},{x:100,y:50},{x:0,y:50}];
    expect(polygonAreaPx(sq)).toBe(5000);
    expect(polygonAreaMm2(sq,2)).toBe(20000);
    expect(quadSidesMm(sq,2)).toEqual([200,100]);
    expect(quadSidesMm(sq.slice(0,3),2)).toBeNull();
    expect(polygonAreaPx(sq.slice(0,2))).toBe(0);
    expect(formatArea(2_450_000)).toBe("2.45 m²");
    expect(formatArea(24_500_000)).toBe("24.5 m²");
    expect(formatArea(929030.4,"imperial")).toBe("10.0 ft²");
  });
  it("reads the angle at a vertex",()=>{
    close(angleAtVertex({x:10,y:0},{x:0,y:0},{x:0,y:10}),90);
    close(angleAtVertex({x:10,y:0},{x:0,y:0},{x:10,y:-5.773}),30,0.05);
    expect(angleAtVertex({x:0,y:0},{x:0,y:0},{x:1,y:1})).toBe(0);
  });
  it("reads plumb from a phone held flat on a wall",()=>{
    close(plumbError(90,0),0);
    close(plumbError(88,0),2);
  });
});

import {rectifyFromRectangle,isConvexQuad,mappedDistance,mappedArea,mappedQuadSides,closureError} from "./measure";
describe("perspective rectification", () => {
  // A 1200 × 2400 sheet photographed at an angle: project it with a known homography.
  const project=(p:{x:number;y:number})=>{const w=0.0002*p.x+0.0001*p.y+1;return {x:(0.5*p.x+0.05*p.y+100)/w,y:(0.02*p.x+0.4*p.y+80)/w};};
  const sheet=[{x:0,y:0},{x:1200,y:0},{x:1200,y:2400},{x:0,y:2400}];
  const photo=sheet.map(project);
  const toMm=rectifyFromRectangle(photo,1200,2400)!;
  it("maps the reference corners back onto the rectangle", () => {
    const back=photo.map(toMm);
    back.forEach((p,i)=>{expect(p.x).toBeCloseTo(sheet[i].x,3);expect(p.y).toBeCloseTo(sheet[i].y,3);});
  });
  it("measures a skewed length in the same plane true", () => {
    const a=project({x:300,y:500}),b=project({x:900,y:1300});
    expect(mappedDistance(a,b,toMm)).toBeCloseTo(1000,2);
  });
  it("measures area and sides on the plane", () => {
    const quad=[{x:100,y:100},{x:700,y:100},{x:700,y:500},{x:100,y:500}].map(project);
    expect(mappedArea(quad,toMm)).toBeCloseTo(600*400,0);
    const sides=mappedQuadSides(quad,toMm)!;
    expect(sides[0]).toBeCloseTo(600,2);expect(sides[1]).toBeCloseTo(400,2);
  });
  it("refuses degenerate or crossed corners", () => {
    expect(rectifyFromRectangle([{x:0,y:0},{x:1,y:1},{x:2,y:2},{x:3,y:3}],10,10)).toBeNull();
    expect(isConvexQuad([{x:0,y:0},{x:10,y:10},{x:10,y:0},{x:0,y:10}])).toBe(false);
    expect(rectifyFromRectangle(photo,0,100)).toBeNull();
  });
  it("reports room closure error against the perimeter", () => {
    const e=closureError({x:0,y:0},{x:0.03,y:0.04},10)!;
    expect(e.mm).toBeCloseTo(50,6);expect(e.percent).toBeCloseTo(0.5,6);
    expect(closureError({x:0,y:0},{x:1,y:1},0)).toBeNull();
  });
});
