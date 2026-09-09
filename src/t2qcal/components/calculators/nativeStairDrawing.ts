import {stairNotchPath} from "../../lib/calculations";
// Flat-board geometry from native StairGeometry.notchPath, plus an assembly
// fitted from the same dimensions (one fewer tread than rises).
export function drawNativeStair(ctx:CanvasRenderingContext2D,w:number,h:number,kind:string,v:Record<string,number>,unit:string){
 if(kind!=="stringermark"&&kind!=="stairs3d")return;
 const {risers,rise,run,stringerWidth:depth,treadThickness:thickness}=v,treads=risers-1,bridge=Math.hypot(rise,run),length=treads*bridge,notch=rise*run/bridge;
 if(!(w>150&&h>200&&depth>notch&&thickness<rise))return;
 ctx.clearRect(0,0,w,h);ctx.fillStyle="#fff";ctx.fillRect(0,0,w,h);
 const fmt=(n:number)=>`${Number(n.toFixed(2))} ${unit}`;
 const text=(s:string,x:number,y:number)=>{ctx.font="12px Verdana";ctx.fillStyle="#222";ctx.textAlign="center";ctx.fillText(s,x,y);};
 const polygon=(points:number[][],fill:string)=>{ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle="#444";ctx.lineWidth=1;ctx.stroke();};
 if(kind==="stringermark"){
 const scale=Math.min((w-100)/length,(h-190)/depth),x=(w-length*scale)/2,y=(h-depth*scale)/2,points=stairNotchPath(risers,rise,run).map(p=>[x+p.x*scale,y+p.y*scale]);
 points.push([x+length*scale,y+depth*scale],[x,y+depth*scale]);polygon(points,"#eee");
 text(`${treads} repeating notches · end cuts separate`,w/2,28);text(`Rise ${fmt(rise)} · going ${fmt(run)}`,w/2,49);text(`Pitch-line span ${fmt(length)}`,w/2,y+depth*scale+32);text(`Board ${fmt(depth)} · throat ${fmt(depth-notch)}`,w/2,h-28);
 const stride=Math.max(1,Math.ceil(85/(bridge*scale)));
 for(let i=0;i<=treads;i++){if(i!==treads&&(i%stride!==0||(i>0&&(treads-i)*bridge*scale<75)))continue;text(String(Number((i*bridge).toFixed(1))),x+i*bridge*scale,y-18);}
 return {unitsPerPixel:1/scale,unit};
 }
 const raw=(x:number,y:number,z:number)=>[x*.82+y*.6,x*.5-y*.5-z];
 const corners=[raw(0,0,0),raw(v.totalRun,0,v.totalRise),raw(0,v.width,0),raw(v.totalRun,v.width,v.totalRise)];
 const minX=Math.min(...corners.map(p=>p[0])),maxX=Math.max(...corners.map(p=>p[0])),minY=Math.min(...corners.map(p=>p[1])),maxY=Math.max(...corners.map(p=>p[1]));
 const scale=Math.min((w-90)/(maxX-minX),(h-120)/(maxY-minY));
 const p=(x:number,y:number,z:number)=>{const q=raw(x,y,z);return [(w-(maxX-minX)*scale)/2+(q[0]-minX)*scale,65+(q[1]-minY)*scale];};
 const verticalDepth=depth*bridge/run;
 for(const side of [0,v.width])polygon([p(0,side,rise-thickness),p(v.totalRun,side,v.totalRise-thickness),p(v.totalRun,side,v.totalRise-thickness-verticalDepth),p(0,side,rise-thickness-verticalDepth)],"#b39c7d");
 for(let i=0;i<treads;i++){const a=i*run,b=(i+1)*run,z=(i+1)*rise;polygon([p(a,0,z-thickness),p(b,0,z-thickness),p(b,0,z),p(a,0,z)],"#b9a287");polygon([p(b,0,z-thickness),p(b,v.width,z-thickness),p(b,v.width,z),p(b,0,z)],"#cbb89c");polygon([p(a,0,z),p(b,0,z),p(b,v.width,z),p(a,v.width,z)],"#e8ddcc");}
 text(`${risers} rises · ${treads} treads · upper floor is final landing`,w/2,26);text(`Run ${fmt(v.totalRun)} · rise ${fmt(v.totalRise)}`,w/2,h-38);text(`Width ${fmt(v.width)} · tread ${fmt(thickness)}`,w/2,h-18);
}
