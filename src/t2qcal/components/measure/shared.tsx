"use client";
import {useEffect,useState} from "react";
import {Camera,Warning} from "@phosphor-icons/react";
import type {CameraState,SensorState} from "./useSensors";

/** Shown while sensors are on but no reading has arrived yet (desktops, some tablets). */
export function WaitingForSensor({reading}:{reading:unknown}){
  const [slow,setSlow]=useState(false);
  useEffect(()=>{if(reading)return;const t=window.setTimeout(()=>setSlow(true),2500);return()=>window.clearTimeout(t);},[reading]);
  if(reading||!slow)return null;
  return <p className="measure-waiting" role="status"><Warning size={16} weight="bold"/>No motion readings yet. Hold the phone still for a moment; a desktop or a browser without motion sensors cannot use this tool.</p>;
}

export function Stat({label,value,hint,testId}:{label:string;value:string;hint?:string;testId?:string}){
  return <div className="measure-stat"><small>{label}</small><strong data-testid={testId}>{value}</strong>{hint&&<span>{hint}</span>}</div>;
}

/**
 * The camera is stopped whenever the phone hides the page (a call, the app
 * switcher, Control Center). Sensors keep their permission, so without this
 * the preview would stay black with no way back short of a reload.
 */
export function CameraResume({cameraState,cameraMessage,onResume}:{cameraState:CameraState;cameraMessage:string;onResume:()=>void}){
  if(cameraState==="live"||cameraState==="unsupported")return null;
  return <div className="measure-resume">
    <button type="button" className="native-primary" onClick={onResume} disabled={cameraState==="starting"} data-testid="measure-resume-camera"><Camera size={18} weight="bold"/>{cameraState==="starting"?"Starting…":"Resume camera"}</button>
    {cameraMessage&&<p role="alert"><Warning size={16} weight="bold"/>{cameraMessage}</p>}
  </div>;
}

/** The start button and every honest reason it might not work. */
export function SensorGate({state,cameraState,cameraMessage,onStart,label="Start camera & sensors"}:{state:SensorState;cameraState:CameraState;cameraMessage:string;onStart:()=>void;label?:string}){
  const blocked=state==="denied"||state==="unsupported";
  return <div className="measure-gate">
    <Camera size={40} weight="duotone"/>
    <button type="button" className="native-primary" onClick={onStart} disabled={cameraState==="starting"} data-testid="measure-start">{cameraState==="starting"?"Starting…":label}</button>
    {state==="denied"&&<p role="alert"><Warning size={16} weight="bold"/>Motion access was refused. On iPhone: Settings → Safari → Motion &amp; Orientation Access, then reload.</p>}
    {state==="unsupported"&&<p role="alert"><Warning size={16} weight="bold"/>This device has no motion sensors the browser can read. Use a phone or tablet.</p>}
    {cameraMessage&&<p role="alert"><Warning size={16} weight="bold"/>{cameraMessage}</p>}
    {!blocked&&!cameraMessage&&<p>Uses the rear camera and the phone’s tilt sensors. Nothing is uploaded — it all runs on the phone.</p>}
  </div>;
}
