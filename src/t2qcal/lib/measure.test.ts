import {describe,expect,it} from "vitest";
import {angleFromPitch,cameraElevation,cameraRoll,compassPoint,distanceFromBase,fallRatio,formatMm,gradePercent,headingFromEvent,heightFromTop,pitchFromAngle,scaleFromReference,screenUp,smooth,surfaceTilt,upVector} from "./measure";

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
