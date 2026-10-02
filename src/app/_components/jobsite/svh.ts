/**
 * One "screen" in the units the job-site CSS is laid out in: 100svh.
 *
 * The scenes and rooms are sized in svh (jobsite.css), but
 * window.innerHeight on iOS Safari grows when the toolbar collapses, so
 * maths in innerHeight drift from the layout by the toolbar's height:
 * rooms changed and clips started early or late. Every walk/scroll reader
 * uses this instead. Re-measured on resize (iOS fires it when the toolbar
 * shows or hides); falls back to innerHeight where svh is unsupported.
 */
let probe: HTMLDivElement | null = null;
let cached = 0;
let listening = false;

function measure() {
  if (!probe) {
    probe = document.createElement("div");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText =
      "position:fixed;top:0;left:0;width:0;height:100svh;visibility:hidden;pointer-events:none;";
    document.body.appendChild(probe);
  }
  const h = probe.getBoundingClientRect().height;
  cached = h > 0 ? h : window.innerHeight;
}

export function screenHeight(): number {
  if (typeof window === "undefined") return 0;
  if (!listening) {
    listening = true;
    window.addEventListener("resize", measure);
  }
  if (!cached) measure();
  return cached;
}
