"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { Pause, Play } from "@phosphor-icons/react";

const MOTION_KEY = "t2q-motion-paused";
let requestedPause: boolean | undefined;
function subscribe(callback: () => void) {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", callback);
  window.addEventListener("t2q-motion-change", callback);
  window.addEventListener("storage", callback);
  return () => {
    media.removeEventListener("change", callback);
    window.removeEventListener("t2q-motion-change", callback);
    window.removeEventListener("storage", callback);
  };
}
function snapshot() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    return true;
  if (requestedPause !== undefined) return requestedPause;
  try {
    return window.localStorage.getItem(MOTION_KEY) === "true";
  } catch {
    return false;
  }
}
export function useMotionPaused() {
  return useSyncExternalStore(subscribe, snapshot, () => true);
}

/** One decorative canvas, shared by every website/app route. No data or auth. */
export function LiveWallpaper() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const paused = useMotionPaused();
  const pathname = usePathname();
  const documentRoute =
    pathname.startsWith("/quote/") || pathname.endsWith("/pdf");

  useEffect(() => {
    document.documentElement.dataset.motion = paused ? "paused" : "playing";
  }, [paused]);

  useEffect(() => {
    const el = canvas.current;
    if (!el || paused || documentRoute) return;
    let cancelled = false;
    let dispose: (() => void) | undefined;
    // Keep Three.js out of the initial page payload and reduced-motion visits.
    void import("three")
      .then((THREE) => {
        if (cancelled) return;
        let renderer: InstanceType<typeof THREE.WebGLRenderer>;
        try {
          renderer = new THREE.WebGLRenderer({
            canvas: el,
            alpha: true,
            antialias: false,
            powerPreference: "low-power",
          });
        } catch {
          return;
        } // The CSS wallpaper remains available without WebGL.
        const compact = window.innerWidth < 800;
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 150);
        camera.position.z = 40;
        const geometry = new THREE.PlaneGeometry(
          95,
          58,
          compact ? 25 : 48,
          compact ? 14 : 26,
        );
        const material = new THREE.MeshBasicMaterial({
          color: 0xff5f15,
          wireframe: true,
          transparent: true,
          opacity: compact ? 0.055 : 0.095,
          depthWrite: false,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.set(-0.58, 0.1, -0.22);
        mesh.position.set(12, -6, -10);
        scene.add(mesh);
        const position = geometry.attributes.position;
        const particleGeometry = new THREE.BufferGeometry();
        const particles = new Float32Array((compact ? 35 : 80) * 3);
        for (let i = 0; i < particles.length; i += 3) {
          particles[i] = Math.sin(i * 17.1) * 45;
          particles[i + 1] = Math.cos(i * 8.3) * 30;
          particles[i + 2] = Math.sin(i * 2.7) * 10 - 8;
        }
        particleGeometry.setAttribute(
          "position",
          new THREE.BufferAttribute(particles, 3),
        );
        const particleMaterial = new THREE.PointsMaterial({
          color: 0xffea00,
          size: 0.07,
          transparent: true,
          opacity: 0.45,
          depthWrite: false,
        });
        const points = new THREE.Points(particleGeometry, particleMaterial);
        scene.add(points);
        let raf = 0;
        let last = 0;
        let pointerX = 0;
        let pointerY = 0;
        const resize = () => {
          const width = el.clientWidth;
          const height = el.clientHeight;
          if (!width || !height) return;
          renderer.setPixelRatio(
            Math.min(window.devicePixelRatio, compact ? 1 : 1.25),
          );
          renderer.setSize(width, height, false);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
        };
        const pointer = (event: PointerEvent) => {
          if (event.pointerType !== "mouse") return;
          pointerX = (event.clientX / window.innerWidth - 0.5) * 1.4;
          pointerY = (event.clientY / window.innerHeight - 0.5) * 0.8;
        };
        const render = (time: number) => {
          if (cancelled || document.hidden) return;
          raf = requestAnimationFrame(render);
          if (time - last < 1000 / 30) return;
          last = time;
          const t = time * 0.00013;
          for (let i = 0; i < position.count; i++) {
            position.setZ(
              i,
              Math.sin(position.getX(i) * 0.1 + t) * 3 +
                Math.cos(position.getY(i) * 0.12 + t * 0.7) * 2,
            );
          }
          position.needsUpdate = true;
          camera.position.x += (pointerX - camera.position.x) * 0.025;
          camera.position.y += (-pointerY - camera.position.y) * 0.025;
          points.rotation.z = Math.sin(t * 0.3) * 0.08;
          renderer.render(scene, camera);
        };
        const visibility = () => {
          cancelAnimationFrame(raf);
          if (!document.hidden) raf = requestAnimationFrame(render);
        };
        const lost = (event: Event) => {
          event.preventDefault();
          cancelAnimationFrame(raf);
        };
        const restored = () => {
          resize();
          visibility();
        };
        resize();
        window.addEventListener("resize", resize);
        window.addEventListener("pointermove", pointer, { passive: true });
        document.addEventListener("visibilitychange", visibility);
        el.addEventListener("webglcontextlost", lost);
        el.addEventListener("webglcontextrestored", restored);
        visibility();
        dispose = () => {
          cancelAnimationFrame(raf);
          window.removeEventListener("resize", resize);
          window.removeEventListener("pointermove", pointer);
          document.removeEventListener("visibilitychange", visibility);
          el.removeEventListener("webglcontextlost", lost);
          el.removeEventListener("webglcontextrestored", restored);
          geometry.dispose();
          material.dispose();
          particleGeometry.dispose();
          particleMaterial.dispose();
          renderer.dispose();
        };
      })
      .catch(() => {
        /* Optional graphics must never interrupt the site. */
      });
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [paused, documentRoute]);

  function toggle() {
    requestedPause = !paused;
    try {
      window.localStorage.setItem(MOTION_KEY, String(requestedPause));
    } catch {
      /* Session preference still works. */
    }
    window.dispatchEvent(new Event("t2q-motion-change"));
  }
  if (documentRoute) return null;
  return (
    <>
      <div
        className="studio-wallpaper"
        aria-hidden="true"
        data-testid="site-live-wallpaper"
      >
        <div className="studio-wallpaper-glow" />
        <div className="studio-wallpaper-grid" />
        <canvas ref={canvas} />
        <div className="studio-wallpaper-vignette" />
      </div>
      <button
        type="button"
        className={`studio-motion-control ${pathname.startsWith("/app") ? "studio-motion-control-app" : ""}`}
        onClick={toggle}
        aria-pressed={!paused}
        aria-label={paused ? "Enable website motion" : "Pause website motion"}
      >
        {paused ? (
          <Play size={13} weight="fill" />
        ) : (
          <Pause size={13} weight="fill" />
        )}
        <span>{paused ? "Motion off" : "Motion on"}</span>
      </button>
    </>
  );
}
