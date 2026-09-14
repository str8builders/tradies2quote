/**
 * Camera measuring maths for the T2QCAL Measure tab.
 *
 * Everything here is derived from the device's gravity direction expressed
 * in the phone's own axes. That vector comes from DeviceOrientation beta and
 * gamma through the W3C rotation matrix (Z-X'-Y''), which stays continuous
 * where the raw Euler angles flip near vertical — the usual reason web
 * inclinometers jitter when a phone is held upright. Device axes: x to the
 * right of the screen, y toward the top edge, z out of the screen; the back
 * camera looks along -z.
 */
export const DEG=Math.PI/180;
const clamp=(v:number,lo:number,hi:number)=>Math.min(hi,Math.max(lo,v));

/** Earth "up" expressed in device coordinates, unit length. */
export function upVector(betaDeg:number,gammaDeg:number):[number,number,number]{
  const b=betaDeg*DEG,g=gammaDeg*DEG;
  return [-Math.sin(g)*Math.cos(b),Math.sin(b),Math.cos(g)*Math.cos(b)];
}

/** Rotate the in-screen components of `up` so they match what is drawn, for a rotated screen. */
export function screenUp(up:[number,number,number],screenAngle:number):[number,number,number]{
  const a=((screenAngle%360)+360)%360*DEG,[x,y,z]=up;
  return [x*Math.cos(a)-y*Math.sin(a),x*Math.sin(a)+y*Math.cos(a),z];
}

/** Angle of the back camera's line of sight above horizontal, in degrees. Negative looks down. */
export function cameraElevation(betaDeg:number,gammaDeg:number):number{
  const [,,z]=upVector(betaDeg,gammaDeg);
  return Math.asin(clamp(-z,-1,1))/DEG;
}

/** Sideways roll of a phone held up in portrait, in degrees. Positive = right edge low. */
export function cameraRoll(betaDeg:number,gammaDeg:number):number{
  const [x,y]=upVector(betaDeg,gammaDeg);
  return Math.atan2(-x,y)/DEG;
}

/** Tilt of the phone's back (lying on a surface) from horizontal, in degrees. */
export function surfaceTilt(betaDeg:number,gammaDeg:number):number{
  const [,,z]=upVector(betaDeg,gammaDeg);
  return Math.acos(clamp(Math.abs(z),0,1))/DEG;
}

/** Fall expressed as 1 in n (n rounded), or null when level. */
export function fallRatio(tiltDeg:number):number|null{
  const t=Math.tan(tiltDeg*DEG);
  if(t<1e-4)return null;
  return Math.round(1/t);
}

export function gradePercent(tiltDeg:number){return Math.tan(tiltDeg*DEG)*100;}

/** Roof pitch as rise per 12 of run (imperial habit) and rise per metre. */
export function pitchFromAngle(angleDeg:number){
  const t=Math.tan(Math.abs(angleDeg)*DEG);
  return {risePer12:t*12,risePerMetre:t*1000};
}

export function angleFromPitch(rise:number,run:number){return run<=0?0:Math.atan2(rise,run)/DEG;}

/**
 * Clinometer (two-tap height & distance). The camera sits `cameraHeight`
 * above the ground, level with where the tradie is standing.
 * Aim at the base: the angle BELOW horizontal gives the distance.
 * Then aim at the top: the angle ABOVE horizontal gives the height.
 */
export function distanceFromBase(cameraHeight:number,baseElevationDeg:number):number|null{
  const depression=-baseElevationDeg;
  if(!(cameraHeight>0)||depression<=0.5||depression>=89.5)return null;
  return cameraHeight/Math.tan(depression*DEG);
}

export function heightFromTop(cameraHeight:number,distance:number,topElevationDeg:number):number|null{
  if(!(distance>0)||!(cameraHeight>=0)||Math.abs(topElevationDeg)>=89.5)return null;
  return cameraHeight+distance*Math.tan(topElevationDeg*DEG);
}

/** Straight-line distance between two points in image pixels. */
export function pixelDistance(a:{x:number;y:number},b:{x:number;y:number}){return Math.hypot(b.x-a.x,b.y-a.y);}

/** Millimetres per pixel from a reference span of known length. */
export function scaleFromReference(a:{x:number;y:number},b:{x:number;y:number},knownMm:number):number|null{
  const px=pixelDistance(a,b);
  if(!(knownMm>0)||px<4)return null;
  return knownMm/px;
}

export function measuredMm(a:{x:number;y:number},b:{x:number;y:number},mmPerPixel:number){return pixelDistance(a,b)*mmPerPixel;}

export function formatMm(mm:number,unit:"metric"|"imperial"="metric"){
  if(unit==="imperial"){
    const inches=mm/25.4;
    if(inches<12)return `${inches.toFixed(inches<2?2:1)}″`;
    const feet=Math.floor(inches/12),rest=inches-feet*12;
    return `${feet}′ ${rest.toFixed(1)}″`;
  }
  if(Math.abs(mm)>=1000)return `${(mm/1000).toFixed(mm>=10000?2:3)} m`;
  return `${Math.round(mm)} mm`;
}

export function formatDegrees(d:number,digits=1){return `${(Object.is(d,-0)?0:d).toFixed(digits)}°`;}

/** Reference objects a tradie usually has to hand, in mm. */
export const REFERENCE_LENGTHS:Array<{id:string;label:string;mm:number}>=[
  {id:"stud90",label:"90 mm stud face",mm:90},
  {id:"stud45",label:"45 mm timber edge",mm:45},
  {id:"a4",label:"A4 sheet (long edge)",mm:297},
  {id:"card",label:"Bank card (long edge)",mm:85.6},
  {id:"gib1200",label:"GIB sheet width",mm:1200},
  {id:"brick",label:"Standard brick",mm:230},
  {id:"door",label:"Door leaf height",mm:1980},
];

/**
 * Compass heading (0 = north, clockwise) from an orientation event.
 * iOS exposes `webkitCompassHeading`; other browsers give an absolute alpha
 * that increases counter-clockwise, so heading = 360 - alpha.
 */
export function headingFromEvent(event:{alpha:number|null;absolute?:boolean;webkitCompassHeading?:number}):number|null{
  if(typeof event.webkitCompassHeading==="number"&&Number.isFinite(event.webkitCompassHeading))return ((event.webkitCompassHeading%360)+360)%360;
  if(event.absolute&&typeof event.alpha==="number")return ((360-event.alpha)%360+360)%360;
  return null;
}

export const COMPASS_POINTS=["N","NE","E","SE","S","SW","W","NW"] as const;
export function compassPoint(heading:number){return COMPASS_POINTS[Math.round(((heading%360)+360)%360/45)%8];}

/** Simple exponential smoothing so sensor readouts settle instead of flickering. */
export function smooth(previous:number|null,next:number,factor=0.25){return previous===null?next:previous+(next-previous)*factor;}

/** Deviation of a vertical surface (post, wall, formwork) from plumb, phone held flat against it. */
export function plumbError(betaDeg:number,gammaDeg:number):number{
  return 90-surfaceTilt(betaDeg,gammaDeg);
}

/** Shoelace area in image pixels² (absolute). */
export function polygonAreaPx(points:Array<{x:number;y:number}>):number{
  if(points.length<3)return 0;
  let sum=0;
  for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];sum+=a.x*b.y-b.x*a.y;}
  return Math.abs(sum)/2;
}

export function polygonAreaMm2(points:Array<{x:number;y:number}>,mmPerPixel:number):number{
  return polygonAreaPx(points)*mmPerPixel*mmPerPixel;
}

export function formatArea(mm2:number,unit:"metric"|"imperial"="metric"){
  if(unit==="imperial"){const ft2=mm2/92903.04;return `${ft2.toFixed(ft2<10?2:1)} ft²`;}
  const m2=mm2/1e6;
  return `${m2.toFixed(m2<10?2:1)} m²`;
}

/** Angle at `vertex` between the rays to `a` and `b`, in degrees (0–180). */
export function angleAtVertex(a:{x:number;y:number},vertex:{x:number;y:number},b:{x:number;y:number}):number{
  const ax=a.x-vertex.x,ay=a.y-vertex.y,bx=b.x-vertex.x,by=b.y-vertex.y;
  const la=Math.hypot(ax,ay),lb=Math.hypot(bx,by);
  if(la<1e-6||lb<1e-6)return 0;
  const cos=Math.max(-1,Math.min(1,(ax*bx+ay*by)/(la*lb)));
  return Math.acos(cos)/DEG;
}

/**
 * For a four-point outline, the two side lengths (mm): the average of each
 * pair of opposite sides, longest first. Lets an area traced on a photo seed
 * a length × width calculator without pretending a trapezoid is a rectangle
 * more than it is.
 */
export function quadSidesMm(points:Array<{x:number;y:number}>,mmPerPixel:number):[number,number]|null{
  if(points.length!==4||!(mmPerPixel>0))return null;
  const side=(i:number)=>pixelDistance(points[i],points[(i+1)%4])*mmPerPixel;
  const a=(side(0)+side(2))/2,b=(side(1)+side(3))/2;
  return a>=b?[a,b]:[b,a];
}
