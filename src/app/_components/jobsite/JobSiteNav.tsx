"use client";

import { useEffect, useState } from "react";
import { STEPS, TRIAL_LINE } from "./story";

/**
 * The five steps of the job as jump links (Talk → Draft → Check → Send →
 * Invoice), shown once the visitor is past the opening scene, and the
 * sticky "Start free" button for phones. Plain anchors, so they work
 * before any script and scroll back as naturally as forward.
 */
export function JobSiteNav() {
  const [active, setActive] = useState<string | null>(null);
  const [pastHero, setPastHero] = useState(false);
  const [atEnd, setAtEnd] = useState(false);

  useEffect(() => {
    const steps = STEPS.map((s) => document.getElementById(s.anchor)).filter((el): el is HTMLElement => el !== null);
    const stepWatch = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    steps.forEach((el) => stepWatch.observe(el));

    const hero = document.getElementById("hero-heading");
    const end = document.querySelector("[data-final-cta]");
    const edgeWatch = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.target === hero) setPastHero(!e.isIntersecting && e.boundingClientRect.top < 0);
        if (e.target === end) setAtEnd(e.isIntersecting);
      }
    });
    if (hero) edgeWatch.observe(hero);
    if (end) edgeWatch.observe(end);
    return () => {
      stepWatch.disconnect();
      edgeWatch.disconnect();
    };
  }, []);

  return (
    <>
      <nav aria-label="The job, step by step" className={`jobsite-steps${pastHero ? " is-on" : ""}`}>
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
