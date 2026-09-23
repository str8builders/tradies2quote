/**
 * Maths for the WebXR AR tape. Points are world positions in metres from
 * the headset/phone tracking space: y is up, x and z lie on the floor.
 * A "run" is one chain of taps; each hop is a measured segment.
 */
export type V3={x:number;y:number;z:number};

export const dist3=(a:V3,b:V3)=>Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z);

/** Segment lengths of one run, in metres. */
export function runSegments(run:V3[]):number[]{
  const out:number[]=[];
  for(let i=1;i<run.length;i++)out.push(dist3(run[i-1],run[i]));
  return out;
}

export function runLength(run:V3[]){return runSegments(run).reduce((a,b)=>a+b,0);}

/** Split of one segment into level run and plumb rise, metres. */
export function segmentParts(a:V3,b:V3){return {level:Math.hypot(b.x-a.x,b.z-a.z),rise:b.y-a.y};}

/**
 * Plan area (m²) of a closed run projected onto the floor, and its
 * perimeter including the closing hop. Null below three points.
 */
export function closedPlan(run:V3[]):{area:number;perimeter:number}|null{
  if(run.length<3)return null;
  let s=0,per=0;
  for(let i=0;i<run.length;i++){const a=run[i],b=run[(i+1)%run.length];s+=a.x*b.z-b.x*a.z;per+=dist3(a,b);}
  return {area:Math.abs(s)/2,perimeter:per};
}

/** Level length and width of a four-corner closed run (averaging opposite sides), longest first. */
export function planSides(run:V3[]):[number,number]|null{
  if(run.length!==4)return null;
  const side=(i:number)=>segmentParts(run[i],run[(i+1)%4]).level;
  const a=(side(0)+side(2))/2,b=(side(1)+side(3))/2;
  return a>=b?[a,b]:[b,a];
}

/** Position part of a column-major 4×4 pose matrix. */
export function poseOrigin(m:ArrayLike<number>):V3{return {x:m[12],y:m[13],z:m[14]};}
