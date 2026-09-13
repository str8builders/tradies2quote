"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
type InstallEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{outcome:string}> };
const subscribeDisplay=(notify:()=>void)=>{const media=window.matchMedia("(display-mode: standalone)");media.addEventListener("change",notify);return()=>media.removeEventListener("change",notify);};
const displaySnapshot=()=>window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & {standalone?:boolean}).standalone);
export function WebAppControls() {
  const standalone=useSyncExternalStore(subscribeDisplay,displaySnapshot,()=>false);
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [instructions, setInstructions] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [offlineReady,setOfflineReady]=useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const offer = (event: Event) => { event.preventDefault(); setPrompt(event as InstallEvent); };
    const done = () => { setInstalled(true); setPrompt(null); };
    window.addEventListener("beforeinstallprompt", offer); window.addEventListener("appinstalled", done);
    return () => { window.removeEventListener("beforeinstallprompt", offer); window.removeEventListener("appinstalled", done); };
  }, []);
  useEffect(()=>{
    if(process.env.NODE_ENV!=="production"||!("serviceWorker" in navigator))return;
    let cancelled=false;
    navigator.serviceWorker.register("/t2qcal/sw.js",{scope:"/t2qcal/",updateViaCache:"none"}).then(async registration=>{
      const worker=registration.active??registration.installing??registration.waiting;
      const ready=()=>{if(!cancelled){setOfflineReady(true);(registration.active??worker)?.postMessage({type:"WARM_PUBLIC_PAGE",path:window.location.pathname+(window.location.search||"")});}};
      if(registration.active)ready();else worker?.addEventListener("statechange",()=>{if(worker.state==="activated")ready();});
    }).catch(async()=>{const existing=await navigator.serviceWorker.getRegistration("/t2qcal/calculators").catch(()=>undefined);if(!cancelled){if(existing?.active&&existing.scope.endsWith("/t2qcal/"))setOfflineReady(true);else setMessage("Offline setup is unavailable in this browser. You can still use T2QCAL online.");}});
    return()=>{cancelled=true;};
  },[]);
  // The Install tap asks which app first: T2QCAL installs from this page,
  // Tradies2Quote from its own install page (separate manifest and icon).
  function install() { setChoosing(value=>!value); setInstructions(false); }
  async function installT2QCAL() {
    setChoosing(false);
    if (!prompt) { setInstructions(value=>!value); return; }
    try { await prompt.prompt(); const choice=await prompt.userChoice; if(choice.outcome!=="accepted")setMessage("You can install T2QCAL later from your browser menu."); }
    catch {setInstructions(true);}
    finally {setPrompt(null);}
  }
  return <section className="webapp-bar" aria-label="Install T2QCAL">
    <span>{offlineReady?"Offline support ready":"T2QCAL · Web app"}</span>
    {!(installed||standalone) && <button type="button" className="directory-button" onClick={install}>Install T2QCAL</button>}
    {(installed||standalone) && <span>Installed web app</span>}
    {choosing && <div className="install-instructions install-choice" role="group" aria-label="Choose an app to install"><strong>Which app do you want on your Home Screen?</strong><p>Each one installs as its own icon. You can add both.</p><div className="install-choice-options"><button type="button" className="button primary" onClick={()=>void installT2QCAL()}>T2QCAL · calculators (this app)</button><a className="button" href="/install">Tradies2Quote · quotes &amp; invoices</a></div></div>}
    {instructions && <div className="install-instructions"><strong>Add T2QCAL to your phone</strong><p>On iPhone or iPad, open this page in Safari, tap Share, then Add to Home Screen. On Android or desktop, choose Install app or Add to Home Screen in your browser menu.</p><p>Tradies2Quote and T2QCAL have separate Home Screen icons. Open each calculator once online to make it available offline. Save on this device works without an account. Account saves and quote transfer require internet.</p><button onClick={()=>setInstructions(false)}>Close instructions</button></div>}
    {message && <p role="status">{message}</p>}
  </section>;
}
