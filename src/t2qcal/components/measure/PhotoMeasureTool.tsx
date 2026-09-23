"use client";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {AngleIcon,ArrowCounterClockwise,ArrowRight,Camera,Image as ImageIcon,Polygon,Ruler,ShareNetwork,Trash} from "@phosphor-icons/react";
import {REFERENCE_LENGTHS,REFERENCE_RECTANGLES,formatArea,formatDegrees,formatMm,mappedAngle,mappedArea,mappedDistance,mappedQuadSides,pixelDistance,rectifyFromRectangle,scaleFromReference} from "@/t2qcal/lib/measure";
import {useCamera} from "./useSensors";
import {sendToCalculator} from "./sendToCalculator";

type Pt={x:number;y:number};
type Unit="metric"|"imperial";
type Mode="length"|"area"|"angle";
type RefKind="length"|"rect";
const MAX_SIDE=2400;
const ORANGE="#ff5f15",YELLOW="#ffea00";

/**
 * Measure from a photo. Snap a frame or choose a photo already on the phone,
 * then set the scale one of two ways:
 *   Known length    — tap both ends of something whose size you know (a 90 mm
 *                     stud, a bank card). Right only when shot square-on.
 *   Known rectangle — tap the four corners of a door, GIB sheet or A4 page.
 *                     Corrects perspective, so a wall shot at an angle still
 *                     measures true anywhere in that plane.
 * Then:
 *   Length — tap two ends of anything in the same plane
 *   Area   — trace an outline, close it, read m²; four corners seed a calculator
 *   Angle  — tap A, the corner, then B: a roof pitch straight off a gable photo
 * A magnifier follows the finger so the ends land on the pixel, not the
 * fingertip. The marked-up photo can be shared or saved. Everything stays on
 * the phone.
 */
export function PhotoMeasureTool(){
  const {videoRef,state:cameraState,message:cameraMessage,start:startCamera,stop:stopCamera,snapshot:takeSnapshot}=useCamera();
  const fileRef=useRef<HTMLInputElement>(null);
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const frameRef=useRef<HTMLDivElement>(null);
  const imageRef=useRef<HTMLImageElement|null>(null);
  const [hasImage,setHasImage]=useState(false);
  const [mode,setMode]=useState<Mode>("length");
  const [reference,setReference]=useState<Pt[]>([]);
  const [refKind,setRefKind]=useState<RefKind>("rect");
  const [refId,setRefId]=useState(REFERENCE_LENGTHS[0].id);
  const [rectId,setRectId]=useState(REFERENCE_RECTANGLES[0].id);
  const [customMm,setCustomMm]=useState("");
  const [customW,setCustomW]=useState("");
  const [customH,setCustomH]=useState("");
  const [draft,setDraft]=useState<Pt[]>([]);
  const [lengths,setLengths]=useState<Array<[Pt,Pt]>>([]);
  const [shapes,setShapes]=useState<Pt[][]>([]);
  const [angles,setAngles]=useState<Array<[Pt,Pt,Pt]>>([]);
  const [unit,setUnit]=useState<Unit>("metric");
  const [drag,setDrag]=useState<Pt|null>(null);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const knownMm=refId==="custom"?Number(customMm):REFERENCE_LENGTHS.find(r=>r.id===refId)?.mm??0;
  const rect=rectId==="custom"?{w:Number(customW),h:Number(customH)}:REFERENCE_RECTANGLES.find(r=>r.id===rectId)??{w:0,h:0};
  const refPoints=refKind==="rect"?4:2;
  const refDone=reference.length===refPoints;
  // One pixel→mm mapping drives every reading: a plain scale for a known
  // length, a plane homography for a known rectangle.
  const toMm=useMemo<((p:Pt)=>Pt)|null>(()=>{
    if(!refDone)return null;
    if(refKind==="rect")return rectifyFromRectangle(reference,rect.w,rect.h);
    const s=scaleFromReference(reference[0],reference[1],knownMm);
    return s?(p:Pt)=>({x:p.x*s,y:p.y*s}):null;
  },[refDone,refKind,reference,rect.w,rect.h,knownMm]);
  const refInvalid=refDone&&!toMm;

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
    const S=(p:Pt):Pt=>({x:L.ox+p.x*L.s,y:L.oy+p.y*L.s});
    const dot=(p:Pt,color:string)=>{const P=S(p);ctx.fillStyle=color;ctx.beginPath();ctx.arc(P.x,P.y,4,0,Math.PI*2);ctx.fill();ctx.strokeStyle="#000";ctx.lineWidth=1;ctx.stroke();};
    const tag=(text:string,x:number,y:number,color:string)=>{ctx.font="600 12px T2QMono, monospace";const w=ctx.measureText(text).width+12;ctx.fillStyle="#0a0a0aee";ctx.fillRect(x-w/2,y-9,w,18);ctx.fillStyle=color;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(text,x,y);};
    const seg=(a:Pt,b:Pt,color:string)=>{const A=S(a),B=S(b);ctx.lineWidth=3;ctx.strokeStyle="#0009";ctx.beginPath();ctx.moveTo(A.x,A.y);ctx.lineTo(B.x,B.y);ctx.stroke();ctx.lineWidth=1.5;ctx.strokeStyle=color;ctx.beginPath();ctx.moveTo(A.x,A.y);ctx.lineTo(B.x,B.y);ctx.stroke();};
    if(refKind==="length"&&reference.length===2){seg(reference[0],reference[1],YELLOW);dot(reference[0],YELLOW);dot(reference[1],YELLOW);const m=S({x:(reference[0].x+reference[1].x)/2,y:(reference[0].y+reference[1].y)/2});tag(`ref ${formatMm(knownMm,unit)}`,m.x,m.y-11,YELLOW);}
    else if(refKind==="rect"&&reference.length>0){
      for(let i=0;i+1<reference.length;i++)seg(reference[i],reference[i+1],YELLOW);
      if(reference.length===4)seg(reference[3],reference[0],YELLOW);
      reference.forEach((p,i)=>{dot(p,YELLOW);const P=S(p);tag(String(i+1),P.x,P.y-14,YELLOW);});
      // label the first (width) edge, clear of whatever gets measured inside the rectangle
      if(reference.length===4){const c=S({x:(reference[0].x+reference[1].x)/2,y:(reference[0].y+reference[1].y)/2});c.y=c.y>40?c.y-16:c.y+16;tag(toMm?`ref ${formatMm(rect.w,unit)} × ${formatMm(rect.h,unit)}`:"corners cross — redo",c.x,c.y,YELLOW);}
    }
    else reference.forEach(p=>dot(p,YELLOW));
    for(const [a,b] of lengths){seg(a,b,ORANGE);dot(a,ORANGE);dot(b,ORANGE);const m=S({x:(a.x+b.x)/2,y:(a.y+b.y)/2});tag(toMm?formatMm(mappedDistance(a,b,toMm),unit):"set reference",m.x,m.y-11,ORANGE);}
    for(const poly of shapes){ctx.beginPath();poly.forEach((p,i)=>{const P=S(p);if(i===0)ctx.moveTo(P.x,P.y);else ctx.lineTo(P.x,P.y);});ctx.closePath();ctx.fillStyle="rgba(255,95,21,.18)";ctx.fill();ctx.lineWidth=1.5;ctx.strokeStyle=ORANGE;ctx.stroke();poly.forEach(p=>dot(p,ORANGE));const c=poly.reduce((acc,p)=>({x:acc.x+p.x/poly.length,y:acc.y+p.y/poly.length}),{x:0,y:0});const C=S(c);tag(toMm?formatArea(mappedArea(poly,toMm),unit):"set reference",C.x,C.y,ORANGE);}
    for(const [a,v,b] of angles){seg(v,a,ORANGE);seg(v,b,ORANGE);dot(a,ORANGE);dot(v,YELLOW);dot(b,ORANGE);const V=S(v);tag(formatDegrees(toMm?mappedAngle(a,v,b,toMm):mappedAngle(a,v,b,p=>p)),V.x,V.y-16,YELLOW);}
    if(draft.length>0){for(let i=0;i+1<draft.length;i++)seg(draft[i],draft[i+1],mode==="angle"?ORANGE:"#ffffffcc");draft.forEach((p,i)=>dot(p,mode==="angle"&&i===1?YELLOW:ORANGE));}
    if(drag){
      const P=S(drag),R=44,zoom=2.5,cx=P.x,cy=Math.max(R+6,P.y-R-30);
      ctx.save();ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);ctx.clip();ctx.fillStyle="#000";ctx.fillRect(cx-R,cy-R,R*2,R*2);
      const srcW=(R*2)/(L.s*zoom);ctx.drawImage(img,drag.x-srcW/2,drag.y-srcW/2,srcW,srcW,cx-R,cy-R,R*2,R*2);ctx.restore();
      ctx.strokeStyle=YELLOW;ctx.lineWidth=2;ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(cx-10,cy);ctx.lineTo(cx+10,cy);ctx.moveTo(cx,cy-10);ctx.lineTo(cx,cy+10);ctx.stroke();
    }
  },[layout,reference,refKind,lengths,shapes,angles,draft,mode,toMm,knownMm,rect.w,rect.h,unit,drag]);
  useEffect(()=>{draw();},[draw,hasImage]);
  useEffect(()=>{const onResize=()=>draw();window.addEventListener("resize",onResize);return()=>window.removeEventListener("resize",onResize);},[draw]);

  function resetMarks(){setReference([]);setDraft([]);setLengths([]);setShapes([]);setAngles([]);setNotice("");}
  async function load(blob:Blob){
    setError("");
    try{
      const bitmap=await createImageBitmap(blob).catch(()=>null);
      const source=bitmap??await new Promise<HTMLImageElement>((resolve,reject)=>{const el=new Image();el.onload=()=>resolve(el);el.onerror=()=>reject(new Error("decode"));el.src=URL.createObjectURL(blob);});
      const w=source.width,h=source.height,k=Math.min(1,MAX_SIDE/Math.max(w,h));
      const canvas=document.createElement("canvas");canvas.width=Math.round(w*k);canvas.height=Math.round(h*k);
      canvas.getContext("2d")?.drawImage(source,0,0,canvas.width,canvas.height);
      const img=new Image();img.src=canvas.toDataURL("image/jpeg",0.92);await img.decode();
      imageRef.current=img;resetMarks();setHasImage(true);stopCamera();
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
    if(reference.length<refPoints){setReference(r=>[...r,p]);return;}
    const next=[...draft,p];
    if(mode==="length"&&next.length===2){setLengths(l=>[...l,[next[0],next[1]]]);setDraft([]);return;}
    if(mode==="angle"&&next.length===3){setAngles(a=>[...a,[next[0],next[1],next[2]]]);setDraft([]);return;}
    setDraft(next);
  }
  function closeShape(){if(draft.length<3)return;setShapes(s=>[...s,draft]);setDraft([]);}
  function undo(){
    if(draft.length){setDraft(d=>d.slice(0,-1));return;}
    if(mode==="length"&&lengths.length){setLengths(l=>l.slice(0,-1));return;}
    if(mode==="area"&&shapes.length){setShapes(s=>s.slice(0,-1));return;}
    if(mode==="angle"&&angles.length){setAngles(a=>a.slice(0,-1));return;}
    setReference(r=>r.slice(0,-1));
  }
  async function sharePhoto(){
    const canvas=canvasRef.current;if(!canvas)return;
    setNotice("");
    const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(b=>resolve(b),"image/jpeg",0.9));
    if(!blob){setError("The photo could not be exported.");return;}
    const file=new File([blob],`t2qcal-measure-${Date.now()}.jpg`,{type:"image/jpeg"});
    const nav=navigator as Navigator&{canShare?:(d:ShareData)=>boolean;share?:(d:ShareData)=>Promise<void>};
    try{
      if(nav.canShare?.({files:[file]})&&nav.share){await nav.share({files:[file],title:"T2QCAL measurement"});setNotice("Shared.");return;}
    }catch(e){if(e instanceof DOMException&&e.name==="AbortError")return;}
    const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setNotice("Saved to your downloads.");
  }
  function toCalculator(slug:string,values:Record<string,number>,name:string){const msg=sendToCalculator(slug,values,name);if(msg)setError(msg);}
  const lastQuad=toMm?[...shapes].reverse().map(p=>mappedQuadSides(p,toMm)).find((q):q is [number,number]=>q!==null)??null:null;
  const angleOf=(t:[Pt,Pt,Pt])=>mappedAngle(t[0],t[1],t[2],toMm??(p=>p));
  const lastAngle=angles.length?angleOf(angles[angles.length-1]):null;
  const refLabel=refKind==="rect"?(rectId==="custom"?`your ${customW||"?"} × ${customH||"?"} mm rectangle`:REFERENCE_RECTANGLES.find(r=>r.id===rectId)?.label):(refId==="custom"?(customMm?`${customMm} mm`:"enter its length below"):REFERENCE_LENGTHS.find(r=>r.id===refId)?.label);
  const stepText=!hasImage?"Take a photo or choose one from your phone."
    :refKind==="rect"&&reference.length<4?`Tap corner ${reference.length+1} of 4 of the ${refLabel}. Go round in order, starting with a width edge.`
    :refKind==="length"&&reference.length<2?`Tap both ends of the reference: ${refLabel}.`
    :refInvalid?"Those corners do not make a clean rectangle. Undo and tap them again, going round in order."
    :mode==="length"?(draft.length===1?"Tap the other end.":"Tap the two ends of anything in the same plane.")
    :mode==="area"?(draft.length<3?`Tap around the outline (${draft.length} of at least 3 corners).`:"Keep tapping corners, or close the shape.")
    :(draft.length===0?"Tap point A, then the corner, then point B.":draft.length===1?"Now tap the corner.":"Now tap point B.");
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
    {hasImage&&<div className="measure-mode" role="tablist" aria-label="What to measure">
      <button role="tab" aria-selected={mode==="length"} onClick={()=>{setMode("length");setDraft([]);}}><Ruler size={16} weight="bold"/>Length</button>
      <button role="tab" aria-selected={mode==="area"} onClick={()=>{setMode("area");setDraft([]);}}><Polygon size={16} weight="bold"/>Area</button>
      <button role="tab" aria-selected={mode==="angle"} onClick={()=>{setMode("angle");setDraft([]);}}><AngleIcon size={16} weight="bold"/>Angle</button>
    </div>}
    <p className="measure-step" role="status">{stepText}</p>
    <div className="measure-mode" role="tablist" aria-label="Scale reference">
      <button role="tab" aria-selected={refKind==="rect"} onClick={()=>{setRefKind("rect");setReference([]);}} data-testid="measure-ref-rect">Known rectangle</button>
      <button role="tab" aria-selected={refKind==="length"} onClick={()=>{setRefKind("length");setReference([]);}} data-testid="measure-ref-length">Known length</button>
    </div>
    {refKind==="rect"?<div className="measure-reference">
      <label className="native-field"><span>Rectangle in the photo</span><span className="native-input native-select"><select value={rectId} onChange={e=>{setRectId(e.target.value);setReference([]);}} aria-label="Reference rectangle">{REFERENCE_RECTANGLES.map(r=><option key={r.id} value={r.id}>{r.label}</option>)}<option value="custom">Custom size…</option></select></span></label>
      {rectId==="custom"&&<><label className="native-field"><span>Width (first edge tapped)</span><span className="native-input"><input inputMode="decimal" value={customW} onChange={e=>setCustomW(e.target.value)} placeholder="e.g. 1200" aria-label="Rectangle width in millimetres"/><b>mm</b></span></label>
      <label className="native-field"><span>Height</span><span className="native-input"><input inputMode="decimal" value={customH} onChange={e=>setCustomH(e.target.value)} placeholder="e.g. 2400" aria-label="Rectangle height in millimetres"/><b>mm</b></span></label></>}
    </div>:<div className="measure-reference">
      <label className="native-field"><span>Reference in the photo</span><span className="native-input native-select"><select value={refId} onChange={e=>{setRefId(e.target.value);setReference([]);}} aria-label="Reference object">{REFERENCE_LENGTHS.map(r=><option key={r.id} value={r.id}>{r.label} · {r.mm} mm</option>)}<option value="custom">Custom length…</option></select></span></label>
      {refId==="custom"&&<label className="native-field"><span>Reference length</span><span className="native-input"><input inputMode="decimal" value={customMm} onChange={e=>setCustomMm(e.target.value)} placeholder="e.g. 2400" aria-label="Reference length in millimetres"/><b>mm</b></span></label>}
    </div>}
    {(lengths.length>0||shapes.length>0||angles.length>0)&&<ol className="measure-list" aria-label="Measurements" data-testid="measure-photo-results">
      {lengths.map(([a,b],i)=><li key={`l${i}`}><span>L{i+1}</span><strong>{toMm?formatMm(mappedDistance(a,b,toMm),unit):"—"}</strong><small>{Math.round(pixelDistance(a,b))} px</small></li>)}
      {shapes.map((poly,i)=>{const sides=toMm?mappedQuadSides(poly,toMm):null;return <li key={`a${i}`}><span>A{i+1}</span><strong>{toMm?formatArea(mappedArea(poly,toMm),unit):"—"}</strong><small>{poly.length} corners{sides?` · ${formatMm(sides[0],unit)} × ${formatMm(sides[1],unit)}`:""}</small></li>;})}
      {angles.map((t,i)=><li key={`g${i}`}><span>∠{i+1}</span><strong>{formatDegrees(angleOf(t))}</strong><small>{refKind==="rect"&&toMm?"true angle on the plane":"as seen in the photo"}</small></li>)}
    </ol>}
    <div className="measure-actions">
      {mode==="area"&&draft.length>=3&&<button type="button" className="native-pill native-pill-primary" onClick={closeShape} data-testid="measure-close-shape"><Polygon size={14} weight="bold"/>Close shape</button>}
      <button type="button" className="native-pill" onClick={()=>setUnit(u=>u==="metric"?"imperial":"metric")}>{unit==="metric"?"mm / m":"ft / in"}</button>
      <button type="button" className="native-pill" onClick={undo} disabled={!draft.length&&!lengths.length&&!shapes.length&&!angles.length&&!reference.length}><ArrowCounterClockwise size={14} weight="bold"/>Undo</button>
      <button type="button" className="native-pill" onClick={resetMarks} disabled={!draft.length&&!lengths.length&&!shapes.length&&!angles.length&&!reference.length}><Trash size={14} weight="bold"/>Clear</button>
      {hasImage&&<><button type="button" className="native-pill" onClick={()=>void sharePhoto()} data-testid="measure-share"><ShareNetwork size={14} weight="bold"/>Share photo</button><button type="button" className="native-pill" onClick={()=>{imageRef.current=null;setHasImage(false);resetMarks();void startCamera();}}><Camera size={14} weight="bold"/>New photo</button><button type="button" className="native-pill" onClick={()=>fileRef.current?.click()}><ImageIcon size={14} weight="bold"/>Choose photo</button></>}
    </div>
    {(lastQuad||lastAngle!==null)&&<div className="measure-actions">
      {lastQuad&&<><button type="button" className="native-pill native-pill-primary" onClick={()=>toCalculator("floor-area",{length:Math.round(lastQuad[0]),width:Math.round(lastQuad[1])},"Area from photo")}>Floor area <ArrowRight size={14} weight="bold"/></button><button type="button" className="native-pill" onClick={()=>toCalculator("concrete-slab",{length:Math.round(lastQuad[0]),width:Math.round(lastQuad[1])},"Slab from photo")}>Concrete slab <ArrowRight size={14} weight="bold"/></button><button type="button" className="native-pill" onClick={()=>toCalculator("deck-boards",{length:Math.round(lastQuad[0]),width:Math.round(lastQuad[1])},"Deck from photo")}>Deck boards <ArrowRight size={14} weight="bold"/></button></>}
      {lastAngle!==null&&<><button type="button" className="native-pill native-pill-primary" onClick={()=>toCalculator("common-rafter",{angle:Math.min(85,Math.max(0.1,Math.round(Math.min(lastAngle,180-lastAngle)*10)/10))},"Roof angle from photo")}>Rafter calculator <ArrowRight size={14} weight="bold"/></button><button type="button" className="native-pill" onClick={()=>toCalculator("pitch-angle",{rise:Math.round(Math.tan(Math.min(lastAngle,180-lastAngle)*Math.PI/180)*1000),run:1000},"Pitch from photo")}>Pitch &amp; angle <ArrowRight size={14} weight="bold"/></button></>}
    </div>}
    {error&&<p role="alert" className="native-form-error">{error}</p>}
    {notice&&<p role="status" className="native-footnote">{notice}</p>}
    <p className="native-footnote">{refKind==="rect"?"Measures true anywhere in the same flat plane as the rectangle, even shot at an angle — a wall with a door in it, a floor with a sheet laid on it. Things standing proud of that plane still read wrong, so take the tape for the cut.":"Accurate for things in the same flat plane as the reference, shot square-on. Anything nearer or further than the reference reads long or short. Switch to Known rectangle when you cannot stand square-on."}</p>
  </section>;
}
