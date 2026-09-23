"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {ArrowCounterClockwise,ArrowRight,Cube,Plus,Polygon,Ruler,TreeEvergreen,Warning,X} from "@phosphor-icons/react";
import type * as ThreeNS from "three";
import {formatArea,formatMm} from "@/t2qcal/lib/measure";
import {closedPlan,dist3,planSides,poseOrigin,runLength,runSegments,segmentParts,type V3} from "@/t2qcal/lib/ar-tape";
import {sendToCalculator} from "./sendToCalculator";

type Run={points:V3[];closed:boolean};
type Label={x:number;y:number;text:string};
type Support="checking"|"yes"|"no";
type Unit="metric"|"imperial";

/**
 * AR tape. On phones whose browser runs WebXR with hit testing (Android
 * Chrome today), the camera's own world tracking finds floors, walls and
 * benches: aim the ring, tap to drop points, and every hop is measured in
 * true 3D — the same way Apple Measure and AR rulers work. Chains can be
 * closed into a floor outline for area and perimeter, and the numbers go
 * straight into a calculator. Where the browser has no AR (iPhone Safari),
 * the tool says so and points at the sensor and photo tools instead.
 */
export function ARTapeTool({onOpenTool}:{onOpenTool:(id:"height"|"photo"|"room")=>void}){
  const [support,setSupport]=useState<Support>("checking");
  const [active,setActive]=useState(false);
  const [runs,setRuns]=useState<Run[]>([]);
  const [live,setLive]=useState<number|null>(null);
  const [tracking,setTracking]=useState(false);
  const [labels,setLabels]=useState<Label[]>([]);
  const [unit,setUnit]=useState<Unit>("metric");
  const [error,setError]=useState("");
  const overlayRef=useRef<HTMLDivElement>(null);
  const hostRef=useRef<HTMLDivElement>(null);
  const runsRef=useRef<Run[]>([]);
  const reticleAt=useRef<V3|null>(null);
  const sessionRef=useRef<XRSession|null>(null);
  const rebuildRef=useRef<()=>void>(()=>{});

  useEffect(()=>{
    let cancelled=false;
    const xr=typeof navigator!=="undefined"?navigator.xr:undefined;
    const check=xr&&window.isSecureContext?xr.isSessionSupported("immersive-ar"):Promise.resolve(false);
    check.then(ok=>{if(cancelled)return;setSupport(ok?"yes":"no");if(ok)void import("three");}).catch(()=>{if(!cancelled)setSupport("no");});
    return()=>{cancelled=true;};
  },[]);
  useEffect(()=>()=>{void sessionRef.current?.end().catch(()=>{});},[]);

  const commit=useCallback((next:Run[])=>{runsRef.current=next;setRuns(next);rebuildRef.current();},[]);
  const addPoint=useCallback(()=>{
    const p=reticleAt.current;if(!p)return;
    const all=runsRef.current.slice();
    const last=all[all.length-1];
    if(!last||last.closed)all.push({points:[p],closed:false});
    else all[all.length-1]={...last,points:[...last.points,p]};
    commit(all);
  },[commit]);
  function undo(){
    const all=runsRef.current.slice();const last=all[all.length-1];if(!last)return;
    if(last.closed)all[all.length-1]={...last,closed:false};
    else if(last.points.length>1)all[all.length-1]={...last,points:last.points.slice(0,-1)};
    else all.pop();
    commit(all);
  }
  function newLine(){const all=runsRef.current.slice();const last=all[all.length-1];if(last&&!last.closed&&last.points.length<2){return;}if(last&&!last.closed)all[all.length-1]={...last,closed:false};all.push({points:[],closed:false});commit(all.filter((r,i)=>r.points.length>0||i===all.length-1));}
  function closeShape(){const all=runsRef.current.slice();const last=all[all.length-1];if(!last||last.closed||last.points.length<3)return;all[all.length-1]={...last,closed:true};commit(all);}
  function clearAll(){commit([]);}

  async function start(){
    setError("");
    const xr=navigator.xr;const overlay=overlayRef.current,host=hostRef.current;
    if(!xr||!overlay||!host){setSupport("no");return;}
    overlay.classList.add("is-active");
    let session:XRSession;
    try{
      session=await xr.requestSession("immersive-ar",{requiredFeatures:["hit-test"],optionalFeatures:["dom-overlay"],domOverlay:{root:overlay}});
    }catch{
      overlay.classList.remove("is-active");
      setError("AR could not start. Allow camera access for tradies2quote.com and try again.");
      return;
    }
    sessionRef.current=session;
    const THREE=await import("three");
    const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
    renderer.setSize(window.innerWidth,window.innerHeight);
    renderer.xr.enabled=true;
    renderer.xr.setReferenceSpaceType("local");
    host.replaceChildren(renderer.domElement);
    const scene=new THREE.Scene();
    const camera=new THREE.PerspectiveCamera(70,window.innerWidth/window.innerHeight,0.01,40);
    scene.add(new THREE.HemisphereLight(0xffffff,0x444444,2));
    const reticle=new THREE.Mesh(new THREE.RingGeometry(0.035,0.05,40).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({color:0xffea00}));
    reticle.matrixAutoUpdate=false;reticle.visible=false;scene.add(reticle);
    const marks=new THREE.Group();scene.add(marks);
    const dotGeo=new THREE.SphereGeometry(0.012,16,12);
    const dotMat=new THREE.MeshBasicMaterial({color:0xff5f15});
    const lineMat=new THREE.LineBasicMaterial({color:0xffffff});
    const liveGeo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]);
    const liveLine=new THREE.Line(liveGeo,new THREE.LineDashedMaterial({color:0xffea00,dashSize:0.02,gapSize:0.015}));
    liveLine.visible=false;scene.add(liveLine);
    const v=(p:V3)=>new THREE.Vector3(p.x,p.y,p.z);
    rebuildRef.current=()=>{
      for(const child of [...marks.children]){marks.remove(child);if(child instanceof THREE.Line)child.geometry.dispose();}
      for(const run of runsRef.current){
        for(const p of run.points){const m=new THREE.Mesh(dotGeo,dotMat);m.position.copy(v(p));marks.add(m);}
        if(run.points.length>1){const pts=run.points.map(v);if(run.closed)pts.push(pts[0].clone());marks.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),lineMat));}
      }
    };
    rebuildRef.current();
    overlay.addEventListener("beforexrselect",preventSelect);
    let hitSource:XRHitTestSource|undefined;
    try{const viewer=await session.requestReferenceSpace("viewer");hitSource=await session.requestHitTestSource?.({space:viewer});}catch{/* handled below */}
    if(!hitSource){setError("This phone's AR does not report surfaces. Use Height & distance instead.");void session.end();return;}
    session.addEventListener("select",addPoint);
    await renderer.xr.setSession(session);
    setActive(true);
    let lastUi=0;
    const tmp=new THREE.Vector3();
    renderer.setAnimationLoop((time:number,frame?:XRFrame)=>{
      const space=renderer.xr.getReferenceSpace();
      if(frame&&space&&hitSource){
        const hit=frame.getHitTestResults(hitSource)[0];
        const pose=hit?.getPose(space);
        if(pose){reticle.visible=true;reticle.matrix.fromArray(pose.transform.matrix);reticleAt.current=poseOrigin(pose.transform.matrix);}
        else{reticle.visible=false;reticleAt.current=null;}
      }
      const cur=runsRef.current[runsRef.current.length-1];
      const lastPoint=cur&&!cur.closed?cur.points[cur.points.length-1]:undefined;
      if(lastPoint&&reticleAt.current){const pos=liveGeo.attributes.position as ThreeNS.BufferAttribute;pos.setXYZ(0,lastPoint.x,lastPoint.y,lastPoint.z);pos.setXYZ(1,reticleAt.current.x,reticleAt.current.y,reticleAt.current.z);pos.needsUpdate=true;liveLine.computeLineDistances();liveLine.visible=true;}
      else liveLine.visible=false;
      renderer.render(scene,camera);
      if(time-lastUi>100){
        lastUi=time;
        setTracking(reticleAt.current!==null);
        setLive(lastPoint&&reticleAt.current?dist3(lastPoint,reticleAt.current):null);
        const xrCam=renderer.xr.getCamera();const view=xrCam.cameras[0]??xrCam;
        const next:Label[]=[];
        for(const run of runsRef.current){
          const pts=run.closed?[...run.points,run.points[0]]:run.points;
          for(let i=1;i<pts.length;i++){
            const a=pts[i-1],b=pts[i];tmp.set((a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2).project(view);
            if(tmp.z<1&&Math.abs(tmp.x)<1.2&&Math.abs(tmp.y)<1.2)next.push({x:(tmp.x+1)/2*window.innerWidth,y:(1-tmp.y)/2*window.innerHeight,text:formatMm(dist3(a,b)*1000,unit)});
          }
        }
        setLabels(next);
      }
    });
    session.addEventListener("end",()=>{
      renderer.setAnimationLoop(null);
      hitSource?.cancel();
      overlay.removeEventListener("beforexrselect",preventSelect);
      scene.traverse(o=>{const m=o as {geometry?:{dispose():void};material?:{dispose():void}};m.geometry?.dispose?.();m.material?.dispose?.();});
      renderer.dispose();host.replaceChildren();
      overlay.classList.remove("is-active");
      sessionRef.current=null;reticleAt.current=null;rebuildRef.current=()=>{};
      setActive(false);setLive(null);setLabels([]);setTracking(false);
      // a trailing empty chain from "New line" is not a result
      const kept=runsRef.current.filter(r=>r.points.length>0);runsRef.current=kept;setRuns(kept);
    },{once:true});
  }

  const current=runs[runs.length-1];
  const canClose=!!current&&!current.closed&&current.points.length>=3;
  const results=runs.filter(r=>r.points.length>1);
  function toCalc(slug:string,values:Record<string,number>,name:string){const msg=sendToCalculator(slug,values,name);if(msg)setError(msg);}
  const mm=(m:number)=>Math.max(1,Math.round(m*1000));

  return <section className="measure-tool" data-testid="measure-ar">
    <div ref={hostRef} className="ar-host" aria-hidden="true"/>
    <div ref={overlayRef} className="ar-overlay" data-testid="measure-ar-overlay">
      {active&&<>
        <div className="ar-top"><span className={tracking?"ar-status is-on":"ar-status"}>{tracking?"Tap anywhere to drop a point":"Move the phone slowly to find a surface"}</span><button type="button" className="ar-round" onClick={()=>void sessionRef.current?.end()} aria-label="Finish AR tape"><X size={20} weight="bold"/></button></div>
        <div className="ar-cross" aria-hidden="true"/>
        {labels.map((l,i)=><span key={i} className="ar-label" style={{left:l.x,top:l.y}}>{l.text}</span>)}
        <div className="ar-bottom">
          <div className="ar-readout" role="status" aria-live="polite"><strong>{live!==null?formatMm(live*1000,unit):current&&current.points.length>1?formatMm(runLength(current.points)*1000,unit):"—"}</strong><span>{live!==null?"to the ring":current&&current.points.length>1?`${current.points.length-1} hops · total`:"drop the first point"}</span></div>
          <div className="ar-actions">
            <button type="button" className="native-pill" onClick={undo} disabled={runs.length===0}><ArrowCounterClockwise size={14} weight="bold"/>Undo</button>
            <button type="button" className="native-pill" onClick={newLine} disabled={!current||current.points.length<2}><Ruler size={14} weight="bold"/>New line</button>
            <button type="button" className="native-pill" onClick={closeShape} disabled={!canClose}><Polygon size={14} weight="bold"/>Close shape</button>
            <button type="button" className="native-primary ar-add" onClick={addPoint} disabled={!tracking}><Plus size={20} weight="bold"/>Point</button>
          </div>
        </div>
      </>}
    </div>
    {support==="checking"&&<p className="measure-step" role="status">Checking this phone for AR…</p>}
    {support==="yes"&&<div className="measure-stage ar-launch">
      <div className="measure-gate"><Cube size={40} weight="duotone"/>
        <button type="button" className="native-primary" onClick={()=>void start()} disabled={active} data-testid="measure-ar-start">Start AR tape</button>
        <p>Point the camera at the floor, a wall or a bench and move slowly until the yellow ring sits on it. Tap to drop points; each hop is measured in 3D.</p>
      </div>
    </div>}
    {support==="no"&&<div className="ar-fallback" data-testid="measure-ar-unsupported">
      <p><Warning size={16} weight="bold"/>This browser has no AR world tracking. It works in Chrome on Android phones with ARCore. iPhone Safari does not offer AR to websites yet.</p>
      <p>These tools use the camera and tilt sensors on any phone:</p>
      <div className="measure-actions">
        <button type="button" className="native-pill native-pill-primary" onClick={()=>onOpenTool("height")}><TreeEvergreen size={14} weight="bold"/>Height &amp; distance</button>
        <button type="button" className="native-pill" onClick={()=>onOpenTool("photo")}><Ruler size={14} weight="bold"/>Measure a photo</button>
        <button type="button" className="native-pill" onClick={()=>onOpenTool("room")}><Cube size={14} weight="bold"/>Room scan</button>
      </div>
    </div>}
    <div className="measure-actions">
      {(support==="yes"||runs.length>0)&&<button type="button" className="native-pill" onClick={()=>setUnit(u=>u==="metric"?"imperial":"metric")}>{unit==="metric"?"mm / m":"ft / in"}</button>}
      {runs.length>0&&!active&&<button type="button" className="native-pill" onClick={clearAll}>Clear all</button>}
    </div>
    {results.length>0&&<ol className="measure-list" aria-label="AR measurements" data-testid="measure-ar-results">
      {results.map((run,i)=>{const plan=run.closed?closedPlan(run.points):null;const segs=runSegments(run.closed?[...run.points,run.points[0]]:run.points);const first=segs.length===1?segmentParts(run.points[0],run.points[1]):null;
        return <li key={i}><span>{run.closed?`A${i+1}`:`L${i+1}`}</span><strong>{plan?formatArea(plan.area*1e6,unit):formatMm(runLength(run.points)*1000,unit)}</strong><small>{plan?`perimeter ${formatMm(plan.perimeter*1000,unit)} · ${run.points.length} corners`:first?`level ${formatMm(first.level*1000,unit)} · rise ${formatMm(first.rise*1000,unit)}`:segs.map(s=>formatMm(s*1000,unit)).join(" + ")}</small></li>;})}
    </ol>}
    {(()=>{const quad=[...runs].reverse().find(r=>r.closed&&r.points.length===4);const sides=quad?planSides(quad.points):null;if(!sides)return null;
      return <div className="measure-actions">
        <button type="button" className="native-pill native-pill-primary" onClick={()=>toCalc("floor-area",{length:mm(sides[0]),width:mm(sides[1])},"Area from AR tape")}>Floor area <ArrowRight size={14} weight="bold"/></button>
        <button type="button" className="native-pill" onClick={()=>toCalc("concrete-slab",{length:mm(sides[0]),width:mm(sides[1])},"Slab from AR tape")}>Concrete slab <ArrowRight size={14} weight="bold"/></button>
        <button type="button" className="native-pill" onClick={()=>toCalc("deck-boards",{length:mm(sides[0]),width:mm(sides[1])},"Deck from AR tape")}>Deck boards <ArrowRight size={14} weight="bold"/></button>
      </div>;})()}
    {error&&<p role="alert" className="native-form-error">{error}</p>}
    <p className="native-footnote">AR tracking is typically within 1 to 2 cm over a few metres on good light and textured surfaces. Plain white walls, glass and low light drift more, so take the tape for anything you cut.</p>
  </section>;
}

function preventSelect(e:Event){e.preventDefault();}
