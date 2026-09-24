"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {ArrowRight,ArrowsVertical,Compass,Crosshair,Lock,LockOpen,Pause,Play,Scan,SpeakerHigh,SpeakerSlash,Target} from "@phosphor-icons/react";
import {compassPoint,fallRatio,formatDegrees,gradePercent,pitchFromAngle,plumbError} from "@/t2qcal/lib/measure";
import {dominantEdge,edgeTilt,mmPerMetre,rgbaToGray,type Edge} from "@/t2qcal/lib/edge-level";
import {SteadyTracker,type SteadyState} from "@/t2qcal/lib/steady";
import {useCamera,useOrientation} from "./useSensors";
import {sendToCalculator} from "./sendToCalculator";
import {CameraResume,SensorGate,Stat,WaitingForSensor} from "./shared";

type Mode="edge"|"sight"|"surface"|"plumb";
type EdgeTarget="auto"|"level"|"plumb";
type Found={edge:Edge;target:0|90;tilt:number;box:{x:number;y:number;k:number};sw:number;sh:number};

const ANALYSE_MS=110,ROI=.72,MAX_SIDE=300;

/**
 * Camera level & pitch.
 *   Point at edge — aim at a shelf, lintel, fascia, bearer or door jamb. The
 *     edge is found in the camera picture, the phone's own tilt is taken off,
 *     and the reading locks by itself once the hand settles. No need to hold
 *     the phone level or against anything.
 *   Sight — look along a roof line or fall for its angle.
 *   On surface — the phone lying on the member, as a bubble level.
 *   Plumb — the phone flat against a post or stud.
 * Every mode steadies itself: readings are averaged and lock when still.
 */
export function LevelTool(){
  const orientation=useOrientation();
  const {videoRef,state:cameraState,message:cameraMessage,start:startCamera}=useCamera();
  const [mode,setMode]=useState<Mode>("edge");
  const [target,setTarget]=useState<EdgeTarget>("auto");
  const [zeroed,setZeroed]=useState(false);
  const [error,setError]=useState("");
  const [found,setFound]=useState<Found|null>(null);
  const [steady,setSteady]=useState<SteadyState|null>(null);
  const [sound,setSound]=useState(false);
  const stageRef=useRef<HTMLDivElement>(null);
  const tracker=useRef(new SteadyTracker(800,.06,.4,8));
  const readingRef=useRef(orientation.reading);
  const audio=useRef<AudioContext|null>(null);
  const lastState=useRef<string>("");
  const r=orientation.reading;
  const started=orientation.state==="ready";
  useEffect(()=>{readingRef.current=orientation.reading;},[orientation.reading]);
  async function begin(){const ok=await orientation.request();if(ok)await startCamera();}

  const beep=useCallback((freq:number,ms:number,times=1)=>{
    if(typeof navigator!=="undefined"&&"vibrate" in navigator)navigator.vibrate?.(times>1?[ms,60,ms]:ms);
    const ctx=audio.current;if(!ctx)return;
    for(let i=0;i<times;i++){const o=ctx.createOscillator(),g=ctx.createGain();o.frequency.value=freq;g.gain.value=.08;o.connect(g);g.connect(ctx.destination);const t=ctx.currentTime+i*(ms+60)/1000;o.start(t);o.stop(t+ms/1000);}
  },[]);
  function toggleSound(){
    // iOS only lets a page make sound after a tap, so the context is made here
    if(!sound&&!audio.current){try{const Ctx=window.AudioContext??(window as unknown as {webkitAudioContext:typeof AudioContext}).webkitAudioContext;audio.current=new Ctx();}catch{/* no audio: vibration still works where supported */}}
    void audio.current?.resume?.();setSound(s=>!s);
  }

  // The raw angle for the sensor modes; the edge mode feeds its own.
  const sensorAngle=r?(mode==="sight"?r.elevation:mode==="plumb"?plumbError(r.beta,r.gamma):mode==="surface"?r.tilt:null):null;
  useEffect(()=>{tracker.current.reset();lastState.current="";},[mode,target]);
  useEffect(()=>{
    if(mode==="edge"||sensorAngle===null||orientation.hold)return;
    const s=tracker.current.push(sensorAngle,performance.now());
    setSteady(s);
  },[sensorAngle,mode,orientation.hold]);

  // Point-at-edge: analyse the middle of the camera picture a few times a second.
  useEffect(()=>{
    if(!started||mode!=="edge"||cameraState!=="live")return;
    const canvas=document.createElement("canvas"),ctx=canvas.getContext("2d",{willReadFrequently:true});
    if(!ctx)return;
    const id=window.setInterval(()=>{
      const video=videoRef.current,stage=stageRef.current,reading=readingRef.current;
      if(!video||!stage||!video.videoWidth||!reading||orientation.hold)return;
      const vw=video.videoWidth,vh=video.videoHeight,sw=stage.clientWidth,sh=stage.clientHeight;
      // object-fit: cover — the part of the video actually on screen
      const cover=Math.max(sw/vw,sh/vh),visW=sw/cover,visH=sh/cover;
      const rw=visW*ROI,rh=visH*ROI,rx=(vw-rw)/2,ry=(vh-rh)/2;
      const k=Math.min(1,MAX_SIDE/Math.max(rw,rh)),cw=Math.max(8,Math.round(rw*k)),ch=Math.max(8,Math.round(rh*k));
      if(canvas.width!==cw||canvas.height!==ch){canvas.width=cw;canvas.height=ch;}
      ctx.drawImage(video,rx,ry,rw,rh,0,0,cw,ch);
      const gray=rgbaToGray(ctx.getImageData(0,0,cw,ch).data,cw,ch);
      const tries:Array<0|90>=target==="level"?[0]:target==="plumb"?[90]:[0,90];
      let best:{edge:Edge;target:0|90}|null=null,bestScore=0;
      for(const t of tries){const e=dominantEdge(gray,cw,ch,t,25);if(!e)continue;const score=e.confidence*e.length/(t===0?cw:ch);if(e.confidence>.2&&score>.18&&score>bestScore){best={edge:e,target:t};bestScore=score;}}
      if(!best){setFound(null);tracker.current.reset();setSteady(null);return;}
      const tilt=edgeTilt(best.edge.angle,reading.roll,best.target);
      // stage coordinates for drawing: ROI pixel → video pixel → screen
      const offX=(sw-vw*cover)/2,offY=(sh-vh*cover)/2;
      setFound({edge:best.edge,target:best.target,tilt,box:{x:offX+rx*cover,y:offY+ry*cover,k:cover/k},sw,sh});
      setSteady(tracker.current.push(tilt,performance.now()));
    },ANALYSE_MS);
    return()=>window.clearInterval(id);
  },[started,mode,cameraState,target,videoRef,orientation.hold]);

  // sound and buzz on lock, a double when it is dead level or plumb
  useEffect(()=>{
    const state=steady?.state??"";
    if(state==="locked"&&lastState.current!=="locked"&&steady){
      const onTarget=Math.abs(steady.value)<(mode==="edge"||mode==="plumb"?.15:.3);
      if(sound||!audio.current)beep(onTarget?1320:880,onTarget?160:90,onTarget?2:1);
    }
    lastState.current=state;
  },[steady,sound,beep,mode]);

  const edgeMode=mode==="edge";
  const live=edgeMode?(found?found.tilt:null):sensorAngle;
  const value=steady&&steady.state==="locked"?steady.value:live;
  const signed=value;
  const shownAngle=signed===null||signed===undefined||!Number.isFinite(signed)?null:Math.abs(signed);
  const pitch=shownAngle===null?null:pitchFromAngle(shownAngle);
  const fall=shownAngle===null?null:fallRatio(shownAngle);
  const locked=steady?.state==="locked";
  const onTarget=shownAngle!==null&&shownAngle<(edgeMode?.15:.5);
  function toRafter(){if(shownAngle===null)return;const msg=sendToCalculator("common-rafter",{angle:Math.min(85,Math.max(0.1,Math.round(shownAngle*10)/10))},`Roof angle ${formatDegrees(shownAngle)} from Measure`);if(msg)setError(msg);}
  function toPitch(){if(shownAngle===null)return;const rise=Math.round(Math.tan(shownAngle*Math.PI/180)*1000);const msg=sendToCalculator("pitch-angle",{rise,run:1000},`Pitch ${formatDegrees(shownAngle)} from Measure`);if(msg)setError(msg);}
  const bubbleX=r?Math.max(-1,Math.min(1,r.up[0]*4)):0,bubbleY=r?Math.max(-1,Math.min(1,-r.up[1]*4)):0;
  const plumbEdge=found?.target===90;
  const direction=signed===null||signed===undefined||onTarget?null:edgeMode?(plumbEdge?(signed>0?"top leans right":"top leans left"):(signed>0?"right end low":"left end low")):null;
  // drawn in percent of the stage, which the detection recorded, so the overlay needs no layout reads
  const pct=(v:number,size:number)=>v/size*100;
  const edgeLine=found&&edgeMode?{x1:pct(found.box.x+found.edge.x1*found.box.k,found.sw),y1:pct(found.box.y+found.edge.y1*found.box.k,found.sh),x2:pct(found.box.x+found.edge.x2*found.box.k,found.sw),y2:pct(found.box.y+found.edge.y2*found.box.k,found.sh)}:null;
  const statusText=edgeMode
    ?(cameraState!=="live"?"":!found?"point at a straight edge":locked?(onTarget?(plumbEdge?"plumb":"level"):"locked"):steady?.state==="settling"?"hold still…":"steadying…")
    :mode==="sight"?(sensorAngle!==null&&sensorAngle<-0.5?"looking down":sensorAngle!==null&&sensorAngle>0.5?"looking up":"level"):mode==="plumb"?(onTarget?"plumb":"out of plumb"):(onTarget?"level":"tilted");

  return <section className="measure-tool" data-testid="measure-level">
    <div className="measure-mode measure-mode-scroll" role="tablist" aria-label="Level mode">
      <button role="tab" aria-selected={mode==="edge"} onClick={()=>setMode("edge")} data-testid="level-mode-edge"><Scan size={16} weight="bold"/>Point at edge</button>
      <button role="tab" aria-selected={mode==="sight"} onClick={()=>setMode("sight")}><Crosshair size={16} weight="bold"/>Sight</button>
      <button role="tab" aria-selected={mode==="surface"} onClick={()=>setMode("surface")}><Target size={16} weight="bold"/>On surface</button>
      <button role="tab" aria-selected={mode==="plumb"} onClick={()=>setMode("plumb")}><ArrowsVertical size={16} weight="bold"/>Plumb</button>
    </div>
    <div ref={stageRef} className={`measure-stage${onTarget&&locked?" is-level":""}`} data-mode={mode}>
      <video ref={videoRef} className="measure-video" playsInline muted autoPlay hidden={(mode!=="sight"&&mode!=="edge")||cameraState!=="live"}/>
      {!started&&<SensorGate state={orientation.state} cameraState={cameraState} cameraMessage={cameraMessage} onStart={begin}/>}
      {started&&(mode==="sight"||mode==="edge")&&<CameraResume cameraState={cameraState} cameraMessage={cameraMessage} onResume={()=>void startCamera()}/>}
      {started&&mode==="edge"&&cameraState==="live"&&<svg className="measure-overlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <rect x={(1-ROI)*50} y={(1-ROI)*50} width={ROI*100} height={ROI*100} className="edge-roi"/>
        {edgeLine&&<><line {...edgeLine} className="edge-glow"/><line {...edgeLine} className={onTarget?"edge-line is-good":"edge-line"}/></>}
        {locked&&edgeLine&&<line x1={(edgeLine.x1+edgeLine.x2)/2} y1={(edgeLine.y1+edgeLine.y2)/2} x2={(edgeLine.x1+edgeLine.x2)/2+.01} y2={(edgeLine.y1+edgeLine.y2)/2} className="edge-lock"/>}
      </svg>}
      {started&&mode==="sight"&&<svg className="measure-overlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <g transform={`rotate(${r?-r.roll:0} 50 50)`}><line x1="0" y1="50" x2="100" y2="50" className="measure-horizon"/><line x1="0" y1="50" x2="100" y2="50" className="measure-horizon-glow"/></g>
        <line x1="50" y1="0" x2="50" y2="100" className="measure-axis"/><line x1="0" y1="50" x2="100" y2="50" className="measure-axis"/>
        <circle cx="50" cy="50" r="6" className="measure-ring"/><circle cx="50" cy="50" r="0.8" className="measure-dot"/>
      </svg>}
      {started&&mode!=="sight"&&mode!=="edge"&&<div className="measure-bubble-field" aria-hidden="true"><div className="measure-bubble-ring"/><div className="measure-bubble" style={{transform:`translate(${bubbleX*42}%,${bubbleY*42}%)`}}/></div>}
      {started&&<div className={`measure-readout${locked?" is-locked":""}`} role="status" aria-live="polite">
        <strong data-testid="measure-level-angle">{shownAngle===null?"—":formatDegrees(shownAngle,edgeMode?2:1)}</strong>
        <span>{locked?<Lock size={11} weight="bold"/>:null} {statusText}{direction?` · ${direction}`:""}</span>
        {steady&&steady.state!=="locked"&&steady.progress>0&&<i className="measure-settle" style={{transform:`scaleX(${steady.progress})`}}/>}
      </div>}
      {started&&<WaitingForSensor reading={r}/>}
      {started&&r?.heading!==null&&r?.heading!==undefined&&mode!=="edge"&&<span className="measure-heading"><Compass size={14} weight="bold"/>{Math.round(r.heading)}° {compassPoint(r.heading)}</span>}
    </div>
    {started&&<>
      {edgeMode&&<div className="measure-mode" role="tablist" aria-label="Edge direction">
        {(["auto","level","plumb"] as const).map(t=><button key={t} role="tab" aria-selected={target===t} onClick={()=>setTarget(t)}>{t==="auto"?"Auto":t==="level"?"Level edge":"Plumb edge"}</button>)}
      </div>}
      <div className="measure-grid">
        {edgeMode?<>
          <Stat label="Out by" value={signed===null||signed===undefined?"—":`${Math.abs(mmPerMetre(signed)).toFixed(1)} mm/m`} hint={direction??(onTarget?"on the mark":"per metre of edge")} testId="measure-edge-mm"/>
          <Stat label="Over 2.4 m" value={signed===null||signed===undefined?"—":`${Math.abs(mmPerMetre(signed)*2.4).toFixed(1)} mm`} hint="stud or door height"/>
          <Stat label="Over 3.6 m" value={signed===null||signed===undefined?"—":`${Math.abs(mmPerMetre(signed)*3.6).toFixed(1)} mm`} hint="a long bearer or lintel"/>
          <Stat label="Grade" value={shownAngle===null?"—":`${gradePercent(shownAngle).toFixed(2)} %`} hint={fall===null?"level":`1 : ${fall}`}/>
        </>:<>
          <Stat label="Roof pitch" value={pitch?`${pitch.risePer12.toFixed(1)} : 12`:"—"} hint="rise per 12 run"/>
          <Stat label="Rise per metre" value={pitch?`${Math.round(pitch.risePerMetre)} mm`:"—"} hint="per 1000 run"/>
          <Stat label="Grade" value={shownAngle===null?"—":`${gradePercent(shownAngle).toFixed(1)} %`} hint="rise ÷ run"/>
          <Stat label="Fall" value={fall===null?"level":`1 : ${fall}`} hint={mode==="surface"?"drainage fall":"along the line of sight"}/>
          {mode==="sight"&&<Stat label="Side roll" value={r?formatDegrees(r.roll):"—"} hint="keep the horizon flat"/>}
        </>}
      </div>
      <div className="measure-actions">
        <button type="button" className="native-pill" onClick={()=>{tracker.current.reset();setSteady(null);}} disabled={!locked}><LockOpen size={14} weight="bold"/>Unlock</button>
        <button type="button" className="native-pill" onClick={toggleSound} aria-pressed={sound}>{sound?<SpeakerHigh size={14} weight="bold"/>:<SpeakerSlash size={14} weight="bold"/>}{sound?"Beep on":"Beep off"}</button>
        <button type="button" className="native-pill" onClick={()=>orientation.setHold(h=>!h)} aria-pressed={orientation.hold}>{orientation.hold?<><Play size={14} weight="bold"/>Resume</>:<><Pause size={14} weight="bold"/>Freeze</>}</button>
        {!edgeMode&&<button type="button" className="native-pill" onClick={()=>{if(zeroed){orientation.clearZero();setZeroed(false);}else{orientation.zero();setZeroed(true);}}} aria-pressed={zeroed}>{zeroed?"Clear zero":"Zero here"}</button>}
        <button type="button" className="native-pill native-pill-primary" onClick={toRafter} disabled={shownAngle===null}>Rafter calculator <ArrowRight size={14} weight="bold"/></button>
        <button type="button" className="native-pill" onClick={toPitch} disabled={shownAngle===null}>Pitch &amp; angle <ArrowRight size={14} weight="bold"/></button>
      </div>
      {error&&<p role="alert" className="native-form-error">{error}</p>}
      <p className="native-footnote">{edgeMode?"Stand square-on to the edge with it across the middle of the frame, a metre or two away. It finds the edge, takes off your phone's own tilt and locks by itself once you are still; it unlocks when you move on. Good for shelves, lintels, bearers, fascias, benches and jambs. Hard shadows or a busy background can confuse it, so check anything you are fixing with a real level.":mode==="sight"?"Stand at the eave and sight along the roof line, or line the horizon up with a fascia to check it is level. Zero here on a known-level surface before fine work.":mode==="plumb"?"Hold the phone flat against the post, stud or formwork with the screen facing you. The reading is how far the face leans off vertical; under 0.5° shows as plumb.":"Lay the phone flat on the member with the screen up. Rotate it along the fall to read drainage grade — 1 : 60 is the usual minimum for 100 mm waste, 1 : 40 for 65 mm."}</p>
    </>}
  </section>;
}
