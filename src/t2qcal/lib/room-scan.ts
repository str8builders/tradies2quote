/**
 * Room scan without ARKit: stand in one spot, aim the crosshair at each
 * floor corner and mark it. The camera height and the angle below level
 * give the distance to that corner; the compass gives its bearing. Corners
 * become a floor plan, the floor plan becomes walls, and the walls become
 * quantities. Accuracy is that of a phone compass and a steady hand — a
 * check and a starting point, not a survey.
 */
import {DEG,distanceFromBase} from "./measure";

export type Corner={x:number;y:number;distance:number;heading:number};

/** A corner's plan position (metres) from range and compass bearing; north is +y. */
export function cornerFromAim(cameraHeight:number,elevationDeg:number,headingDeg:number):Corner|null{
  const distance=distanceFromBase(cameraHeight,elevationDeg);
  if(distance===null||!Number.isFinite(headingDeg))return null;
  const h=headingDeg*DEG;
  return {x:Math.sin(h)*distance,y:Math.cos(h)*distance,distance,heading:((headingDeg%360)+360)%360};
}

export function polygonArea(points:Array<{x:number;y:number}>):number{
  if(points.length<3)return 0;
  let s=0;for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];s+=a.x*b.y-b.x*a.y;}
  return Math.abs(s)/2;
}

export function wallLengths(points:Array<{x:number;y:number}>):number[]{
  if(points.length<2)return [];
  return points.map((p,i)=>{const q=points[(i+1)%points.length];return Math.hypot(q.x-p.x,q.y-p.y);});
}

export function perimeter(points:Array<{x:number;y:number}>):number{
  return points.length<3?0:wallLengths(points).reduce((a,b)=>a+b,0);
}

/** Bounding length × width of the plan, metres, longest first. */
export function boundingDims(points:Array<{x:number;y:number}>):[number,number]{
  if(points.length===0)return [0,0];
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
  const w=Math.max(...xs)-Math.min(...xs),d=Math.max(...ys)-Math.min(...ys);
  return w>=d?[w,d]:[d,w];
}

export type RoomSummary={floorM2:number;perimeterM:number;wallM2:number;walls:number[];length:number;width:number};

export function summariseRoom(corners:Array<{x:number;y:number}>,wallHeightM:number):RoomSummary{
  const walls=wallLengths(corners),per=perimeter(corners),[length,width]=boundingDims(corners);
  return {floorM2:polygonArea(corners),perimeterM:per,wallM2:per*Math.max(0,wallHeightM),walls,length,width};
}
