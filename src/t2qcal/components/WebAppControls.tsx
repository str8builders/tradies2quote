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
  const [message, setMessage] = useState("");
  useEffect(() => {
    const offer = (event: Event) => { event.preventDefault(); setPrompt(event as InstallEvent); };
    const done = () => { setInstalled(true); setPrompt(null); };
    window.addEventListener("beforeinstallprompt", offer); window.addEventListener("appinstalled", done);
    return () => { window.removeEventListener("beforeinstallprompt", offer); window.removeEventListener("appinstalled", done); };
  }, []);
  async function install() {
    if (!prompt) { setInstructions(value=>!value); return; }
    try { await prompt.prompt(); const choice=await prompt.userChoice; if(choice.outcome!=="accepted")setMessage("You can install T2QCAL later from your browser menu."); }
    catch {setInstructions(true);}
    finally {setPrompt(null);}
  }
  return <section className="webapp-bar" aria-label="Install T2QCAL">
    <span>Construction calculators</span>
    {!(installed||standalone) && <button type="button" className="directory-button" onClick={install}>Install T2QCAL</button>}
    {(installed||standalone) && <span>Installed web app</span>}
    {instructions && <div className="install-instructions"><strong>Add T2QCAL to your phone</strong><p>On iPhone or iPad, open this page in Safari, tap Share, then Add to Home Screen. On Android or desktop, choose Install app or Add to Home Screen in your browser menu.</p><p>Tradies2Quote and T2QCAL have separate Home Screen icons. Open the app online. Once a calculator has loaded, its calculations run on your device. Signing in, saving working and creating quotes require internet access.</p><button onClick={()=>setInstructions(false)}>Close instructions</button></div>}
    {message && <p role="status">{message}</p>}
  </section>;
}
