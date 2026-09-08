"use client";
import {useRef} from "react";
import Image from "next/image";
import {usePathname} from "next/navigation";
import {MagnifyingGlass,User,ArrowLeft,X} from "@phosphor-icons/react";
import catalog from "@/t2qcal/lib/native-catalog.json";
import {WebAppControls} from "./WebAppControls";
export function NativeShell(){
  const path=usePathname(),tool=catalog.tools.find(t=>path===`/t2qcal/calculator/${t.slug}`);
  const dialog=useRef<HTMLDialogElement>(null);
  return <><header className="native-header">
    {tool?<><a className="native-round" href="/t2qcal/calculators" aria-label="Back to calculators"><ArrowLeft size={23}/></a><strong className="native-screen-title">{tool.name}</strong></>:<><span className="native-header-spacer"/><a className="native-wordmark" href="/t2qcal/calculators" aria-label="T2QCAL home">{/* Exact asset from the native app. */}<Image src="/t2qcal/native-mark.png" alt="T2Q" width={997} height={421} style={{width:"auto",height:19}} unoptimized/><b>CAL</b></a></>}
    <div className="native-header-actions">{!tool&&<a className="native-round" href="/t2qcal/calculators?search=1" aria-label="Search calculators"><MagnifyingGlass size={22}/></a>}<button className="native-round" onClick={()=>dialog.current?.showModal()} aria-label="Settings"><User size={22}/></button></div>
  </header>
  <dialog ref={dialog} aria-label="Settings" className="native-settings"><div className="native-sheet-heading"><h2>Settings</h2><button onClick={()=>dialog.current?.close()} aria-label="Close settings"><X size={24}/></button></div><div className="native-group"><a className="native-row" href="/login?next=%2Ft2qcal%2Fcalculators"><User size={26}/><span><strong>Sign in with Tradies2Quote</strong><small>Use your account to save working across devices.</small></span></a><a className="native-row" href="/t2qcal/device"><span><strong>Saved on this device</strong><small>Open, export or restore your calculations.</small></span></a><a className="native-row" href="/t2qcal/install"><span><strong>Install T2QCAL</strong><small>Add this app to your Home Screen.</small></span></a></div><WebAppControls/><p className="native-footnote">T2QCAL · Construction calculators</p></dialog></>;
}
