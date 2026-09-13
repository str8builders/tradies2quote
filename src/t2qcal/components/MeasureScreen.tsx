"use client";
import {useEffect,useState} from "react";
import {ArrowsLeftRight,CaretRight,Crosshair,Ruler,TreeEvergreen} from "@phosphor-icons/react";
import {LevelTool} from "./measure/LevelTool";
import {HeightTool} from "./measure/HeightTool";
import {PhotoMeasureTool} from "./measure/PhotoMeasureTool";

type ToolId="level"|"height"|"photo";
const TOOLS:Array<{id:ToolId;name:string;summary:string;Icon:typeof Crosshair}>=[
  {id:"level",name:"Level & pitch",summary:"Sight a roof line for its pitch, or lay the phone on a member for tilt, fall and grade.",Icon:Crosshair},
  {id:"height",name:"Height & distance",summary:"Aim at the base, then the top: distance to a wall or pole and its height.",Icon:TreeEvergreen},
  {id:"photo",name:"Measure a photo",summary:"Tap a known size in the shot, then read any other span in the same plane.",Icon:Ruler},
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
      {tool==="level"&&<LevelTool/>}{tool==="height"&&<HeightTool/>}{tool==="photo"&&<PhotoMeasureTool/>}
    </>:<>
      <section className="native-hero"><div className="native-eyebrow">{"// CAMERA & SENSORS"}</div><h1>POINT.<br/><em>READ IT.</em></h1><p>The phone’s camera and tilt sensors as site tools: pitch, fall, height, distance and lengths from a photo. Runs on the phone, works offline once opened.</p></section>
      <h2 className="native-section-label">{"// MEASURE"}</h2>
      <div className="native-group">{TOOLS.map(({id,name,summary,Icon})=><button type="button" className="native-row" key={id} onClick={()=>open(id)} data-testid={`measure-open-${id}`}><span className="native-glyph"><Icon size={18} weight="fill"/></span><span><strong>{name}</strong><small>{summary}</small></span><CaretRight size={15}/></button>)}</div>
      <h2 className="native-section-label">{"// CONVERT & CHECK"}</h2>
      <div className="native-group">{LINKS.map(t=><a className="native-row" href={`/t2qcal/calculator/${t.slug}`} key={t.slug}><span className="native-glyph"><ArrowsLeftRight size={18}/></span><span><strong>{t.name}</strong><small>{t.summary}</small></span><CaretRight size={15}/></a>)}</div>
      <p className="native-footnote">Sensor readings are a check, not a survey. Zero the level on a known surface, and take the tape for anything you are about to cut.</p>
    </>}
  </main>;
}
