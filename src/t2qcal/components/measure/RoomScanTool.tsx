"use client";
import {useMemo,useState} from "react";
import {ArrowCounterClockwise,ArrowRight,Compass,Crosshair,Cube} from "@phosphor-icons/react";
import {closureError,formatDegrees,formatMm} from "@/t2qcal/lib/measure";
import {cornerFromAim,summariseRoom,type Corner} from "@/t2qcal/lib/room-scan";
import {useCamera,useOrientation} from "./useSensors";
import {sendToCalculator} from "./sendToCalculator";
import {CameraResume,SensorGate,Stat,WaitingForSensor} from "./shared";
import {Room3D} from "./Room3D";

/**
 * 3D room scan: stand in the middle, aim at each floor corner in order
 * round the room and tap Mark corner. Range comes from the camera height
 * and the angle below level, bearing from the compass. The corners become
 * a plan, a 3D model and the plasterboard, paint, skirting and insulation
 * quantities.
 */
export function RoomScanTool(){
  const orientation=useOrientation();
  const {videoRef,state:cameraState,message:cameraMessage,start:startCamera}=useCamera();
  const [cameraHeight,setCameraHeight]=useState("1.60");
  const [wallHeight,setWallHeight]=useState("2.40");
  const [corners,setCorners]=useState<Corner[]>([]);
  const [closed,setClosed]=useState(false);
  // A second sighting of corner 1 after the lap: the gap is the scan's own error.
  const [check,setCheck]=useState<Corner|null>(null);
  const [error,setError]=useState("");
  const r=orientation.reading;
  const started=orientation.state==="ready";
  const h=Number(cameraHeight),wh=Number(wallHeight)||2.4;
  const live=r&&r.heading!==null?cornerFromAim(h,r.elevation,r.heading):null;
  const summary=useMemo(()=>summariseRoom(corners,wh),[corners,wh]);
  async function begin(){const ok=await orientation.request();if(ok)await startCamera();}
  function mark(){
    if(!r)return;setError("");
    if(r.heading===null){setError("No compass reading. Move the phone in a figure of eight to calibrate it, and keep it away from steel.");return;}
    const c=cornerFromAim(h,r.elevation,r.heading);
    if(!c){setError("Aim the crosshair at the floor where two walls meet — the camera has to be looking down at it.");return;}
    setCorners(cs=>[...cs,c]);
  }
  function checkClosure(){
    if(!r||corners.length<3)return;setError("");
    if(r.heading===null){setError("No compass reading. Move the phone in a figure of eight to calibrate it.");return;}
    const c=cornerFromAim(h,r.elevation,r.heading);
    if(!c){setError("Aim back at corner 1 on the floor, then check again.");return;}
    setCheck(c);
  }
  const closure=check&&corners.length>=3?closureError(corners[0],check,summary.perimeterM):null;
  function toCalc(slug:string,values:Record<string,number>,name:string){const msg=sendToCalculator(slug,values,name);if(msg)setError(msg);}
  const mm=(m:number)=>Math.max(1,Math.round(m*1000));
  return <section className="measure-tool" data-testid="measure-room">
    <div className="measure-stage">
      <video ref={videoRef} className="measure-video" playsInline muted autoPlay hidden={cameraState!=="live"}/>
      {!started&&<SensorGate state={orientation.state} cameraState={cameraState} cameraMessage={cameraMessage} onStart={begin}/>}
      {started&&<CameraResume cameraState={cameraState} cameraMessage={cameraMessage} onResume={()=>void startCamera()}/>}
      {started&&<svg className="measure-overlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><line x1="50" y1="0" x2="50" y2="100" className="measure-axis"/><line x1="0" y1="50" x2="100" y2="50" className="measure-axis"/><circle cx="50" cy="50" r="6" className="measure-ring"/><circle cx="50" cy="50" r="0.8" className="measure-dot"/></svg>}
      {started&&<WaitingForSensor reading={r}/>}
      {started&&r?.heading!==null&&r?.heading!==undefined&&<span className="measure-heading"><Compass size={14} weight="bold"/>{Math.round(r.heading)}°</span>}
      {started&&<div className="measure-readout" role="status" aria-live="polite"><strong data-testid="measure-room-range">{live?formatMm(live.distance*1000):"—"}</strong><span>{closed?"room closed — reset to scan again":corners.length===0?"aim at the first floor corner":`corner ${corners.length+1} · aim at the next corner clockwise`}{r?` · ${formatDegrees(r.elevation)} below level`:""}</span></div>}
    </div>
    {started&&<>
      <div className="measure-reference">
        <label className="native-field measure-inline-field"><span>Camera height above the floor</span><span className="native-input"><input inputMode="decimal" value={cameraHeight} onChange={e=>setCameraHeight(e.target.value)} aria-label="Camera height in metres"/><b>m</b></span></label>
        <label className="native-field measure-inline-field"><span>Wall height</span><span className="native-input"><input inputMode="decimal" value={wallHeight} onChange={e=>setWallHeight(e.target.value)} aria-label="Wall height in metres"/><b>m</b></span></label>
      </div>
      <div className="measure-actions">
        {!closed&&<button type="button" className="native-pill native-pill-primary" onClick={mark} disabled={!r||!(h>0)} data-testid="measure-room-mark"><Crosshair size={14} weight="bold"/>Mark corner {corners.length+1}</button>}
        {!closed&&corners.length>=3&&<button type="button" className="native-pill" onClick={()=>setClosed(true)} data-testid="measure-room-close"><Cube size={14} weight="bold"/>Close room</button>}
        {corners.length>0&&<button type="button" className="native-pill" onClick={()=>{setCheck(null);if(closed)setClosed(false);else setCorners(cs=>cs.slice(0,-1));}}><ArrowCounterClockwise size={14} weight="bold"/>{closed?"Reopen":"Undo corner"}</button>}
        {corners.length>0&&<button type="button" className="native-pill" onClick={()=>{setCorners([]);setClosed(false);setCheck(null);setError("");}}>Reset</button>}
        {closed&&corners.length>=3&&<button type="button" className="native-pill" onClick={checkClosure} disabled={!r} data-testid="measure-room-check"><Crosshair size={14} weight="bold"/>Re-aim at corner 1</button>}
      </div>
      {corners.length>0&&<ol className="measure-list" aria-label="Corners" data-testid="measure-room-corners">{corners.map((c,i)=><li key={i}><span>C{i+1}</span><strong>{formatMm(c.distance*1000)}</strong><small>{Math.round(c.heading)}° · {i>0?`wall ${formatMm(summary.walls[i-1]*1000)}`:"start"}</small></li>)}</ol>}
      {closed&&corners.length>=3&&<>
        <div className="measure-grid">
          <Stat label="Floor area" value={`${summary.floorM2.toFixed(1)} m²`} hint="from the corners" testId="measure-room-floor"/>
          <Stat label="Perimeter" value={formatMm(summary.perimeterM*1000)} hint={`${corners.length} walls`}/>
          <Stat label="Wall area" value={`${summary.wallM2.toFixed(1)} m²`} hint={`${wh} m high, before openings`}/>
          <Stat label="Overall" value={`${formatMm(summary.length*1000)} × ${formatMm(summary.width*1000)}`} hint="bounding size"/>
          <Stat label="Closure" value={closure?formatMm(closure.mm):"—"} hint={closure?`${closure.percent.toFixed(1)}% of the perimeter${closure.percent>2?" · rescan":" · good"}`:"re-aim at corner 1 to check"} testId="measure-room-closure"/>
        </div>
        <Room3D corners={corners} wallHeight={wh}/>
        <div className="measure-actions">
          <button type="button" className="native-pill native-pill-primary" onClick={()=>toCalc("plasterboard",{length:mm(summary.perimeterM),height:mm(wh)},"Room scan walls")}>Plasterboard <ArrowRight size={14} weight="bold"/></button>
          <button type="button" className="native-pill" onClick={()=>toCalc("paint-coverage",{length:mm(summary.perimeterM),height:mm(wh)},"Room scan walls")}>Paint <ArrowRight size={14} weight="bold"/></button>
          <button type="button" className="native-pill" onClick={()=>toCalc("insulation-batts",{length:mm(summary.perimeterM),height:mm(wh)},"Room scan walls")}>Insulation <ArrowRight size={14} weight="bold"/></button>
          <button type="button" className="native-pill" onClick={()=>toCalc("skirting",{length:mm(summary.length),width:mm(summary.width)},"Room scan floor")}>Skirting <ArrowRight size={14} weight="bold"/></button>
          <button type="button" className="native-pill" onClick={()=>toCalc("floor-area",{length:mm(summary.length),width:mm(summary.width)},"Room scan floor")}>Floor area <ArrowRight size={14} weight="bold"/></button>
        </div>
      </>}
      {error&&<p role="alert" className="native-form-error">{error}</p>}
      <p className="native-footnote">Stand in one spot and turn on the spot between corners. Keep the phone at the same height, aim at the exact floor corner, and go round in one direction. The compass drifts near steel and appliances; a rectangular room should come back with walls that pair up — if they do not, calibrate the compass and go again.</p>
    </>}
  </section>;
}
