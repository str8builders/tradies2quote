"use client";
import dynamic from "next/dynamic";
import { useState } from "react";
import { WelcomePoster } from "@/app/app/_components/WelcomePoster";
import { AppLoadingTape } from "@/app/app/_components/AppLoadingTape";
const WelcomePlayer = dynamic(() => import("@/app/app/_components/WelcomePlayer"), { ssr: false, loading: () => <WelcomePoster /> });

export function WelcomePreview() {
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const [key, setKey] = useState(0);
  return <div className="t2q-welcome-content" style={{ minHeight: "100dvh" }} data-testid="dev-welcome">
    <div className="t2q-welcome-art"><WelcomePlayer key={key} onComplete={() => setDone(true)} onProgress={setProgress} /></div>
    <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">Welcome to<br />Tradies<span className="text-brand">2</span>Quote.</h1>
    <div className="t2q-welcome-loading"><AppLoadingTape progress={progress} complete={done} label="preview" testId="dev-welcome-tape" /></div>
    <p className="mt-3 text-xs text-[#c4cec6]" data-testid="dev-welcome-state">{done ? "done" : `frame ${Math.round(progress * 149)}`}</p>
    <button type="button" className="t2q-btn-ghost-pro mt-4" onClick={() => { setDone(false); setProgress(0); setKey((k) => k + 1); }}>Replay</button>
    <div className="mt-8 w-full max-w-md"><p className="t2q-section-label-pro mb-2">{"// poster (reduced motion)"}</p><WelcomePoster /></div>
  </div>;
}
