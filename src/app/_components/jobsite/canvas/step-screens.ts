import { DataTexture, SRGBColorSpace, TextureLoader, VideoTexture, type Texture } from "three";
import type { RoomId } from "../story";

/** The clip sizes rendered by scripts/render-marketing.mjs (target "steps"). */
export type ClipWidth = 600 | 420;

export const clipSrc = (id: RoomId, width: ClipWidth) => `/jobsite/screens/${id}-${width}.mp4`;
export const firstFrameSrc = (id: RoomId) => `/jobsite/screens/${id}-first.webp`;
export const lastFrameSrc = (id: RoomId) => `/jobsite/screens/${id}.webp`;

type Clip = {
  video: HTMLVideoElement;
  moving: VideoTexture;
  first: Texture;
  firstReady: boolean;
  last: Texture | null;
  lastReady: boolean;
  hasFrame: boolean;
  /** The browser refused to play it (e.g. iPhone low-power mode). */
  blocked: boolean;
};

/**
 * What the floating phone's screen shows: one clip per step of the job,
 * rendered by Remotion (src/remotion/marketing/step-screen.tsx). A clip
 * loads when its room is next, plays once from the start when you arrive
 * and holds on the result. Until it has a frame the screen shows its first
 * frame as a picture; if the browser won't play it, the finished screen.
 */
export class StepScreens {
  private readonly clips = new Map<RoomId, Clip>();
  private readonly loader = new TextureLoader();
  /** The screen's own near-black, before anything has loaded. */
  readonly blank: DataTexture;

  constructor(
    private readonly width: ClipWidth,
    /** Something new to show (a picture loaded, a clip's first frame arrived). */
    private readonly onChange: () => void,
  ) {
    this.blank = new DataTexture(new Uint8Array([12, 15, 15, 255]), 1, 1);
    this.blank.colorSpace = SRGBColorSpace;
    this.blank.needsUpdate = true;
  }

  private picture(url: string, ready: () => void): Texture {
    const tex = this.loader.load(url, () => {
      ready();
      this.onChange();
    });
    tex.colorSpace = SRGBColorSpace;
    return tex;
  }

  private clip(id: RoomId): Clip {
    const found = this.clips.get(id);
    if (found) return found;
    const video = document.createElement("video");
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute("muted", "");
    video.setAttribute("playsinline", "");
    video.disableRemotePlayback = true;
    video.preload = "auto";
    video.src = clipSrc(id, this.width);
    const moving = new VideoTexture(video);
    moving.colorSpace = SRGBColorSpace;
    const clip: Clip = {
      video,
      moving,
      first: moving,
      firstReady: false,
      last: null,
      lastReady: false,
      hasFrame: false,
      blocked: false,
    };
    clip.first = this.picture(firstFrameSrc(id), () => {
      clip.firstReady = true;
    });
    video.addEventListener("loadeddata", () => {
      clip.hasFrame = true;
      this.onChange();
    });
    this.clips.set(id, clip);
    return clip;
  }

  /** Start fetching a step's clip (its room is the one you're in, or the next). */
  prepare(id: RoomId): void {
    this.clip(id);
  }

  /** Play a step's clip from the start; it holds on its last frame. */
  play(id: RoomId): void {
    const clip = this.clip(id);
    clip.video.currentTime = 0;
    clip.video.play().catch((err: unknown) => {
      // A pause before playback started is fine; a refusal means no autoplay.
      if (!(err instanceof DOMException) || err.name !== "NotAllowedError") return;
      clip.blocked = true;
      clip.last ??= this.picture(lastFrameSrc(id), () => {
        clip.lastReady = true;
      });
      this.onChange();
    });
  }

  pauseAll(): void {
    for (const clip of this.clips.values()) clip.video.pause();
  }

  /** A clip is moving, so the screen needs new frames. */
  get playing(): boolean {
    for (const clip of this.clips.values()) {
      if (!clip.video.paused && !clip.video.ended) return true;
    }
    return false;
  }

  /** The best thing to show for a step right now. */
  texture(id: RoomId): Texture {
    const clip = this.clips.get(id);
    if (!clip) return this.blank;
    if (clip.blocked) {
      if (clip.last && clip.lastReady) return clip.last;
      return clip.firstReady ? clip.first : this.blank;
    }
    if (clip.hasFrame) return clip.moving;
    return clip.firstReady ? clip.first : this.blank;
  }

  dispose(): void {
    for (const clip of this.clips.values()) {
      clip.video.pause();
      clip.video.removeAttribute("src");
      clip.video.load();
      clip.moving.dispose();
      clip.first.dispose();
      clip.last?.dispose();
    }
    this.clips.clear();
    this.blank.dispose();
  }
}
