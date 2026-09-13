"use client";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {ArrowCounterClockwise,Camera,Image as ImageIcon,Ruler,Trash} from "@phosphor-icons/react";
import {REFERENCE_LENGTHS,formatMm,measuredMm,pixelDistance,scaleFromReference} from "@/t2qcal/lib/measure";
import {useCamera} from "./useSensors";

type Pt={x:number;y:number};
type Unit="metric"|"imperial";
const MAX_SIDE=2400;

/**
 * Measure from a photo. Snap a frame or choose a photo already on the phone,
 * tap the two ends of something whose size you know (a 90 mm stud, an A4
 * sheet, a GIB sheet), then tap the ends of anything else in the same plane
 * to read its length. A magnifier follows the finger so the ends land on the
 * pixel, not the fingertip. Everything stays on the phone.
 */
export function PhotoMeasureTool(){
  const {videoRef,state:cameraState,message:cameraMessage,start:startCamera,stop:stopCamera,snapshot:takeSnapshot}=useCamera();
  const fileRef=useRef<HTMLInputElement>(null);
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const frameRef=useRef<HTMLDivElement>(null);
  const imageRef=useRef<HTMLImageElement|null>(null);
  const [hasImage,setHasImage]=useState(false);
  const [reference,setReference]=useState<Pt[]>([]);
  const [refId,setRefId]=useState(REFERENCE_LENGTHS[0].id);
  const [customMm,setCustomMm]=useState("");
  const [points,setPoints]=useState<Pt[]>([]);
  const [unit,setUnit]=useState<Unit>("metric");
  const [drag,setDrag]=useState<Pt|null>(null);
  const [error,setError]=useState("");
  const knownMm=refId==="custom"?Number(customMm):REFERENCE_LENGTHS.find(r=>r.id===refId)?.mm??0;
  const scale=reference.length===2?scaleFromReference(reference[0],reference[1],knownMm):null;
  const pairs=useMemo(()=>{const out:Array<[Pt,Pt]>=[];for(let i=0;i+1<points.length;i+=2)out.push([points[i],points[i+1]]);return out;},[points]);

  const layout=useCallback(()=>{
    const canvas=canvasRef.current,frame=frameRef.current,img=imageRef.current;
    if(!canvas||!frame||!img)return null;
    const W=frame.clientWidth,H=frame.clientHeight,s=Math.min(W/img.width,H/img.height);
    return {W,H,s,ox:(W-img.width*s)/2,oy:(H-img.height*s)/2};
  },[]);

  const draw=useCallback(()=>{
    const canvas=canvasRef.current,img=imageRef.current,L=layout();
    if(!canvas||!img||!L)return;
    const dpr=window.devicePixelRatio||1;
    if(canvas.width!==Math.round(L.W*dpr)||canvas.height!==Math.round(L.H*dpr)){canvas.width=Math.round(L.W*dpr);canvas.height=Math.round(L.H*dpr);}
    const ctx=canvas.getContext("2d");if(!ctx)return;
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,L.W,L.H);
    ctx.drawImage(img,L.ox,L.oy,img.width*L.s,img.height*L.s);
    const toScreen=(p:Pt):Pt=>({x:L.ox+p.x*L.s,y:L.oy+p.y*L.s});
    const line=(a:Pt,b:Pt,color:string,label:string)=>{
      const A=toScreen(a),B=toScreen(b);
      ctx.lineWidth=3;ctx.strokeStyle="#0009";ctx.beginPath();ctx.moveTo(A.x,A.y);ctx.lineTo(B.x,B.y);ctx.stroke();
      ctx.lineWidth=1.5;ctx.strokeStyle=color;ctx.beginPath();ctx.moveTo(A.x,A.y);ctx.lineTo(B.x,B.y);ctx.stroke();
      for(const P of [A,B]){ctx.fillStyle=color;ctx.beginPath();ctx.arc(P.x,P.y,4,0,Math.PI*2);ctx.fill();ctx.strokeStyle="#000";ctx.lineWidth=1;ctx.stroke();}
      if(label){const mx=(A.x+B.x)/2,my=(A.y+B.y)/2;ctx.font="600 12px T2QMono, monospace";const w=ctx.measureText(label).width+12;ctx.fillStyle="#0a0a0aee";ctx.fillRect(mx-w/2,my-20,w,18);ctx.fillStyle=color;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(label,mx,my-11);}
    };
    if(reference.length===2)line(reference[0],reference[1],"#ffea00",`ref ${formatMm(knownMm,unit)}`);
    else if(reference.length===1){const P=toScreen(reference[0]);ctx.fillStyle="#ffea00";ctx.beginPath();ctx.arc(P.x,P.y,4,0,Math.PI*2);ctx.fill();}
    pairs.forEach(([a,b])=>line(a,b,"#ff5f15",scale?formatMm(measuredMm(a,b,scale),unit):"set reference first"));
    if(points.length%2===1){const P=toScreen(points[points.length-1]);ctx.fillStyle="#ff5f15";ctx.beginPath();ctx.arc(P.x,P.y,4,0,Math.PI*2);ctx.fill();}
    if(drag){
      // Magnifier: 2.5× view of the pixels under the finger, drawn above it.
      const P=toScreen(drag),R=44,zoom=2.5,cx=P.x,cy=Math.max(R+6,P.y-R-30);
      ctx.save();ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);ctx.clip();
      ctx.fillStyle="#000";ctx.fillRect(cx-R,cy-R,R*2,R*2);
      const srcW=(R*2)/(L.s*zoom),srcH=srcW;
      ctx.drawImage(img,drag.x-srcW/2,drag.y-srcH/2,srcW,srcH,cx-R,cy-R,R*2,R*2);
      ctx.restore();
      ctx.strokeStyle="#ffea00";ctx.lineWidth=2;ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);ctx.stroke();
      ctx.beginPath();ctx.moveTo(cx-10,cy);ctx.lineTo(cx+10,cy);ctx.moveTo(cx,cy-10);ctx.lineTo(cx,cy+10);ctx.stroke();
    }
  },[layout,reference,points,pairs,scale,knownMm,unit,drag]);
  useEffect(()=>{draw();},[draw,hasImage]);
  useEffect(()=>{const onResize=()=>draw();window.addEventListener("resize",onResize);return()=>window.removeEventListener("resize",onResize);},[draw]);

  async function load(blob:Blob){
    setError("");
    try{
      const bitmap=await createImageBitmap(blob).catch(()=>null);
      const source=bitmap??await new Promise<HTMLImageElement>((resolve,reject)=>{const el=new Image();el.onload=()=>resolve(el);el.onerror=()=>reject(new Error("decode"));el.src=URL.createObjectURL(blob);});
      const w=source.width,h=source.height,k=Math.min(1,MAX_SIDE/Math.max(w,h));
      const canvas=document.createElement("canvas");canvas.width=Math.round(w*k);canvas.height=Math.round(h*k);
      canvas.getContext("2d")?.drawImage(source,0,0,canvas.width,canvas.height);
      const img=new Image();img.src=canvas.toDataURL("image/jpeg",0.92);await img.decode();
      imageRef.current=img;setReference([]);setPoints([]);setHasImage(true);stopCamera();
    }catch{setError("That photo could not be read. Choose a JPEG or PNG, or take a new photo.");}
  }
  async function capture(){const blob=await takeSnapshot();if(blob)await load(blob);else setError("The camera has not started yet.");}
  function toImage(e:React.PointerEvent):Pt|null{
    const L=layout(),img=imageRef.current,frame=frameRef.current;if(!L||!img||!frame)return null;
    const rect=frame.getBoundingClientRect();
    const x=(e.clientX-rect.left-L.ox)/L.s,y=(e.clientY-rect.top-L.oy)/L.s;
    if(x<0||y<0||x>img.width||y>img.height)return null;
    return {x,y};
  }
  function place(p:Pt){
    if(reference.length<2){setReference(r=>[...r,p]);return;}
    setPoints(ps=>[...ps,p]);
  }
  function undo(){if(points.length){setPoints(ps=>ps.slice(0,-1));return;}setReference(r=>r.slice(0,-1));}
  const stepText=!hasImage?"Take a photo or choose one from your phone.":reference.length<2?`Tap both ends of the reference: ${refId==="custom"?(customMm?`${customMm} mm`:"enter its length below"):REFERENCE_LENGTHS.find(r=>r.id===refId)?.label}.`:points.length%2===1?"Tap the other end.":"Tap the two ends of anything in the same plane.";
  return <section className="measure-tool" data-testid="measure-photo">
    <div className="measure-stage measure-stage-photo" ref={frameRef}>
      <video ref={videoRef} className="measure-video" playsInline muted autoPlay hidden={hasImage||cameraState!=="live"}/>
      <canvas ref={canvasRef} className="measure-canvas" hidden={!hasImage} data-testid="measure-photo-canvas"
        onPointerDown={e=>{const p=toImage(e);if(p){setDrag(p);(e.target as HTMLElement).setPointerCapture(e.pointerId);}}}
        onPointerMove={e=>{if(!drag)return;const p=toImage(e);if(p)setDrag(p);}}
        onPointerUp={()=>{if(drag)place(drag);setDrag(null);}}
        onPointerCancel={()=>setDrag(null)}/>
      {!hasImage&&cameraState!=="live"&&<div className="measure-gate"><Ruler size={40} weight="duotone"/><div className="measure-actions"><button type="button" className="native-primary" onClick={()=>void startCamera()} disabled={cameraState==="starting"} data-testid="measure-photo-camera"><Camera size={18} weight="bold"/>{cameraState==="starting"?"Starting…":"Open camera"}</button><button type="button" className="native-pill" onClick={()=>fileRef.current?.click()}><ImageIcon size={16} weight="bold"/>Choose photo</button></div>{cameraMessage&&<p role="alert">{cameraMessage}</p>}<p>Include something of known size in the shot, square-on to the camera.</p></div>}
      {!hasImage&&cameraState==="live"&&<div className="measure-shutter"><button type="button" className="native-primary" onClick={()=>void capture()} data-testid="measure-photo-shutter"><Camera size={18} weight="bold"/>Take photo</button></div>}
    </div>
    <input ref={fileRef} type="file" accept="image/*,.heic,.heif" className="sr-only" onChange={e=>{const f=e.target.files?.[0];e.target.value="";if(f)void load(f);}} data-testid="measure-photo-file"/>
    <p className="measure-step" role="status">{stepText}</p>
    <div className="measure-reference">
      <label className="native-field"><span>Reference in the photo</span><span className="native-input native-select"><select value={refId} onChange={e=>{setRefId(e.target.value);setReference([]);}} aria-label="Reference object">{REFERENCE_LENGTHS.map(r=><option key={r.id} value={r.id}>{r.label} · {r.mm} mm</option>)}<option value="custom">Custom length…</option></select></span></label>
      {refId==="custom"&&<label className="native-field"><span>Reference length</span><span className="native-input"><input inputMode="decimal" value={customMm} onChange={e=>setCustomMm(e.target.value)} placeholder="e.g. 2400" aria-label="Reference length in millimetres"/><b>mm</b></span></label>}
    </div>
    {pairs.length>0&&<ol className="measure-list" aria-label="Measurements" data-testid="measure-photo-results">{pairs.map(([a,b],i)=><li key={i}><span>#{i+1}</span><strong>{scale?formatMm(measuredMm(a,b,scale),unit):"—"}</strong><small>{Math.round(pixelDistance(a,b))} px</small></li>)}</ol>}
    <div className="measure-actions">
      <button type="button" className="native-pill" onClick={()=>setUnit(u=>u==="metric"?"imperial":"metric")}>{unit==="metric"?"mm / m":"ft / in"}</button>
      <button type="button" className="native-pill" onClick={undo} disabled={!points.length&&!reference.length}><ArrowCounterClockwise size={14} weight="bold"/>Undo</button>
      <button type="button" className="native-pill" onClick={()=>{setPoints([]);setReference([]);}} disabled={!points.length&&!reference.length}><Trash size={14} weight="bold"/>Clear</button>
      {hasImage&&<><button type="button" className="native-pill" onClick={()=>{imageRef.current=null;setHasImage(false);setPoints([]);setReference([]);void startCamera();}}><Camera size={14} weight="bold"/>New photo</button><button type="button" className="native-pill" onClick={()=>fileRef.current?.click()}><ImageIcon size={14} weight="bold"/>Choose photo</button></>}
    </div>
    {error&&<p role="alert" className="native-form-error">{error}</p>}
    <p className="native-footnote">Accurate for things in the same flat plane as the reference, shot square-on — a wall, a slab, a sheet. Anything nearer or further than the reference reads long or short, so keep it for set-out checks and take the tape for the cut.</p>
  </section>;
}
