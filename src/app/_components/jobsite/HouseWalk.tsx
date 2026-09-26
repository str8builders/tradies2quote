"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { walkAt } from "./house-walk";
import { useSiteLevel } from "./site-level";
import { EXAMPLE_LABEL, FILMED_ON, ROOMS, type Room } from "./story";

/**
 * Inside the house: after the dive into the phone, one of the owner's
 * builds, one room per step of the job (Talk → Draft → Check → Send →
 * Invoice). Each room holds while you scroll, its walkthrough clip plays
 * once as you arrive, and the next room fades in over it as you step
 * forward. Invoice is the finished home.
 *
 * Beside the words each room has a phone slot. With 3D, a real phone floats
 * over it and plays that step (canvas/HousePhone.tsx, using the same walk
 * maths in house-walk.ts); without, the slot shows the step's finished
 * screen in a drawn phone, and that picture carries the description for
 * screen readers either way.
 *
 * All the words and pictures are server-rendered HTML; this component only
 * adds the motion. In the still version (no WebGL, reduced motion, "Pause
 * background motion", data saver) the rooms are plain sections with a still
 * of each room and no video.
 */

function clipSrc(id: string, level: "full" | "lite") {
  return `/jobsite/rooms/${id}-${level === "full" ? "720" : "540"}.mp4`;
}

function RoomFootage({
  room,
  index,
  level,
}: {
  room: Room;
  index: number;
  level: "full" | "lite" | "still";
}) {
  if (room.media.kind === "photo") {
    return (
      <Image
        src={room.media.src}
        alt={room.media.alt}
        fill
        sizes="(min-width: 900px) 52svh, 100vw"
        className="house-photo"
      />
    );
  }
  return (
    <>
      <Image
        src={`/jobsite/rooms/${room.id}.jpg`}
        alt=""
        fill
        sizes="(min-width: 900px) 52svh, 100vw"
        className="house-still"
        priority={index === 0}
      />
      {level !== "still" ? (
        <video
          className="house-video"
          data-room-video={room.id}
          src={clipSrc(room.id, level)}
          poster={`/jobsite/rooms/${room.id}-first.jpg`}
          muted
          playsInline
          preload="none"
          aria-hidden="true"
          disablePictureInPicture
        />
      ) : null}
    </>
  );
}

export function HouseWalk() {
  const level = useSiteLevel();
  const moving = level !== "still";
  const walk = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = walk.current;
    if (!root) return;
    const rooms = Array.from(root.querySelectorAll<HTMLElement>("[data-room]"));
    const pins = rooms.map((el) => el.querySelector<HTMLElement>(".house-pin"));
    const videos = rooms.map((el) =>
      el.querySelector<HTMLVideoElement>("video"),
    );

    if (!moving) {
      pins.forEach((pin) => {
        if (!pin) return;
        pin.style.opacity = "";
        pin.style.removeProperty("--walk");
      });
      return;
    }

    let frame = 0;
    let active = -1;
    const read = () => {
      frame = 0;
      const vh = window.innerHeight;
      const tops = rooms.map((el) => el.getBoundingClientRect().top);
      // No room plays until you've walked into one (active is -1 before).
      const { enter, active: now } = walkAt(tops, vh);
      enter.forEach((e, i) => {
        const pin = pins[i];
        if (!pin) return;
        pin.style.opacity = e.toFixed(3);
        pin.style.setProperty("--walk", (1 - e).toFixed(3));
      });

      // The house is close: start fetching the first room's clip.
      if (tops[0] < vh * 2 && videos[0] && videos[0].preload === "none")
        videos[0].preload = "auto";
      if (now !== active) {
        active = now;
        videos.forEach((v, i) => {
          if (!v) return;
          if (i === active) {
            // Arriving (again): walk the room from the start, then hold.
            v.currentTime = 0;
            v.play().catch(() => {
              /* Autoplay refused (e.g. low-power mode): the poster stays. */
            });
          } else {
            v.pause();
          }
          if (i === active + 1 && v.preload === "none") v.preload = "auto";
        });
      }
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(read);
    };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) window.cancelAnimationFrame(frame);
      videos.forEach((v) => v?.pause());
    };
  }, [moving, level]);

  return (
    <div ref={walk} className="house">
      {ROOMS.map((room, i) => (
        <section
          key={room.id}
          id={room.id}
          data-room={room.id}
          className="house-room"
          aria-labelledby={`room-${room.id}`}
        >
          <div className="house-pin">
            <div className="house-backdrop" aria-hidden="true">
              <Image
                src={
                  room.media.kind === "photo"
                    ? room.media.src
                    : `/jobsite/rooms/${room.id}.jpg`
                }
                alt=""
                fill
                // Blurred to a soft wash: a small image is all it needs.
                sizes="320px"
                className="house-backdrop-img"
              />
            </div>
            <div className="house-footage">
              <RoomFootage room={room} index={i} level={level} />
            </div>
            <div className="house-scrim" aria-hidden="true" />
            <div className="house-side">
              <p className="house-count">
                {i + 1} / {ROOMS.length}
                {i === 0 ? (
                  <span className="house-filmed"> · {FILMED_ON}</span>
                ) : null}
              </p>
              <h2 id={`room-${room.id}`} className="house-word">
                {room.word}
              </h2>
              <p className="house-bold">{room.bold}</p>
              <p className="house-body">{room.body}</p>
              <figure className="house-phone">
                {/* The floating 3D phone takes this spot; see canvas/HousePhone.tsx. */}
                <div className="house-phone-slot" data-phone-slot>
                  <div className="house-phone-device">
                    <Image
                      src={`/jobsite/screens/${room.id}.webp`}
                      alt={room.screenAlt}
                      width={600}
                      height={1298}
                      sizes="(min-width: 900px) 280px, 40vw"
                    />
                  </div>
                </div>
                <figcaption>{EXAMPLE_LABEL}</figcaption>
              </figure>
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
