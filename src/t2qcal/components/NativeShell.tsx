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
  const signInHref=`/t2qcal/signin?next=${encodeURIComponent(path.startsWith("/t2qcal")?path:"/t2qcal/calculators")}`;
  return <><div className="native-navigation-header">
    <div className="native-app-return-row"><Link href="/app" className="native-app-return" data-testid="t2qcal-back-to-app"><ArrowLeft size={17} weight="bold" aria-hidden="true"/>Back to Tradies2Quote</Link></div>
    <header className="native-header">
    {tool?<><a className="native-round" href="/t2qcal/calculators" aria-label="Back to calculators"><ArrowLeft size={23}/></a><strong className="native-screen-title">{tool.name}</strong></>:<><span className="native-header-spacer"/><a className="native-wordmark" href="/t2qcal/calculators" aria-label="T2QCAL home">{/* Exact asset from the native app. */}<Image src="/t2qcal/native-mark.png" alt="T2Q" width={997} height={421} style={{width:"auto",height:19}} unoptimized/><b>CAL</b></a></>}
    <div className="native-header-actions">{!tool&&<a className="native-round" href="/t2qcal/calculators#search" aria-label="Search calculators"><MagnifyingGlass size={22}/></a>}<button className="native-round" onClick={()=>dialog.current?.showModal()} aria-label={account?`Account: ${account.name??account.email??"signed in"}`:"Settings"} data-signed-in={account?"true":"false"} data-testid="t2qcal-account-button"><User size={22}/>{account&&<i className="native-online-dot" aria-hidden="true"/>}</button></div>
  </header></div>
  <dialog ref={dialog} aria-label="Settings" className="native-settings"><div className="native-sheet-heading"><h2>Settings</h2><button onClick={()=>dialog.current?.close()} aria-label="Close settings"><X size={24}/></button></div>
    <div className="native-group" data-testid="t2qcal-account-state" data-state={account===undefined?"loading":account?"signed-in":"signed-out"}>
      {account?<div className="native-row native-account"><UserCircle size={26} weight="fill"/><span><strong>{account.name??"Signed in"}</strong><small>{account.email??"Your Tradies2Quote account"} · saves and quote drafts go to this account.</small></span><form action="/t2qcal/signout" method="post"><button type="submit" className="native-pill" aria-label="Sign out"><SignOut size={16} weight="bold"/>Sign out</button></form></div>
      :<a className="native-row" href={signInHref} data-testid="t2qcal-sign-in-link"><User size={26}/><span><strong>{account===undefined?"Checking your account…":"Sign in with Tradies2Quote"}</strong><small>Same login as the quoting app. Save working across devices and send quantities to a quote.</small></span></a>}
      <a className="native-row" href="/app"><span><strong>Open Tradies2Quote</strong><small>Quotes, invoices, clients and materials.</small></span></a>
      <a className="native-row" href="/t2qcal/device"><span><strong>Saved on this device</strong><small>Open, export or restore your calculations.</small></span></a>
      <a className="native-row" href="/t2qcal/install"><span><strong>Install T2QCAL</strong><small>Add this app to your Home Screen.</small></span></a>
    </div>
    <WebAppControls/><p className="native-footnote">T2QCAL · Construction calculators</p></dialog></>;
}
