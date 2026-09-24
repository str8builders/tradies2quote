"use client";
import {useEffect,useState} from "react";
import {ArrowsLeftRight,CaretRight,Crosshair,Cube,Ruler,TreeEvergreen,Scan} from "@phosphor-icons/react";
import {LevelTool} from "./measure/LevelTool";
import {HeightTool} from "./measure/HeightTool";
import {PhotoMeasureTool} from "./measure/PhotoMeasureTool";
import {RoomScanTool} from "./measure/RoomScanTool";
import {ARTapeTool} from "./measure/ARTapeTool";

type ToolId="ar"|"level"|"height"|"photo"|"room";
const TOOLS:Array<{id:ToolId;name:string;summary:string;Icon:typeof Crosshair}>=[
  {id:"ar",name:"AR tape",summary:"Drop points on floors, walls and benches through the camera: 3D lengths, rise and floor areas.",Icon:Scan},
  {id:"level",name:"Level & plumb",summary:"Point the camera at a shelf, lintel or jamb: it finds the edge, reads it off level or plumb in mm per metre and locks by itself.",Icon:Crosshair},
  {id:"height",name:"Height & distance",summary:"Aim at the base, then the top: distance to a wall or pole and its height.",Icon:TreeEvergreen},
  {id:"photo",name:"Measure & lay out a photo",summary:"Tap or circle an object and its size is found for you. Lay studs, sheets or tiles over the photo and count what to buy.",Icon:Ruler},
  {id:"room",name:"Room scan (3D)",summary:"Aim at each floor corner: a plan, a 3D model, and the wall and floor quantities.",Icon:Cube},
];
const LINKS=[{slug:"all-unit-converter",name:"All-unit converter",summary:"Convert your site measurements."},{slug:"pitch-angle",name:"Pitch, rise & angle",summary:"Move between angle, grade and pitch."},{slug:"equal-spacing",name:"Equal spacing",summary:"Centers, clear gaps and running marks."}];

/** Camera and sensor measuring, in the browser and the installed web app. */
export function MeasureScreen(){
  const [tool,setTool]=useState<ToolId|null>(null);
  // Deep links (#level, #height, #photo) are read after hydration.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(()=>{const id=window.location.hash.replace("#","") as ToolId;if(TOOLS.some(t=>t.id===id))setTool(id);},[]);
  function open(id:ToolId|null){setTool(id);window.history.replaceState(null,"",id?`#${id}`:window.location.pathname);}
  const active=TOOLS.find(t=>t.id===tool);
  return <main className="native-page">
    {active?<>
      <div className="measure-head"><button type="button" className="native-pill" onClick={()=>open(null)} data-testid="measure-back">‹ All tools</button><h1 className="native-heading measure-title">{active.name}</h1></div>
      {tool==="ar"&&<ARTapeTool onOpenTool={open}/>}{tool==="level"&&<LevelTool/>}{tool==="height"&&<HeightTool/>}{tool==="photo"&&<PhotoMeasureTool/>}{tool==="room"&&<RoomScanTool/>}
    </>:<>
      <section className="native-hero"><div className="native-eyebrow">{"// CAMERA & SENSORS"}</div><h1>POINT.<br/><em>READ IT.</em></h1><p>The phone’s camera and tilt sensors as site tools: pitch, fall, height, distance and lengths from a photo. Runs on the phone, works offline once opened.</p></section>
      <h2 className="native-section-label">{"// MEASURE"}</h2>
      <div className="native-group">{TOOLS.map(({id,name,summary,Icon})=><button type="button" className="native-row" key={id} onClick={()=>open(id)} data-testid={`measure-open-${id}`}><span className="native-glyph"><Icon size={18} weight="fill"/></span><span><strong>{name}</strong><small>{summary}</small></span><CaretRight size={15}/></button>)}</div>
      <a className="native-row native-group" href="/t2qcal/takeoff"><span className="native-glyph"><Ruler size={18}/></span><span><strong>Measure a PDF plan</strong><small>Calibrate scale, mark quantities and carry the source into your quote.</small></span><CaretRight size={15}/></a>
      <h2 className="native-section-label">{"// CONVERT & CHECK"}</h2>
      <div className="native-group">{LINKS.map(t=><a className="native-row" href={`/t2qcal/calculator/${t.slug}`} key={t.slug}><span className="native-glyph"><ArrowsLeftRight size={18}/></span><span><strong>{t.name}</strong><small>{t.summary}</small></span><CaretRight size={15}/></a>)}</div>
      <p className="native-footnote">Sensor readings are a check, not a survey. Zero the level on a known surface, and take the tape for anything you are about to cut.</p>
    </>}
  </main>;
}
