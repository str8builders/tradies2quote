"use client";
import {useState} from "react";
import {ArrowRight,ArrowsVertical,Compass,Crosshair,Pause,Play,Target} from "@phosphor-icons/react";
import {compassPoint,fallRatio,formatDegrees,gradePercent,pitchFromAngle,plumbError} from "@/t2qcal/lib/measure";
import {useCamera,useOrientation} from "./useSensors";
import {sendToCalculator} from "./sendToCalculator";
import {CameraResume,SensorGate,Stat,WaitingForSensor} from "./shared";

type Mode="sight"|"surface"|"plumb";

/**
 * Camera level & pitch. Sight mode overlays a horizon on the live camera and
 * reads the angle you are looking along — aim up a roof line from the eave
 * and you have its pitch. Surface mode is a bubble level for the phone lying
 * on a rafter, slab or pipe, reading tilt, fall and grade.
 */
export function LevelTool(){
  const orientation=useOrientation();
  const {videoRef,state:cameraState,message:cameraMessage,start:startCamera}=useCamera();
  const [mode,setMode]=useState<Mode>("sight");
  const [zeroed,setZeroed]=useState(false);
  const [error,setError]=useState("");
  const r=orientation.reading;
  const started=orientation.state==="ready";
  async function begin(){const ok=await orientation.request();if(ok)await startCamera();}
  const angle=r?(mode==="sight"?r.elevation:mode==="plumb"?plumbError(r.beta,r.gamma):r.tilt):null;
  const shownAngle=angle===null?null:Math.abs(angle);
  const pitch=shownAngle===null?null:pitchFromAngle(shownAngle);
  const fall=shownAngle===null?null:fallRatio(shownAngle);
  function toRafter(){if(shownAngle===null)return;const msg=sendToCalculator("common-rafter",{angle:Math.min(85,Math.max(0.1,Math.round(shownAngle*10)/10))},`Roof angle ${formatDegrees(shownAngle)} from Measure`);if(msg)setError(msg);}
  function toPitch(){if(shownAngle===null)return;const rise=Math.round(Math.tan(shownAngle*Math.PI/180)*1000);const msg=sendToCalculator("pitch-angle",{rise,run:1000},`Pitch ${formatDegrees(shownAngle)} from Measure`);if(msg)setError(msg);}
  const bubbleX=r?Math.max(-1,Math.min(1,r.up[0]*4)):0,bubbleY=r?Math.max(-1,Math.min(1,-r.up[1]*4)):0;
  const level=shownAngle!==null&&shownAngle<0.5;
  return <section className="measure-tool" data-testid="measure-level">
    <div className="measure-mode" role="tablist" aria-label="Level mode">
      <button role="tab" aria-selected={mode==="sight"} onClick={()=>setMode("sight")}><Crosshair size={16} weight="bold"/>Sight through camera</button>
      <button role="tab" aria-selected={mode==="surface"} onClick={()=>setMode("surface")}><Target size={16} weight="bold"/>Lay on surface</button>
      <button role="tab" aria-selected={mode==="plumb"} onClick={()=>setMode("plumb")}><ArrowsVertical size={16} weight="bold"/>Plumb</button>
    </div>
    <div className={`measure-stage${level?" is-level":""}`} data-mode={mode}>
      <video ref={videoRef} className="measure-video" playsInline muted autoPlay hidden={mode!=="sight"||cameraState!=="live"}/>
      {!started&&<SensorGate state={orientation.state} cameraState={cameraState} cameraMessage={cameraMessage} onStart={begin}/>}
      {started&&mode==="sight"&&<CameraResume cameraState={cameraState} cameraMessage={cameraMessage} onResume={()=>void startCamera()}/>}
      {started&&mode==="sight"&&<svg className="measure-overlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <g transform={`rotate(${r?-r.roll:0} 50 50)`}><line x1="0" y1="50" x2="100" y2="50" className="measure-horizon"/><line x1="0" y1="50" x2="100" y2="50" className="measure-horizon-glow"/></g>
        <line x1="50" y1="0" x2="50" y2="100" className="measure-axis"/><line x1="0" y1="50" x2="100" y2="50" className="measure-axis"/>
        <circle cx="50" cy="50" r="6" className="measure-ring"/><circle cx="50" cy="50" r="0.8" className="measure-dot"/>
      </svg>}
      {started&&mode!=="sight"&&<div className="measure-bubble-field" aria-hidden="true"><div className="measure-bubble-ring"/><div className="measure-bubble" style={{transform:`translate(${bubbleX*42}%,${bubbleY*42}%)`}}/></div>}
      {started&&<div className="measure-readout" role="status" aria-live="polite">
        <strong data-testid="measure-level-angle">{shownAngle===null?"—":formatDegrees(shownAngle)}</strong>
        <span>{mode==="sight"?(angle!==null&&angle<-0.5?"looking down":angle!==null&&angle>0.5?"looking up":"level"):mode==="plumb"?(level?"plumb":"out of plumb"):(level?"level":"tilted")}</span>
      </div>}
      {started&&<WaitingForSensor reading={r}/>}
      {started&&r?.heading!==null&&r?.heading!==undefined&&<span className="measure-heading"><Compass size={14} weight="bold"/>{Math.round(r.heading)}° {compassPoint(r.heading)}</span>}
    </div>
    {started&&<>
      <div className="measure-grid">
        <Stat label="Roof pitch" value={pitch?`${pitch.risePer12.toFixed(1)} : 12`:"—"} hint="rise per 12 run"/>
        <Stat label="Rise per metre" value={pitch?`${Math.round(pitch.risePerMetre)} mm`:"—"} hint="per 1000 run"/>
        <Stat label="Grade" value={shownAngle===null?"—":`${gradePercent(shownAngle).toFixed(1)} %`} hint="rise ÷ run"/>
        <Stat label="Fall" value={fall===null?"level":`1 : ${fall}`} hint={mode==="surface"?"drainage fall":"along the line of sight"}/>
        {mode==="sight"&&<Stat label="Side roll" value={r?formatDegrees(r.roll):"—"} hint="keep the horizon flat"/>}
      </div>
      <div className="measure-actions">
        <button type="button" className="native-pill" onClick={()=>orientation.setHold(h=>!h)} aria-pressed={orientation.hold}>{orientation.hold?<><Play size={14} weight="bold"/>Resume</>:<><Pause size={14} weight="bold"/>Hold</>}</button>
        <button type="button" className="native-pill" onClick={()=>{if(zeroed){orientation.clearZero();setZeroed(false);}else{orientation.zero();setZeroed(true);}}} aria-pressed={zeroed}>{zeroed?"Clear zero":"Zero here"}</button>
        <button type="button" className="native-pill native-pill-primary" onClick={toRafter} disabled={shownAngle===null}>Rafter calculator <ArrowRight size={14} weight="bold"/></button>
        <button type="button" className="native-pill" onClick={toPitch} disabled={shownAngle===null}>Pitch &amp; angle <ArrowRight size={14} weight="bold"/></button>
      </div>
      {error&&<p role="alert" className="native-form-error">{error}</p>}
      <p className="native-footnote">{mode==="sight"?"Stand at the eave and sight along the roof line, or line the horizon up with a fascia to check it is level. Zero here on a known-level surface before fine work.":mode==="plumb"?"Hold the phone flat against the post, stud or formwork with the screen facing you. The reading is how far the face leans off vertical; under 0.5° shows as plumb.":"Lay the phone flat on the member with the screen up. Rotate it along the fall to read drainage grade — 1 : 60 is the usual minimum for 100 mm waste, 1 : 40 for 65 mm."}</p>
    </>}
  </section>;
}
