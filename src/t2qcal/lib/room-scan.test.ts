import {describe,expect,it} from "vitest";
import {boundingDims,cornerFromAim,perimeter,polygonArea,summariseRoom,wallLengths} from "./room-scan";
const close=(a:number,b:number,tol=0.01)=>expect(Math.abs(a-b)).toBeLessThanOrEqual(tol);
describe("room scan",()=>{
  it("places a corner from range and bearing",()=>{
    const c=cornerFromAim(1.6,-30,90)!;close(c.distance,2.771,0.001);close(c.x,2.771,0.001);close(c.y,0,0.001);
    const n=cornerFromAim(1.6,-45,0)!;close(n.x,0,0.001);close(n.y,1.6,0.001);
    expect(cornerFromAim(1.6,5,0)).toBeNull();
    expect(cornerFromAim(1.6,-30,Number.NaN)).toBeNull();
  });
  it("turns corners into floor, walls and a bounding box",()=>{
    const room=[{x:0,y:0},{x:4,y:0},{x:4,y:3},{x:0,y:3}];
    close(polygonArea(room),12);close(perimeter(room),14);
    expect(wallLengths(room).map(w=>Math.round(w*100)/100)).toEqual([4,3,4,3]);
    expect(boundingDims(room)).toEqual([4,3]);
    const s=summariseRoom(room,2.4);close(s.wallM2,33.6);close(s.length,4);close(s.width,3);
    expect(polygonArea(room.slice(0,2))).toBe(0);expect(perimeter(room.slice(0,2))).toBe(0);
  });
});
