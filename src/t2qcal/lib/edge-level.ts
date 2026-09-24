/**
 * "Point at it" level. Instead of laying the phone on a member or holding it
 * dead still, aim the camera at the edge — a shelf, a lintel, a fascia, a
 * door jamb — and read how far that edge is off level or plumb.
 *
 * A frame from the camera is reduced to greyscale, Sobel gradients find the
 * edge pixels, an orientation histogram picks the dominant edge near the
 * wanted direction (horizontal for level, vertical for plumb), the strongest
 * parallel band of pixels is isolated, and a weighted principal-axis fit
 * through that band gives the edge's angle to a fraction of a degree. The
 * phone's own roll, from the tilt sensor, is then taken off so the answer is
 * against true level, not against the screen.
 */
export const DEG=Math.PI/180;

export function rgbaToGray(rgba:ArrayLike<number>,width:number,height:number):Float32Array{
  const out=new Float32Array(width*height);
  for(let i=0,j=0;i<out.length;i++,j+=4)out[i]=rgba[j]*.299+rgba[j+1]*.587+rgba[j+2]*.114;
  return out;
}

export type Edge={
  /** Edge direction in the image, degrees, clockwise positive (y down). Near 0 for level, near 90 for plumb. */
  angle:number;
  /** Share of all edge strength (0–1) that lines up with the chosen edge. */
  confidence:number;
  /** Ends of the fitted edge in image pixels, for drawing it. */
  x1:number;y1:number;x2:number;y2:number;
  /** Length of the fitted edge in pixels. */
  length:number;
};

const wrap180=(a:number)=>{let v=((a+90)%180+180)%180-90;if(v===-90)v=90;return v;};

/**
 * Dominant straight edge within `span` degrees of `target` (0 level, 90 plumb).
 * Null when nothing edge-like is there (a blank wall, a dark frame).
 */
export function dominantEdge(gray:ArrayLike<number>,width:number,height:number,target:0|90,span=30):Edge|null{
  if(width<8||height<8)return null;
  const n=width*height,mag=new Float32Array(n),rel=new Float32Array(n);
  let max=0;
  for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
    const i=y*width+x;
    const a=gray[i-width-1],b=gray[i-width],c=gray[i-width+1],d=gray[i-1],f=gray[i+1],g=gray[i+width-1],h=gray[i+width],k=gray[i+width+1];
    const gx=(c+2*f+k)-(a+2*d+g),gy=(g+2*h+k)-(a+2*b+c);
    const m=Math.hypot(gx,gy);mag[i]=m;if(m>max)max=m;
    rel[i]=wrap180(Math.atan2(gy,gx)/DEG-90-target);
  }
  if(max<20)return null;
  const thr=max*.25,binW=.5,bins=Math.ceil(2*span/binW)+1,hist=new Float64Array(bins);
  let total=0;
  for(let i=0;i<n;i++){const m=mag[i];if(m<thr)continue;total+=m;const r=rel[i];if(Math.abs(r)>span)continue;hist[Math.round((r+span)/binW)]+=m;}
  if(total<=0)return null;
  // smooth over ±1 bin and take the peak
  let best=-1,bestW=0;
  for(let b=0;b<bins;b++){const w=hist[b]+(hist[b-1]??0)*.5+(hist[b+1]??0)*.5;if(w>bestW){bestW=w;best=b;}}
  if(best<0)return null;
  const peak=best*binW-span;
  // pixels agreeing with the peak orientation, then the strongest parallel band
  const t=(target+peak)*DEG,nx=-Math.sin(t),ny=Math.cos(t);
  const offsets=new Map<number,number>();  for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
    const i=y*width+x,m=mag[i];if(m<thr||Math.abs(rel[i]-peak)>2)continue;
    const key=Math.round(x*nx+y*ny);offsets.set(key,(offsets.get(key)??0)+m);
  }
  let band=0,bandW=-1;
  for(const [k,w] of offsets){const s=w+(offsets.get(k-1)??0)+(offsets.get(k+1)??0);if(s>bandW){bandW=s;band=k;}}
  // Sub-pixel edge: one strength-weighted edge position per column (per row
  // for plumb), then a weighted straight-line fit through those positions.
  // The first pass takes the strongest parallel band; two refits re-select
  // pixels along the fitted line itself, so a slightly-off histogram peak
  // cannot clip the ends of the edge and drag the angle back towards it.
  const level=target===0,cols=level?width:height;
  let a=0,b=0,lo=Infinity,hi=-Infinity,have=false;
  for(let pass=0;pass<3;pass++){
    const sw=new Float64Array(cols),sv=new Float64Array(cols);let used=0;
    for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
      const i=y*width+x,m=mag[i];if(m<thr)continue;
      const u=level?x:y,v=level?y:x;
      if(pass===0){if(Math.abs(rel[i]-peak)>2||Math.abs(x*nx+y*ny-band)>2.5)continue;}
      else if(Math.abs(v-(a+b*u))>3.5)continue;
      sw[u]+=m;sv[u]+=m*v;used++;
    }
    if(used<15)break;
    let W=0,Su=0,Sv=0,Suu=0,Suv=0;lo=Infinity;hi=-Infinity;
    for(let u=0;u<cols;u++){const w=sw[u];if(w<=0)continue;const v=sv[u]/w;W+=w;Su+=w*u;Sv+=w*v;Suu+=w*u*u;Suv+=w*u*v;if(u<lo)lo=u;if(u>hi)hi=u;}
    const den=W*Suu-Su*Su;if(!(W>0)||Math.abs(den)<1e-9)break;
    b=(W*Suv-Su*Sv)/den;a=(Sv-b*Su)/W;have=true;
  }
  if(!have)return null;
  const angle=level?Math.atan(b)/DEG:Math.atan2(1,b)/DEG;
  const [x1,y1,x2,y2]=level?[lo,a+b*lo,hi,a+b*hi]:[a+b*lo,lo,a+b*hi,hi];
  const length=Math.hypot(x2-x1,y2-y1);
  // confidence: share of all edge strength lying on the fitted line
  let onLine=0;
  for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){const i=y*width+x,m=mag[i];if(m<thr)continue;const u=level?x:y,v=level?y:x;if(Math.abs(v-(a+b*u))<=3.5)onLine+=m;}
  return {angle,confidence:Math.min(1,onLine/total),x1,y1,x2,y2,length};
}

/**
 * The edge's angle against true level (target 0) or true plumb (target 90),
 * degrees. `roll` is the phone's roll from the tilt sensor, positive when its
 * right edge is low. Positive result: the right-hand end is low (level), or
 * the top leans right (plumb).
 */
export function edgeTilt(imageAngle:number,roll:number,target:0|90){return wrap180(imageAngle-target+roll);}

/** Fall across a metre of the edge, mm, for a tilt in degrees. */
export function mmPerMetre(tiltDeg:number){return Math.tan(tiltDeg*DEG)*1000;}
