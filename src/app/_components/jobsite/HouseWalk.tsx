"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { ArrowUpRight, Check } from "@phosphor-icons/react";
import { walkAt } from "./house-walk";
import { useSiteLevel } from "./site-level";
import { COMING_SOON, EXAMPLE_LABEL, FEATURES, FILMED_ON, ROOMS, T2QCAL_STOP, type Room } from "./story";

/**
 * Inside the house: after the dive into the phone, one of the owner's
 * builds, one room per step of the job (Talk → Draft → Check → Send →
 * Invoice). Each room holds while you scroll, its walkthrough clip plays
 * once as you arrive, and the next room fades in over it as you step
 * forward. Invoice is the finished home. The walk carries on with "More in
 * the app" (the QR code on the van, supplier quotes, hours) and
 * T2QCAL, then a note on what's coming to the iPhone app.
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

/** The phone's spot beside the words; `clip` names its screen (public/jobsite/screens). */
function PhoneFigure({ clip, alt }: { clip: string; alt: string }) {
  return (
    <figure className="house-phone">
      {/* The floating 3D phone takes this spot; see canvas/HousePhone.tsx. */}
      <div className="house-phone-slot" data-phone-slot>
        <div className="house-phone-device">
          <Image src={`/jobsite/screens/${clip}.webp`} alt={alt} width={600} height={1298} sizes="(min-width: 900px) 280px, 40vw" />
        </div>
      </div>
      <figcaption>{EXAMPLE_LABEL}</figcaption>
    </figure>
  );
}

function RoomFootage({
  room,
  level,
}: {
  room: Room;
  level: "full" | "lite" | "still";
}) {
  if (room.media.kind === "photo") {
    return (
      <Image
        src={room.media.src}
        alt={room.media.alt}
        fill
        sizes="100vw"
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
        sizes="100vw"
        className="house-still"
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

export function HouseWalk({ nativeShell }: { nativeShell: boolean }) {
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
          data-clip={room.id}
          className="house-room"
          aria-labelledby={`room-${room.id}`}
        >
          <div className="house-pin">
            <div className="house-footage">
              <RoomFootage room={room} level={level} />
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
              <PhoneFigure clip={room.id} alt={room.screenAlt} />
            </div>
          </div>
        </section>
      ))}

      {FEATURES.map((feature, i) => (
        <section
          key={feature.id}
          id={feature.id}
          data-room={feature.id}
          data-clip={feature.id}
          // The step links (Talk … Invoice) stop here.
          data-steps-end={i === 0 ? "" : undefined}
          className="house-room house-room--feature"
          aria-labelledby={`room-${feature.id}`}
        >
          <div className="house-pin">
            <div className="house-stage" aria-hidden="true" />
            <div className="house-side">
              <p className="house-count">
                More in the app · {i + 1} / {FEATURES.length}
              </p>
              <h2 id={`room-${feature.id}`} className="house-word">
                {feature.word}
              </h2>
              <p className="house-bold">{feature.bold}</p>
              <p className="house-body">{feature.body}</p>
              <PhoneFigure clip={feature.id} alt={feature.screenAlt} />
            </div>
          </div>
        </section>
      ))}

      <section
        id={T2QCAL_STOP.id}
        data-room={T2QCAL_STOP.id}
        data-clip={T2QCAL_STOP.id}
        className="house-room house-room--t2qcal"
        aria-labelledby="room-t2qcal"
      >
        <div className="house-pin">
          <div className="house-stage house-stage--grid" aria-hidden="true" />
          <div className="house-side">
            <p className="house-count">{T2QCAL_STOP.eyebrow}</p>
            <h2 id="room-t2qcal" className="house-word">
              {T2QCAL_STOP.word}
            </h2>
            <p className="house-bold">{T2QCAL_STOP.bold}</p>
            <div className="house-body">
              <p>{T2QCAL_STOP.body}</p>
              <ul className="house-inside" aria-label="Inside T2QCAL">
                {T2QCAL_STOP.inside.map((item) => (
                  <li key={item}>
                    <Check size={14} weight="bold" aria-hidden="true" /> {item}
                  </li>
                ))}
              </ul>
              {nativeShell ? null : (
                <>
                  <p className="house-note">{T2QCAL_STOP.availability}</p>
                  <Link href="/t2qcal" className="house-link">
                    {T2QCAL_STOP.link} <ArrowUpRight size={16} weight="bold" aria-hidden="true" />
                  </Link>
                </>
              )}
            </div>
            <PhoneFigure clip={T2QCAL_STOP.id} alt={T2QCAL_STOP.screenAlt} />
          </div>
        </div>
      </section>

      <aside className="house-soon" aria-labelledby="soon-title">
        <p className="house-soon-tag">{COMING_SOON.tag}</p>
        <h3 id="soon-title" className="house-soon-title">
          {COMING_SOON.title}
        </h3>
        <p className="house-soon-body">{COMING_SOON.body}</p>
      </aside>
    </div>
  );
}
