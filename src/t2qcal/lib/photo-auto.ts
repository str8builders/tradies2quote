/**
 * Tap-or-circle measuring on a photo. The tradie does not have to land two
 * dots on the exact ends of something: tap the object (a door, a sheet, a
 * window, a paver) or draw a rough loop round it, and its outline is found
 * from the pixels. Its true width and height come from a minimum-area
 * rectangle fitted on the measured plane, so a shot taken at an angle still
 * reads square to the object.
 *
 * All of this runs on a downsampled copy of the photo (a few hundred pixels
 * a side) so it answers in well under a second on a phone.
 */
export type Pt={x:number;y:number};
export type Rgba={data:ArrayLike<number>;width:number;height:number};
export type Mask={width:number;height:number;on:Uint8Array;count:number};

const dist2=(d:ArrayLike<number>,i:number,r:number,g:number,b:number)=>{const dr=d[i]-r,dg=d[i+1]-g,db=d[i+2]-b;return dr*dr+dg*dg+db*db;};

/**
 * Grow a region from the tapped pixel through neighbours of similar colour.
 * Stops at edges (a big step between neighbours) as well as at colour drift
 * from the region's running average. Null when the region leaks over most of
 * the photo — the object has no clear edge against its background.
 */
export function regionGrow(img:Rgba,seed:Pt,tolerance=30,maxShare=.6):Mask|null{
  const {data,width:w,height:h}=img,sx=Math.round(seed.x),sy=Math.round(seed.y);
  if(sx<0||sy<0||sx>=w||sy>=h)return null;
  const on=new Uint8Array(w*h),queue=new Int32Array(w*h);
  let head=0,tail=0,count=0,mr=0,mg=0,mb=0;
  // seed colour from a 3×3 average so one noisy pixel does not set the tone
  let n=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const x=sx+dx,y=sy+dy;if(x<0||y<0||x>=w||y>=h)continue;const i=(y*w+x)*4;mr+=data[i];mg+=data[i+1];mb+=data[i+2];n++;}
  mr/=n;mg/=n;mb/=n;
  const t2=tolerance*tolerance,step2=(tolerance*.55)**2,limit=w*h*maxShare;
  const start=sy*w+sx;on[start]=1;queue[tail++]=start;count=1;
  let sr=mr,sg=mg,sb=mb;
  while(head<tail){
    const p=queue[head++],px=p%w,py=(p-px)/w,pi=p*4;
    for(let k=0;k<4;k++){
      const x=k===0?px+1:k===1?px-1:px,y=k===2?py+1:k===3?py-1:py;
      if(x<0||y<0||x>=w||y>=h)continue;
      const q=y*w+x;if(on[q])continue;
      const qi=q*4;
      if(dist2(data,qi,data[pi],data[pi+1],data[pi+2])>step2)continue;
      if(dist2(data,qi,sr/count,sg/count,sb/count)>t2)continue;
      on[q]=1;queue[tail++]=q;count++;sr+=data[qi];sg+=data[qi+1];sb+=data[qi+2];
      if(count>limit)return null;
    }
  }
  return count>=12?{width:w,height:h,on,count}:null;
}

/** Pixels inside a polygon (even-odd scanline fill). */
export function polygonMask(width:number,height:number,poly:Pt[]):Uint8Array{
  const on=new Uint8Array(width*height);if(poly.length<3)return on;
  const xs:number[]=[];
  for(let y=0;y<height;y++){
    const cy=y+.5;xs.length=0;
    for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length];if((a.y<=cy&&b.y>cy)||(b.y<=cy&&a.y>cy))xs.push(a.x+(cy-a.y)/(b.y-a.y)*(b.x-a.x));}
    xs.sort((p,q)=>p-q);
    for(let k=0;k+1<xs.length;k+=2){const x0=Math.max(0,Math.ceil(xs[k]-.5)),x1=Math.min(width-1,Math.floor(xs[k+1]-.5));for(let x=x0;x<=x1;x++)on[y*width+x]=1;}
  }
  return on;
}

/**
 * Circle-to-measure: whatever inside the loop does not look like the colours
 * the loop was drawn over is the object. Background colours are sampled
 * along the loop and clustered; each inside pixel is scored by its distance
 * from the nearest background colour; Otsu's threshold splits object from
 * background; the largest connected piece is kept.
 */
export function lassoSegment(img:Rgba,loop:Pt[]):Mask|null{
  const {data,width:w,height:h}=img;if(loop.length<3)return null;
  const inside=polygonMask(w,h,loop);
  // background samples every ~2 px along the loop
  const samples:number[][]=[];
  for(let i=0;i<loop.length;i++){const a=loop[i],b=loop[(i+1)%loop.length],len=Math.hypot(b.x-a.x,b.y-a.y),steps=Math.max(1,Math.ceil(len/2));
    for(let s=0;s<steps;s++){const x=Math.round(a.x+(b.x-a.x)*s/steps),y=Math.round(a.y+(b.y-a.y)*s/steps);if(x<0||y<0||x>=w||y>=h)continue;const j=(y*w+x)*4;samples.push([data[j],data[j+1],data[j+2]]);}}
  if(samples.length<6)return null;
  const centres=kMeans(samples,Math.min(6,samples.length));
  const score=new Float32Array(w*h);let n=0;const hist=new Float64Array(256);
  for(let p=0;p<w*h;p++){if(!inside[p])continue;const j=p*4;let best=Infinity;for(const c of centres){const d=dist2(data,j,c[0],c[1],c[2]);if(d<best)best=d;}const s=Math.min(255,Math.sqrt(best));score[p]=s;hist[Math.floor(s)]++;n++;}
  if(n<12)return null;
  const thr=Math.max(18,otsu(hist,n));
  const on=new Uint8Array(w*h);let count=0;
  for(let p=0;p<w*h;p++)if(inside[p]&&score[p]>thr){on[p]=1;count++;}
  if(count<12)return null;
  return largestComponent({width:w,height:h,on,count});
}

function kMeans(points:number[][],k:number):number[][]{
  const centres=Array.from({length:k},(_,i)=>points[Math.floor(i*points.length/k)].slice());
  for(let it=0;it<8;it++){
    const sum=centres.map(()=>[0,0,0,0]);
    for(const p of points){let bi=0,bd=Infinity;centres.forEach((c,i)=>{const d=(p[0]-c[0])**2+(p[1]-c[1])**2+(p[2]-c[2])**2;if(d<bd){bd=d;bi=i;}});const s=sum[bi];s[0]+=p[0];s[1]+=p[1];s[2]+=p[2];s[3]++;}
    sum.forEach((s,i)=>{if(s[3])centres[i]=[s[0]/s[3],s[1]/s[3],s[2]/s[3]];});
  }
  return centres;
}

/** Otsu's threshold on a 256-bin histogram of n values. */
export function otsu(hist:ArrayLike<number>,n:number):number{
  let sum=0;for(let i=0;i<256;i++)sum+=i*hist[i];
  let sumB=0,wB=0,best=0,thr=0;
  for(let t=0;t<256;t++){wB+=hist[t];if(!wB)continue;const wF=n-wB;if(!wF)break;sumB+=t*hist[t];const mB=sumB/wB,mF=(sum-sumB)/wF,between=wB*wF*(mB-mF)**2;if(between>best){best=between;thr=t;}}
  return thr;
}

/** Keep only the largest 4-connected piece of a mask. */
export function largestComponent(mask:Mask):Mask|null{
  const {width:w,height:h,on}=mask,label=new Int32Array(w*h),queue=new Int32Array(w*h);
  let bestLabel=0,bestSize=0,next=0;
  for(let p=0;p<w*h;p++){
    if(!on[p]||label[p])continue;next++;let head=0,tail=0,size=0;label[p]=next;queue[tail++]=p;
    while(head<tail){const q=queue[head++];size++;const x=q%w,y=(q-x)/w;
      if(x+1<w&&on[q+1]&&!label[q+1]){label[q+1]=next;queue[tail++]=q+1;}
      if(x>0&&on[q-1]&&!label[q-1]){label[q-1]=next;queue[tail++]=q-1;}
      if(y+1<h&&on[q+w]&&!label[q+w]){label[q+w]=next;queue[tail++]=q+w;}
      if(y>0&&on[q-w]&&!label[q-w]){label[q-w]=next;queue[tail++]=q-w;}}
    if(size>bestSize){bestSize=size;bestLabel=next;}
  }
  if(bestSize<12)return null;
  const out=new Uint8Array(w*h);for(let p=0;p<w*h;p++)if(label[p]===bestLabel)out[p]=1;
  return {width:w,height:h,on:out,count:bestSize};
}

/**
 * Outline points of a mask: the midpoint of every pixel edge that faces out
 * of the mask. On a slanting edge these sit on the staircase rather than at
 * its outer corners, so a hull through them hugs the true edge more closely.
 */
export function maskBoundary(mask:Mask):Pt[]{
  const {width:w,height:h,on}=mask,out:Pt[]=[];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const p=y*w+x;if(!on[p])continue;
    if(x===0||!on[p-1])out.push({x,y:y+.5});
    if(x===w-1||!on[p+1])out.push({x:x+1,y:y+.5});
    if(y===0||!on[p-w])out.push({x:x+.5,y});
    if(y===h-1||!on[p+w])out.push({x:x+.5,y:y+1});}
  return out;
}

/** Convex hull, counter-clockwise (monotone chain). */
export function convexHull(points:Pt[]):Pt[]{
  const p=[...points].sort((a,b)=>a.x-b.x||a.y-b.y);if(p.length<3)return p;
  const cross=(o:Pt,a:Pt,b:Pt)=>(a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x);
  const lower:Pt[]=[];for(const q of p){while(lower.length>=2&&cross(lower[lower.length-2],lower[lower.length-1],q)<=0)lower.pop();lower.push(q);}
  const upper:Pt[]=[];for(let i=p.length-1;i>=0;i--){const q=p[i];while(upper.length>=2&&cross(upper[upper.length-2],upper[upper.length-1],q)<=0)upper.pop();upper.push(q);}
  upper.pop();lower.pop();return lower.concat(upper);
}

/** Minimum-area enclosing rectangle of a convex hull: its corners, long side and short side. */
export function minAreaRect(hull:Pt[]):{corners:[Pt,Pt,Pt,Pt];long:number;short:number;angle:number}|null{
  if(hull.length<3)return null;
  let best:{area:number;corners:[Pt,Pt,Pt,Pt];w:number;h:number;angle:number}|null=null;
  for(let i=0;i<hull.length;i++){
    const a=hull[i],b=hull[(i+1)%hull.length],len=Math.hypot(b.x-a.x,b.y-a.y);if(len<1e-9)continue;
    const ux=(b.x-a.x)/len,uy=(b.y-a.y)/len;
    let u0=Infinity,u1=-Infinity,v0=Infinity,v1=-Infinity;
    for(const p of hull){const u=p.x*ux+p.y*uy,v=-p.x*uy+p.y*ux;if(u<u0)u0=u;if(u>u1)u1=u;if(v<v0)v0=v;if(v>v1)v1=v;}
    const area=(u1-u0)*(v1-v0);
    if(!best||area<best.area){const at=(u:number,v:number):Pt=>({x:u*ux-v*uy,y:u*uy+v*ux});best={area,corners:[at(u0,v0),at(u1,v0),at(u1,v1),at(u0,v1)],w:u1-u0,h:v1-v0,angle:Math.atan2(uy,ux)*180/Math.PI};}
  }
  if(!best)return null;
  return {corners:best.corners,long:Math.max(best.w,best.h),short:Math.min(best.w,best.h),angle:best.angle};
}

/**
 * Real-world size of a found object. The outline is mapped onto the measured
 * plane first, then the rectangle is fitted there — so perspective does not
 * skew width against height. Area is the true mask area on the plane.
 */
export function measureMask(mask:Mask,toMm:(p:Pt)=>Pt,pixelScale=1):{widthMm:number;heightMm:number;areaMm2:number;outline:Pt[]}|null{
  const outline=convexHull(maskBoundary(mask)).map(p=>({x:p.x/pixelScale,y:p.y/pixelScale}));
  if(outline.length<3)return null;
  const rect=minAreaRect(outline.map(toMm));if(!rect)return null;
  // area: each mask pixel mapped as a small parallelogram onto the plane
  let area=0;const {width:w,on}=mask,k=1/pixelScale;
  for(let p=0;p<on.length;p++){if(!on[p])continue;const x=(p%w)*k,y=Math.floor(p/w)*k;const o=toMm({x,y}),ex=toMm({x:x+k,y}),ey=toMm({x,y:y+k});area+=Math.abs((ex.x-o.x)*(ey.y-o.y)-(ex.y-o.y)*(ey.x-o.x));}
  if(!Number.isFinite(rect.long)||!Number.isFinite(area))return null;
  return {widthMm:rect.long,heightMm:rect.short,areaMm2:area,outline};
}

/**
 * Magnetic point: move a tap to the strongest corner (Shi–Tomasi response)
 * within `radius` pixels, so a thumb tap lands on the real corner.
 * Returns the tap unchanged when nothing corner-like is near.
 */
export function snapToCorner(gray:ArrayLike<number>,width:number,height:number,p:Pt,radius=10):Pt{
  const cx=Math.round(p.x),cy=Math.round(p.y);let best=0,bx=p.x,by=p.y,max=0;
  const r=radius,resp=(x:number,y:number)=>{let sxx=0,syy=0,sxy=0;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const X=x+dx,Y=y+dy,i=Y*width+X;const gx=(gray[i+1]-gray[i-1])/2,gy=(gray[i+width]-gray[i-width])/2;sxx+=gx*gx;syy+=gy*gy;sxy+=gx*gy;}
    const tr=sxx+syy,det=sxx*syy-sxy*sxy;return tr/2-Math.sqrt(Math.max(0,tr*tr/4-det));};
  for(let y=Math.max(2,cy-r);y<=Math.min(height-3,cy+r);y++)for(let x=Math.max(2,cx-r);x<=Math.min(width-3,cx+r);x++){
    if((x-cx)**2+(y-cy)**2>r*r)continue;const v=resp(x,y);if(v>max)max=v;
    // prefer strong corners, gently favouring ones near the tap
    const score=v/(1+((x-p.x)**2+(y-p.y)**2)/(r*r*4));if(score>best){best=score;bx=x;by=y;}}
  return max>200?{x:bx,y:by}:p;
}

/** Diagonals of a four-corner outline on the plane, and how far out of square it is. */
export function squareCheck(corners:Pt[],toMm:(p:Pt)=>Pt):{d1:number;d2:number;diff:number}|null{
  if(corners.length!==4)return null;
  const m=corners.map(toMm),d1=Math.hypot(m[2].x-m[0].x,m[2].y-m[0].y),d2=Math.hypot(m[3].x-m[1].x,m[3].y-m[1].y);
  return {d1,d2,diff:Math.abs(d1-d2)};
}
