"use client";

import { useEffect, useState } from "react";
import { STEPS, TRIAL_LINE } from "./story";

/**
 * The five steps of the job as jump links (Talk → Draft → Check → Send →
 * Invoice), shown while you walk the house (one room per step), and the
 * sticky "Start free" button for phones. Plain anchors, so they work
 * before any script and scroll back as naturally as forward.
 *
 * Everything is worked out from the scroll position (once a frame), so a
 * jump link, a jump back to the top or a layout change can't leave the
 * links showing the wrong state.
 */
export function JobSiteNav() {
  const [active, setActive] = useState<string | null>(null);
  const [pastHero, setPastHero] = useState(false);
  const [atTalk, setAtTalk] = useState(false);
  const [atEnd, setAtEnd] = useState(false);

  useEffect(() => {
    const steps = STEPS.map((s) => document.getElementById(s.anchor)).filter((el): el is HTMLElement => el !== null);
    const hero = document.getElementById("hero-heading");
    const talk = document.getElementById("talk");
    const details = document.querySelector('[data-scene="details"]');
    const end = document.querySelector("[data-final-cta]");
    const root = document.querySelector<HTMLElement>("[data-jobsite-root]");
    let frame = 0;

    const read = () => {
      frame = 0;
      const h = window.innerHeight;
      let current: string | null = null;
      for (const el of steps) if (el.getBoundingClientRect().top < h * 0.5) current = el.id;
      setActive(current);
      setPastHero(hero ? hero.getBoundingClientRect().bottom < 0 : false);
      // The steps are the rooms of the house: shown from Talk until you
      // step out to the finished home.
      const reachedTalk = talk ? talk.getBoundingClientRect().top < h * 0.5 : false;
      const leftHouse = details ? details.getBoundingClientRect().top < h * 0.5 : false;
      setAtTalk(reachedTalk && !leftHouse);
      root?.toggleAttribute("data-in-chapters", reachedTalk);
      const e = end?.getBoundingClientRect();
      setAtEnd(e ? e.top < h && e.bottom > 0 : false);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(read);
    };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const layout = new ResizeObserver(schedule);
    const main = document.getElementById("main-content");
    if (main) layout.observe(main);
    schedule();
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      layout.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <>
      <nav aria-label="The job, step by step" className={`jobsite-steps${atTalk ? " is-on" : ""}`}>
        <ol>
          {STEPS.map((s) => (
            <li key={s.anchor}>
              <a href={`#${s.anchor}`} aria-current={active === s.anchor ? "step" : undefined}>
                {s.label}
              </a>
            </li>
          ))}
        </ol>
      </nav>
      <a href="/signup" className={`jobsite-sticky-start${pastHero && !atEnd ? " is-on" : ""}`}>
        Start free <span>· {TRIAL_LINE}</span>
      </a>
    </>
  );
}
