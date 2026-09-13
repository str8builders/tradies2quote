"use client";
import {useState} from "react";
import {ArrowCounterClockwise,ArrowRight,Crosshair} from "@phosphor-icons/react";
import {distanceFromBase,formatDegrees,formatMm,heightFromTop} from "@/t2qcal/lib/measure";
import {useCamera,useOrientation} from "./useSensors";
import {sendToCalculator} from "./sendToCalculator";
import {SensorGate,Stat,WaitingForSensor} from "./shared";

/**
 * Two-tap clinometer. With the camera held at a known height, aiming at the
 * base of a wall, pole or tree gives the distance to it; aiming at the top
 * then gives its height. Good for ridge heights, setbacks, pole and tree
 * heights, and checking a boundary distance without walking it.
 */
export function HeightTool(){
  const orientation=useOrientation();
  const {videoRef,state:cameraState,message:cameraMessage,start:startCamera}=useCamera();
  const [cameraHeight,setCameraHeight]=useState("1.60");
  const [base,setBase]=useState<number|null>(null);
  const [top,setTop]=useState<number|null>(null);
  const [error,setError]=useState("");
  const r=orientation.reading;
  const started=orientation.state==="ready";
  const h=Number(cameraHeight);
  const distance=base===null?null:distanceFromBase(h,base);
  const height=distance===null||top===null?null:heightFromTop(h,distance,top);
  async function begin(){const ok=await orientation.request();if(ok)await startCamera();}
  function markBase(){if(!r)return;setError("");const d=distanceFromBase(h,r.elevation);if(d===null){setError("Aim at the BASE of the object — the crosshair has to be looking down at where it meets the ground.");return;}setBase(r.elevation);setTop(null);}
  function markTop(){if(!r||base===null)return;setError("");setTop(r.elevation);}
  function reset(){setBase(null);setTop(null);setError("");}
  function toRafter(){if(height===null)return;/* Wall plate height is what a rafter set-out wants; the ridge is a result, not an input. */const msg=sendToCalculator("common-rafter",{wallHeight:Math.min(12000,Math.max(0,Math.round(height*1000)))},`Wall height ${formatMm(height*1000)} from Measure`);if(msg)setError(msg);}
  const step=base===null?1:top===null?2:3;
  return <section className="measure-tool" data-testid="measure-height">
    <div className="measure-stage">
      <video ref={videoRef} className="measure-video" playsInline muted autoPlay hidden={cameraState!=="live"}/>
      {!started&&<SensorGate state={orientation.state} cameraState={cameraState} cameraMessage={cameraMessage} onStart={begin}/>}
      {started&&<svg className="measure-overlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><line x1="50" y1="0" x2="50" y2="100" className="measure-axis"/><line x1="0" y1="50" x2="100" y2="50" className="measure-axis"/><circle cx="50" cy="50" r="6" className="measure-ring"/><circle cx="50" cy="50" r="0.8" className="measure-dot"/></svg>}
      {started&&<WaitingForSensor reading={r}/>}
      {started&&<div className="measure-readout" role="status" aria-live="polite"><strong data-testid="measure-height-angle">{r?formatDegrees(r.elevation):"—"}</strong><span>{step===1?"aim at the base, then tap Mark base":step===2?"now aim at the top, then tap Mark top":"done — reset to measure again"}</span></div>}
    </div>
    {started&&<>
      <label className="native-field measure-inline-field"><span>Camera height above ground</span><span className="native-input"><input inputMode="decimal" value={cameraHeight} onChange={e=>setCameraHeight(e.target.value)} aria-label="Camera height in metres"/><b>m</b></span></label>
      <div className="measure-grid">
        <Stat label="Base angle" value={base===null?"—":formatDegrees(base)} hint="below level"/>
        <Stat label="Distance" value={distance===null?"—":formatMm(distance*1000)} hint="to the base" testId="measure-height-distance"/>
        <Stat label="Top angle" value={top===null?"—":formatDegrees(top)} hint="above level"/>
        <Stat label="Height" value={height===null?"—":formatMm(height*1000)} hint="ground to top" testId="measure-height-result"/>
      </div>
      <div className="measure-actions">
        {step===1&&<button type="button" className="native-pill native-pill-primary" onClick={markBase} disabled={!r||!(h>0)}><Crosshair size={14} weight="bold"/>Mark base</button>}
        {step===2&&<button type="button" className="native-pill native-pill-primary" onClick={markTop} disabled={!r}><Crosshair size={14} weight="bold"/>Mark top</button>}
        {step>1&&<button type="button" className="native-pill" onClick={reset}><ArrowCounterClockwise size={14} weight="bold"/>Reset</button>}
        {height!==null&&<button type="button" className="native-pill" onClick={toRafter}>Use as wall height <ArrowRight size={14} weight="bold"/></button>}
      </div>
      {error&&<p role="alert" className="native-form-error">{error}</p>}
      <p className="native-footnote">Keep your feet planted between the two marks and hold the phone at the same height for both. Level ground gives the best result; expect a few percent either way, so treat it as a check, not a survey.</p>
    </>}
  </section>;
}
