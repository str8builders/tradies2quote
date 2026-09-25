import { SCENES, locate, type Located, type SceneBox, type SceneId } from "./timeline";

/**
 * Where the visitor is in the story, read straight from the page: the
 * [data-scene] sections are measured, and every scroll maps to a scene and
 * how far through it. The 3D reads `located` each frame; nothing here
 * re-renders React. Client only; started and stopped by the 3D layer.
 */
let boxes: SceneBox[] = [];
let current: Located = { scene: "site", t: 0 };
let users = 0;
let observer: ResizeObserver | null = null;
const listeners = new Set<() => void>();

const isScene = (id: string | undefined): id is SceneId => SCENES.includes(id as SceneId);

function update() {
  current = locate(window.scrollY, window.innerHeight, boxes);
  listeners.forEach((fn) => fn());
}

function measure() {
  boxes = Array.from(document.querySelectorAll<HTMLElement>("[data-scene]"))
    .filter((el) => isScene(el.dataset.scene))
    .map((el) => {
      const r = el.getBoundingClientRect();
      return { id: el.dataset.scene as SceneId, top: r.top + window.scrollY, height: r.height };
    });
  update();
}

export const scrollStore = {
  get located(): Located {
    return current;
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  start() {
    users += 1;
    if (users > 1) return;
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", measure);
    observer = new ResizeObserver(measure);
    const main = document.getElementById("main-content");
    if (main) observer.observe(main);
    measure();
  },
  stop() {
    users = Math.max(0, users - 1);
    if (users > 0) return;
    window.removeEventListener("scroll", update);
    window.removeEventListener("resize", measure);
    observer?.disconnect();
    observer = null;
  },
};
