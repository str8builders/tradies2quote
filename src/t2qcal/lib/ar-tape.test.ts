import {describe,expect,it} from "vitest";
import {closedPlan,dist3,planSides,poseOrigin,runLength,runSegments,segmentParts} from "./ar-tape";

describe("AR tape maths", () => {
  it("measures segments and a whole run", () => {
    const run=[{x:0,y:0,z:0},{x:3,y:0,z:4},{x:3,y:2,z:4}];
    expect(runSegments(run)).toEqual([5,2]);
    expect(runLength(run)).toBe(7);
    expect(dist3(run[0],run[2])).toBeCloseTo(Math.sqrt(29),9);
  });
  it("splits a sloping hop into level run and rise", () => {
    const p=segmentParts({x:0,y:1,z:0},{x:0,y:1.5,z:2});
    expect(p.level).toBe(2);expect(p.rise).toBe(.5);
  });
  it("closes a floor outline into plan area and sides", () => {
    const room=[{x:0,y:0,z:0},{x:4,y:0,z:0},{x:4,y:0.01,z:3},{x:0,y:0,z:3}];
    const plan=closedPlan(room)!;
    expect(plan.area).toBeCloseTo(12,9);
    expect(plan.perimeter).toBeCloseTo(14,3);
    expect(planSides(room)).toEqual([4,3]);
    expect(closedPlan(room.slice(0,2))).toBeNull();
  });
  it("reads a pose translation", () => {
    const m=new Float32Array(16);m[12]=1;m[13]=2;m[14]=3;
    expect(poseOrigin(m)).toEqual({x:1,y:2,z:3});
  });
});
