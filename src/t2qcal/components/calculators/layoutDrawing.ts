import { openingLayout } from "../../lib/opening-layout";
import { dimension, note, prepareSheet, type DiagramKind } from "./technicalDrawing";

/** Measured layouts; position and count come from the calculation output. */
export function drawLayout(ctx:CanvasRenderingContext2D,w:number,h:number,kind:DiagramKind,v:Record<string,number>,unit:string) {
  prepareSheet(ctx,w,h);
  const text=(s:string,x:number,y:number)=>note(ctx,s,x,y,"#111","center",12);
  const num=(n:number)=>`${new Intl.NumberFormat("en-NZ",{maximumFractionDigits:2}).format(n)} ${unit}`;
  const line=(x:number,y:number,xx:number,yy:number)=>{ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(xx,yy);ctx.strokeStyle="#25384a";ctx.lineWidth=1;ctx.stroke();};
  const rect=(x:number,y:number,ww:number,hh:number)=>{ctx.fillStyle="#dfc6a1";ctx.fillRect(x,y,ww,hh);ctx.strokeStyle="#695643";ctx.lineWidth=.6;ctx.strokeRect(x,y,ww,hh);};
  const left=48,top=90,aw=Math.max(30,w-96),ah=Math.max(50,h-160);
  if(v.layoutKind===4) {
    const g=openingLayout(v),t=v.memberWidth,detail=kind==="openingdetail";
    const from=detail?v.openLeft-3*t:0,span=detail?v.openWidth+6*t:v.span;
    const scale=Math.min(aw/span,ah/v.height),x=left+(aw-span*scale)/2,y=top+(ah-v.height*scale)/2;
    const timber=(xx:number,bottom:number,width:number,height:number)=>rect(x+(xx-from)*scale,y+(v.height-bottom-height)*scale,width*scale,height*scale);
    for(let p=0;p<v.plates;p++)timber(from,p===0?0:v.height-p*t,span,t);
    if(!detail)for(const xx of g.regular)timber(xx,t,t,g.studLength);
    timber(v.openLeft-2*t,t,t,g.studLength);timber(v.openLeft+v.openWidth+t,t,t,g.studLength);
    timber(v.openLeft-t,t,t,g.jackLength);timber(v.openLeft+v.openWidth,t,t,g.jackLength);
    timber(v.openLeft-t,g.headerBottom,g.headerLength,v.headerDepth);
    if(v.openBottom>0)timber(v.openLeft,v.openBottom-t,v.openWidth,t);
    for(const xx of g.cripples){if(g.topCut>0)timber(xx,g.headerTop,t,g.topCut);if(g.bottomCut>0)timber(xx,t,t,g.bottomCut);}
    dimension(ctx,x+(v.openLeft-from)*scale,y+(v.height-v.openBottom)*scale,x+(v.openLeft+v.openWidth-from)*scale,y+(v.height-v.openBottom)*scale,num(v.openWidth),"#111",30);
    text(`Rough opening ${num(v.openWidth)} × ${num(v.openHeight)}`,w/2,28);
    text(`Header ${num(g.headerLength)} × ${num(v.headerDepth)} · size from design`,w/2,50);
  } else if(v.layoutKind===1) {
    const detail=kind==="platemark", scale=Math.min(aw/v.span,ah/(detail?v.memberWidth*4:v.height));
    const x=left+(aw-v.span*scale)/2,y=detail?h/2:top+(ah-v.height*scale)/2;
    if(detail) {
      rect(x,y,v.span*scale,Math.max(5,v.memberWidth*scale));
      for(let i=0;i<Math.min(v.count,1000);i++){const xx=x+(v.first+i*v.centres)*scale;line(xx,y-12,xx,y+20);if(v.count<=18)text(String(i+1),xx,y-22);}
      dimension(ctx,x,y+24,x+v.span*scale,y+24,num(v.span),"#111",25);
    } else {
      for(let p=0;p<v.plates;p++)rect(x,y+(p===0?v.height-v.memberWidth:(p-1)*v.memberWidth)*scale,v.span*scale,v.memberWidth*scale);
      for(let i=0;i<Math.min(v.count,1000);i++)rect(x+i*v.centres*scale,y+(v.plates-1)*v.memberWidth*scale,v.memberWidth*scale,v.studLength*scale);
      for(let r=0;r<v.nogRows;r++)for(let i=0;i<Math.min(v.count-1,1000);i++)rect(x+(i*v.centres+v.memberWidth)*scale,y+((v.plates-1)*v.memberWidth+(r+1)*v.studLength/(v.nogRows+1)-v.memberWidth/2)*scale,v.nogLength*scale,v.memberWidth*scale);
      dimension(ctx,x,y+v.height*scale,x+v.span*scale,y+v.height*scale,num(v.span),"#111",30);
      dimension(ctx,x,y,x,y+v.height*scale,num(v.height),"#111",28);
    }
    text(`${v.count} studs · ${v.plates} plate runs · ${v.nogRows} noggin rows`,w/2,28);
    text(`Centres ${num(v.centres)} · stud cut ${num(v.studLength)}`,w/2,50);
  } else if(v.layoutKind===2) {
    const scale=Math.min(aw/v.span,ah/v.width),x=left+(aw-v.span*scale)/2,y=top+(ah-v.width*scale)/2;
    text(`${v.countX+v.countY} bars per layer · ${v.layers} layers`,w/2,28);
    text(`Clear cover ${num(v.cover)} · bar diameter ${num(v.memberWidth)}`,w/2,50);
    if(kind==="barsection") {
      line(left,h*.4,left+v.cutX/v.span*aw,h*.4);line(left,h*.65,left+v.cutY/v.span*aw,h*.65);
      text(`${v.countY*v.layers} × ${num(v.cutX)}`,w/2,h*.4-22);
      text(`${v.countX*v.layers} × ${num(v.cutY)}`,w/2,h*.65-22);
      text("Straight lengths · add design lap and anchorage",w/2,h-40);
    } else {
      ctx.strokeStyle="#999";ctx.strokeRect(x,y,v.span*scale,v.width*scale);
      for(let i=0;i<Math.min(v.countX,1000);i++){const xx=x+(v.first+i*v.spacingX)*scale;line(xx,y+v.cover*scale,xx,y+(v.width-v.cover)*scale);}
      for(let i=0;i<Math.min(v.countY,1000);i++){const yy=y+(v.first+i*v.spacingY)*scale;line(x+v.cover*scale,yy,x+(v.span-v.cover)*scale,yy);}
      dimension(ctx,x,y+v.width*scale,x+v.span*scale,y+v.width*scale,num(v.span),"#111",30);
      dimension(ctx,x,y,x,y+v.width*scale,num(v.width),"#111",28);
    }
  } else if(v.layoutKind===3) {
    text(`${v.count} cuts · centres ${num(v.centres)}`,w/2,28);
    text(`Cut depth ${num(v.depth)} · skin ${num(v.skin)}`,w/2,50);
    if(kind==="kerfbent") {
      const scale=Math.min(aw,ah)/(2*v.radius),r=v.radius*scale,ri=v.innerRadius*scale,cx=w/2,cy=top+ah/2,a=-Math.PI/2,b=a+v.angle*Math.PI/180;
      ctx.beginPath();ctx.arc(cx,cy,r,a,b);ctx.arc(cx,cy,ri,b,a,true);ctx.closePath();ctx.fillStyle="#dfc6a1";ctx.fill();ctx.strokeStyle="#695643";ctx.stroke();
      for(let i=0;i<Math.min(v.count,1000);i++){const t=a+(i+.5)*v.turn;line(cx+Math.cos(t)*ri,cy+Math.sin(t)*ri,cx+Math.cos(t)*(r-v.skin*scale),cy+Math.sin(t)*(r-v.skin*scale));}
      line(cx,cy,cx+Math.cos(a)*r,cy+Math.sin(a)*r);line(cx,cy,cx+Math.cos(b)*r,cy+Math.sin(b)*r);
      text(`Outside R ${num(v.radius)} · ${v.angle}°`,w/2,h-30);
    } else {
      const sx=aw/v.span,sy=Math.min(4,ah*.25/v.thickness),y=h*.48;
      rect(left,y,aw,v.thickness*sy);
      for(let i=0;i<Math.min(v.count,1000);i++){const x=left+(v.first+i*v.centres)*sx;ctx.fillStyle="#fff";ctx.fillRect(x-v.kerf*sx/2,y+v.skin*sy,Math.max(.5,v.kerf*sx),v.depth*sy);}
      dimension(ctx,left,y+v.thickness*sy,left+aw,y+v.thickness*sy,num(v.span),"#111",30);
      text("Depth enlarged for visibility · cuts start half a spacing in",w/2,h-30);
    }
  }
}
