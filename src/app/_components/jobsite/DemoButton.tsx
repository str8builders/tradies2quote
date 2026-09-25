"use client";

import { useRef, useState, type ReactNode } from "react";
import { X } from "@phosphor-icons/react";

/**
 * "Watch the 30-second demo": the same 30-second film the current homepage
 * plays, in a dialog. The tall cut on portrait screens, the wide cut
 * elsewhere. Nothing downloads until it's opened.
 */
export function DemoButton({ className = "", children }: { className?: string; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [cut, setCut] = useState<"tall" | "wide" | null>(null);

  function open() {
    setCut(window.innerHeight > window.innerWidth ? "tall" : "wide");
    dialog.current?.showModal();
  }

  return (
    <>
      <button type="button" className={className} onClick={open}>
        {children}
      </button>
      <dialog
        ref={dialog}
        className="jobsite-demo"
        aria-label="30-second demo"
        onClose={() => video.current?.pause()}
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current?.close();
        }}
      >
        <form method="dialog" className="jobsite-demo-close">
          <button type="submit" aria-label="Close the demo">
            <X size={22} weight="bold" aria-hidden="true" />
          </button>
        </form>
        {cut ? (
          <video
            key={cut}
            ref={video}
            controls
            autoPlay
            playsInline
            preload="none"
            className={cut === "tall" ? "jobsite-demo-tall" : "jobsite-demo-wide"}
          >
            <source src={`/videos/demo-${cut}.webm`} type="video/webm" />
            <source src={`/videos/demo-${cut}.mp4`} type="video/mp4" />
          </video>
        ) : null}
      </dialog>
    </>
  );
}
