"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {cameraElevation,cameraRoll,headingFromEvent,screenUp,smooth,surfaceTilt,upVector} from "@/t2qcal/lib/measure";

export type SensorState="idle"|"ready"|"denied"|"unsupported";
export type Reading={elevation:number;roll:number;tilt:number;up:[number,number,number];heading:number|null;beta:number;gamma:number};

type PermissionCapable={requestPermission?:()=>Promise<"granted"|"denied">};
const screenAngle=()=>{if(typeof screen!=="undefined"&&screen.orientation)return screen.orientation.angle;const legacy=(window as Window&{orientation?:number}).orientation;return typeof legacy==="number"?legacy:0;};

/**
 * Device orientation, asked for on a tap (iOS needs a user gesture for the
 * motion permission) and smoothed so the readout settles like a real level.
 * `hold` freezes the last reading; `zero` makes the current pose read 0.
 */
export function useOrientation(){
  const [state,setState]=useState<SensorState>("idle");
  const [reading,setReading]=useState<Reading|null>(null);
  const [hold,setHold]=useState(false);
  const holdRef=useRef(false);
  const smoothed=useRef<{elevation:number|null;roll:number|null;tilt:number|null}>({elevation:null,roll:null,tilt:null});
  const zeroRef=useRef({elevation:0,roll:0,tilt:0});
  const last=useRef<Reading|null>(null);
  useEffect(()=>{holdRef.current=hold;},[hold]);

  const handle=useCallback((event:DeviceOrientationEvent)=>{
    if(holdRef.current||event.beta===null||event.gamma===null)return;
    const beta=event.beta,gamma=event.gamma;
    const rawUp=upVector(beta,gamma),up=screenUp(rawUp,screenAngle());
    const s=smoothed.current;
    s.elevation=smooth(s.elevation,cameraElevation(beta,gamma));
    s.roll=smooth(s.roll,cameraRoll(beta,gamma));
    s.tilt=smooth(s.tilt,surfaceTilt(beta,gamma));
    const heading=headingFromEvent(event as DeviceOrientationEvent&{webkitCompassHeading?:number});
    const next:Reading={elevation:s.elevation-zeroRef.current.elevation,roll:s.roll-zeroRef.current.roll,tilt:Math.max(0,s.tilt-zeroRef.current.tilt),up,heading:heading??last.current?.heading??null,beta,gamma};
    last.current=next;
    setReading(next);
  },[]);

  useEffect(()=>{
    if(state!=="ready")return;
    const absolute="ondeviceorientationabsolute" in window;
    const name=absolute?"deviceorientationabsolute":"deviceorientation";
    window.addEventListener(name,handle as EventListener);
    // iOS only fires the plain event, and Android's absolute variant carries the compass.
    if(absolute)window.addEventListener("deviceorientation",handle as EventListener);
    return()=>{window.removeEventListener(name,handle as EventListener);if(absolute)window.removeEventListener("deviceorientation",handle as EventListener);};
  },[state,handle]);

  const request=useCallback(async()=>{
    if(typeof window==="undefined"||!("DeviceOrientationEvent" in window)){setState("unsupported");return false;}
    const api=DeviceOrientationEvent as unknown as PermissionCapable;
    try{
      if(typeof api.requestPermission==="function"){const answer=await api.requestPermission();if(answer==="denied"){setState("denied");return false;}}
    }catch{/* Some browsers expose the method but reject it; listening still works there. */}
    setState("ready");return true;
  },[]);

  const zero=useCallback(()=>{const s=smoothed.current;zeroRef.current={elevation:s.elevation??0,roll:s.roll??0,tilt:s.tilt??0};},[]);
  const clearZero=useCallback(()=>{zeroRef.current={elevation:0,roll:0,tilt:0};},[]);
  return {state,reading,request,hold,setHold,zero,clearZero};
}

export type CameraState="idle"|"starting"|"live"|"denied"|"unsupported"|"error";

/** Rear camera preview. Stops its tracks when the tool unmounts or the tab hides. */
export function useCamera(){
  const videoRef=useRef<HTMLVideoElement>(null);
  const streamRef=useRef<MediaStream|null>(null);
  // False once the hook has unmounted: a getUserMedia() that resolves after
  // that is stopped immediately instead of leaving the camera light on.
  const aliveRef=useRef(true);
  const [state,setState]=useState<CameraState>("idle");
  const [message,setMessage]=useState("");
  const stop=useCallback(()=>{streamRef.current?.getTracks().forEach(t=>t.stop());streamRef.current=null;if(videoRef.current)videoRef.current.srcObject=null;setState(s=>s==="live"||s==="starting"?"idle":s);},[]);
  const start=useCallback(async()=>{
    if(typeof navigator==="undefined"||!navigator.mediaDevices?.getUserMedia){setState("unsupported");setMessage("This browser cannot open the camera. Use Safari or Chrome, or install T2QCAL.");return false;}
    setState("starting");setMessage("");
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:"environment"},width:{ideal:1920},height:{ideal:1440}}});
      if(!aliveRef.current){stream.getTracks().forEach(t=>t.stop());return false;}
      streamRef.current=stream;
      const video=videoRef.current;
      if(video){video.srcObject=stream;await video.play().catch(()=>{});}
      setState("live");return true;
    }catch(e){
      const name=e instanceof DOMException?e.name:"";
      if(name==="NotAllowedError"||name==="SecurityError"){setState("denied");setMessage("Camera access was refused. Allow the camera for tradies2quote.com in your browser settings, then try again.");}
      else if(name==="NotFoundError"||name==="OverconstrainedError"){setState("error");setMessage("No rear camera was found on this device.");}
      else{setState("error");setMessage("The camera could not be started. Close other apps using it and try again.");}
      return false;
    }
  },[]);
  useEffect(()=>{
    aliveRef.current=true;
    const onHide=()=>{if(document.hidden)stop();};
    document.addEventListener("visibilitychange",onHide);
    return()=>{aliveRef.current=false;document.removeEventListener("visibilitychange",onHide);stop();};
  },[stop]);
  /** Grab the current frame as a JPEG blob for photo measuring. */
  const snapshot=useCallback(async():Promise<Blob|null>=>{
    const video=videoRef.current;if(!video||!video.videoWidth)return null;
    const canvas=document.createElement("canvas");canvas.width=video.videoWidth;canvas.height=video.videoHeight;
    canvas.getContext("2d")?.drawImage(video,0,0);
    return new Promise(resolve=>canvas.toBlob(b=>resolve(b),"image/jpeg",0.92));
  },[]);
  return {videoRef,state,message,start,stop,snapshot};
}
