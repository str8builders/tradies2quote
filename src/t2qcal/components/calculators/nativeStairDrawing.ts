import {stairNotchPath} from "../../lib/calculations";
import {BLACK,BLUE,FACE_DARK,FACE_LIT,FACE_MID,GREY,dimension,note,prepareSheet,shape,wood} from "./technicalDrawing";
// Flat-board geometry from native StairGeometry.notchPath, plus an assembly
// fitted from the same dimensions (one fewer tread than rises). Drawn with the
// shared blocklayer conventions: white sheet, grained timber, blue running
// set-out figures and hairline dimensions.
export function drawNativeStair(ctx:CanvasRenderingContext2D,w:number,h:number,kind:string,v:Record<string,number>,unit:string){
 if(kind!=="stringermark"&&kind!=="stairs3d")return;
 const {risers,rise,run,stringerWidth:depth,treadThickness:thickness}=v,treads=risers-1,bridge=Math.hypot(rise,run),length=treads*bridge,notch=rise*run/bridge;
 prepareSheet(ctx,w,h);
 if(!(w>150&&h>200&&depth>notch&&thickness<rise))return;
 const fmt=(n:number)=>`${new Intl.NumberFormat("en-NZ",{maximumFractionDigits:2}).format(n)} ${unit}`;
 const text=(s:string,x:number,y:number,color=BLACK)=>note(ctx,s,x,y,color,"center",12);
 if(kind==="stringermark"){
 const scale=Math.min((w-100)/length,(h-190)/depth),x=(w-length*scale)/2,y=(h-depth*scale)/2,points=stairNotchPath(risers,rise,run).map(p=>({x:x+p.x*scale,y:y+p.y*scale}));
 points.push({x:x+length*scale,y:y+depth*scale},{x,y:y+depth*scale});
 shape(ctx,points,wood(ctx,"horiz"),BLACK,1);
 text(`${treads} repeating notches · end cuts separate`,w/2,28);text(`Rise ${fmt(rise)} · going ${fmt(run)}`,w/2,49);
 dimension(ctx,x,y+depth*scale,x+length*scale,y+depth*scale,`Pitch-line span ${fmt(length)}`,BLACK,26);
 dimension(ctx,x+length*scale,y,x+length*scale,y+depth*scale,`Board ${fmt(depth)}`,BLACK,-24);
 text(`Throat ${fmt(depth-notch)} below the notch line`,w/2,h-22,GREY);
 const stride=Math.max(1,Math.ceil(85/(bridge*scale)));
 for(let i=0;i<=treads;i++){if(i!==treads&&(i%stride!==0||(i>0&&(treads-i)*bridge*scale<75)))continue;text(new Intl.NumberFormat("en-NZ",{maximumFractionDigits:1}).format(i*bridge),x+i*bridge*scale,y-18,BLUE);}
 return {unitsPerPixel:1/scale,unit};
 }
 const raw=(x:number,y:number,z:number)=>[x*.82+y*.6,x*.5-y*.5-z];
 const corners=[raw(0,0,0),raw(v.totalRun,0,v.totalRise),raw(0,v.width,0),raw(v.totalRun,v.width,v.totalRise)];
 const minX=Math.min(...corners.map(p=>p[0])),maxX=Math.max(...corners.map(p=>p[0])),minY=Math.min(...corners.map(p=>p[1])),maxY=Math.max(...corners.map(p=>p[1]));
 const scale=Math.min((w-90)/(maxX-minX),(h-120)/(maxY-minY));
 const p=(x:number,y:number,z:number)=>{const q=raw(x,y,z);return {x:(w-(maxX-minX)*scale)/2+(q[0]-minX)*scale,y:65+(q[1]-minY)*scale};};
 const verticalDepth=depth*bridge/run;
 for(const side of [0,v.width])shape(ctx,[p(0,side,rise-thickness),p(v.totalRun,side,v.totalRise-thickness),p(v.totalRun,side,v.totalRise-thickness-verticalDepth),p(0,side,rise-thickness-verticalDepth)],wood(ctx,"horiz"),BLACK,.8);
 for(let i=0;i<treads;i++){const a=i*run,b=(i+1)*run,z=(i+1)*rise;shape(ctx,[p(a,0,z-thickness),p(b,0,z-thickness),p(b,0,z),p(a,0,z)],FACE_MID,BLACK,.6);shape(ctx,[p(b,0,z-thickness),p(b,v.width,z-thickness),p(b,v.width,z),p(b,0,z)],FACE_DARK,BLACK,.6);shape(ctx,[p(a,0,z),p(b,0,z),p(b,v.width,z),p(a,v.width,z)],FACE_LIT,BLACK,.6);}
 text(`${risers} rises · ${treads} treads · upper floor is final landing`,w/2,26);text(`Run ${fmt(v.totalRun)} · rise ${fmt(v.totalRise)}`,w/2,h-38);text(`Width ${fmt(v.width)} · tread ${fmt(thickness)}`,w/2,h-18);
}
