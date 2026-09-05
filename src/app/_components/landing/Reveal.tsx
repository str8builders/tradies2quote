"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { useMotionPaused } from "../LiveWallpaper";
/** Server content is visible by default; motion only enhances the entrance. */
export function Reveal({
  children,
  delay = 0,
}: {
  children: ReactNode;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const paused = useMotionPaused();
  useEffect(() => {
    const node = ref.current;
    if (!node || paused || typeof IntersectionObserver === "undefined") return;
    let animation: Animation | undefined;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          animation = node.animate(
            [
              { opacity: 0.6, transform: "translateY(20px)" },
              { opacity: 1, transform: "translateY(0)" },
            ],
            { duration: 650, delay, easing: "cubic-bezier(.2,.7,.2,1)" },
          );
          io.disconnect();
        }
      },
      { threshold: 0, rootMargin: "0px 0px -30px 0px" },
    );
    io.observe(node);
    return () => {
      io.disconnect();
      animation?.cancel();
    };
  }, [paused, delay]);
  return <div ref={ref}>{children}</div>;
}
