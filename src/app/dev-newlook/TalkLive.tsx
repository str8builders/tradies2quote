"use client";

import { useEffect, useState } from "react";
import { TalkScreen } from "@/app/app/quotes/new/_v2/TalkScreen";

const noop = () => {};

/** Local only: what Web Audio actually hears from the mic on this device. */
async function probe(fresh: boolean): Promise<string> {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const early = fresh ? null : new Ctx();
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const ctx = early ?? new Ctx();
  await Promise.race([ctx.resume(), new Promise((r) => setTimeout(r, 1500))]);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const samples = new Float32Array(512);
  let max = 0;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 60));
    analyser.getFloatTimeDomainData(samples);
    for (const v of samples) max = Math.max(max, Math.abs(v));
  }
  const out = `${fresh ? "after" : "before"}: ${ctx.state} ${ctx.sampleRate}Hz max=${max.toFixed(5)}`;
  stream.getTracks().forEach((t) => t.stop());
  void ctx.close();
  return out;
}

/** The real Talk screen with the real microphone and meter (local only), plus which bar mode is on. */
export function TalkLive() {
  const [mode, setMode] = useState("—");
  const [probeText, setProbeText] = useState("tap to probe");
  useEffect(() => {
    const timer = window.setInterval(() => {
      const bars = document.querySelector<HTMLElement>("[data-bars]");
      const first = bars?.querySelector<HTMLElement>("span:nth-child(12)")?.style.transform ?? "";
      setMode(`${bars?.dataset.bars ?? "none"} ${first}`);
    }, 200);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <>
      <p className="fixed top-12 right-2 z-50 rounded bg-ui-surface-2 px-2 py-1 text-ui-xs text-ui-hivis">{mode}</p>
      <button
        type="button"
        onClick={async () => {
          setProbeText("probing…");
          try {
            setProbeText(`${await probe(false)} | ${await probe(true)}`);
          } catch (e) {
            setProbeText(`error: ${(e as Error).message}`);
          }
        }}
        className="fixed top-[62%] left-2 z-[60] max-w-[90vw] rounded bg-ui-surface-2 px-2 py-2 text-left text-ui-xs text-ui-hivis"
      >
        {probeText}
      </button>
      <TalkScreen back={{ kind: "cancel" }} focusOnArrival={false} onTranscript={noop} onTypeInstead={noop} />
    </>
  );
}
