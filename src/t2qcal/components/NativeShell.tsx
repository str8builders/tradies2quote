"use client";
import {useEffect,useRef,useState} from "react";
import Image from "next/image";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {MagnifyingGlass,User,ArrowLeft,X,SignOut,UserCircle} from "@phosphor-icons/react";
import catalog from "@/t2qcal/lib/native-catalog.json";
import {WebAppControls} from "./WebAppControls";

type Account={email:string|null;name:string|null};

/**
 * True when this document runs as the installed T2QCAL web app (manifest
 * scope /t2qcal/). Tradies2Quote's own installed app has scope "/" and
 * contains T2QCAL, so an in-app "Back" there is a normal navigation; inside
 * the standalone T2QCAL app the same link leaves the scope and iOS shoves it
 * into a browser sheet — that is the "glitch" on the way back. Decided once
 * per app session from the URL the document was launched with.
 */
export function useCalculatorApp(){
  const [own,setOwn]=useState(false);
  useEffect(()=>{
    try{
      const standalone=window.matchMedia("(display-mode: standalone)").matches||Boolean((navigator as Navigator&{standalone?:boolean}).standalone);
      if(!standalone)return;
      const key="t2qcal.standalone-app";
      let flag=sessionStorage.getItem(key);
      if(flag===null){
        const entry=performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming|undefined;
        const launched=new URL(entry?.name||window.location.href,window.location.origin).pathname;
        flag=launched==="/t2qcal"||launched.startsWith("/t2qcal/")?"1":"0";
        sessionStorage.setItem(key,flag);
      }
      // Browser-owned state is read after hydration, once.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOwn(flag==="1");
    }catch{/* Treat as the shared app. */}
  },[]);
  return own;
}

/**
 * T2QCAL shares the Tradies2Quote session, so the shell asks the server
 * who is signed in and reflects it — a tradie who opened T2QCAL from the
 * quoting app is signed in already and must never be told to sign in again.
 * `undefined` = not asked yet, `null` = signed out.
 */
export function useCalculatorAccount(){
  const [account,setAccount]=useState<Account|null|undefined>(undefined);
  useEffect(()=>{
    let cancelled=false;
    fetch("/api/t2qcal/account",{cache:"no-store",signal:AbortSignal.timeout(8000)}).then(r=>r.ok?r.json():{account:null}).then(data=>{if(!cancelled)setAccount((data as {account:Account|null}).account??null);}).catch(()=>{if(!cancelled)setAccount(null);});
    return()=>{cancelled=true;};
  },[]);
  return account;
}

export function NativeShell(){
  const path=usePathname(),tool=catalog.tools.find(t=>path===`/t2qcal/calculator/${t.slug}`);
  const dialog=useRef<HTMLDialogElement>(null);
  const account=useCalculatorAccount();
  const ownApp=useCalculatorApp();
  const signInHref=`/t2qcal/signin?next=${encodeURIComponent(path.startsWith("/t2qcal")?path:"/t2qcal/calculators")}`;
  return <><div className="native-navigation-header">
    {!ownApp&&<div className="native-app-return-row"><Link href="/app" className="native-app-return" data-testid="t2qcal-back-to-app"><ArrowLeft size={17} weight="bold" aria-hidden="true"/>Back to Tradies2Quote</Link></div>}
    <header className="native-header">
    {tool?<><a className="native-round" href="/t2qcal/calculators" aria-label="Back to calculators"><ArrowLeft size={23}/></a><strong className="native-screen-title">{tool.name}</strong></>:<><span className="native-header-spacer"/><a className="native-wordmark" href="/t2qcal/calculators" aria-label="T2QCAL home">{/* Exact asset from the native app. */}<Image src="/t2qcal/native-mark.png" alt="T2Q" width={997} height={421} style={{width:"auto",height:19}} unoptimized/><b>CAL</b></a></>}
    <div className="native-header-actions">{!tool&&<a className="native-round" href="/t2qcal/calculators#search" aria-label="Search calculators"><MagnifyingGlass size={22}/></a>}<button className="native-round" onClick={()=>dialog.current?.showModal()} aria-label={account?`Account: ${account.name??account.email??"signed in"}`:"Settings"} data-signed-in={account?"true":"false"} data-testid="t2qcal-account-button"><User size={22}/>{account&&<i className="native-online-dot" aria-hidden="true"/>}</button></div>
  </header></div>
  <dialog ref={dialog} aria-label="Settings" className="native-settings"><div className="native-sheet-heading"><h2>Settings</h2><button onClick={()=>dialog.current?.close()} aria-label="Close settings"><X size={24}/></button></div>
    <div className="native-group" data-testid="t2qcal-account-state" data-state={account===undefined?"loading":account?"signed-in":"signed-out"}>
      {account?<div className="native-row native-account"><UserCircle size={26} weight="fill"/><span><strong>{account.name??"Signed in"}</strong><small>{account.email??"Your Tradies2Quote account"} · saves and quote drafts go to this account.</small></span><form action="/t2qcal/signout" method="post"><button type="submit" className="native-pill" aria-label="Sign out"><SignOut size={16} weight="bold"/>Sign out</button></form></div>
      :<a className="native-row" href={signInHref} data-testid="t2qcal-sign-in-link"><User size={26}/><span><strong>{account===undefined?"Checking your account…":"Sign in with Tradies2Quote"}</strong><small>Same login as the quoting app. Save working across devices and send quantities to a quote.</small></span></a>}
      {ownApp?<a className="native-row" href="/app" target="_blank" rel="noopener"><span><strong>Open Tradies2Quote</strong><small>Quotes, invoices, clients and materials — opens in your browser or the Tradies2Quote app.</small></span></a>
      :<a className="native-row" href="/app"><span><strong>Open Tradies2Quote</strong><small>Quotes, invoices, clients and materials.</small></span></a>}
      <a className="native-row" href="/t2qcal/device"><span><strong>Saved on this device</strong><small>Open, export or restore your calculations.</small></span></a>
      <a className="native-row" href="/t2qcal/install"><span><strong>Install T2QCAL</strong><small>Add this app to your Home Screen.</small></span></a>
    </div>
    <WebAppControls/><p className="native-footnote">T2QCAL · Construction calculators</p></dialog></>;
}
