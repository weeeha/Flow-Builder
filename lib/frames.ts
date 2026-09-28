/**
 * Frame sampling for a dropped clip. Browser only: it needs a real <video> and
 * <canvas>, so only `sampleTimes` and `guessAudio` are unit-tested; the grab
 * itself is checked in a rendering browser (a hidden or background tab fakes
 * `seeked` timing).
 */

export interface SampledFrame {
  t: number;
  dataUrl: string;
}

export interface SampledClip {
  frames: SampledFrame[];
  /** The whole clip's length, even when only part of it was read. */
  duration: number;
  /** True when only the first MAX_CLIP_SECONDS were read. */
  trimmed?: boolean;
  hasAudio: boolean | "unknown";
}

/** The longest stretch read from a clip; a longer one is read from its start. */
export const MAX_CLIP_SECONDS = 60;

/** How much of a clip gets sampled. */
export function sampledSpan(duration: number): number {
  return Math.min(duration, MAX_CLIP_SECONDS);
}

/** Frames sampled per clip, all of which go to the analysis. */
export const FRAME_COUNT = 8;

/** Seeking to exactly `duration` can land past the last decodable frame. */
const END_MARGIN = 0.05;
const FRAME_WIDTH = 512;
const JPEG_QUALITY = 0.7;

/** n timestamps spread evenly over the clip, first and last included. */
export function sampleTimes(duration: number, n: number): number[] {
  const end = Math.max(0, duration - END_MARGIN);
  if (n <= 1) return [0];
  return Array.from({ length: n }, (_, i) => (end * i) / (n - 1));
}

/**
 * The frames worth keeping on the node, spread from first to last. All eight go
 * to the analysis; only these persist, since every saved frame lands in
 * localStorage (about 13KB each) and several clips would reach its limit.
 */
export function pickThumbnails(frames: SampledFrame[], n: number): SampledFrame[] {
  if (frames.length <= n) return frames;
  return Array.from({ length: n }, (_, i) => frames[Math.round((i * (frames.length - 1)) / (n - 1))]);
}

/**
 * Whether the clip has sound. No property is standard on both engines: Safari
 * lists tracks, Chrome counts decoded bytes. Zero decoded bytes proves nothing,
 * since a muted seek may never decode audio, so it reads as unknown.
 */
export function guessAudio(video: {
  audioTracks?: { length: number };
  webkitAudioDecodedByteCount?: number;
}): boolean | "unknown" {
  if (video.audioTracks) return video.audioTracks.length > 0;
  if (video.webkitAudioDecodedByteCount) return true;
  return "unknown";
}

function once(target: EventTarget, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => {
      target.removeEventListener(event, done);
      target.removeEventListener("error", fail);
      resolve();
    };
    const fail = () => {
      target.removeEventListener(event, done);
      target.removeEventListener("error", fail);
      reject(new Error("Could not read this file as a video"));
    };
    target.addEventListener(event, done);
    target.addEventListener("error", fail);
  });
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/**
 * How long to wait after `seeked` for the seek's frame to be presented before
 * drawing anyway. Safari presents it 1-15ms after `seeked`; this only bounds a
 * seek that never shows a new frame.
 */
export const FRAME_WAIT_MS = 500;

/**
 * Seek to `t` and resolve once its frame can be drawn. Safari can fire `seeked`
 * while the video still shows the previous seek's picture, long enough that a
 * draw one animation frame later copies a stale frame (seen on a cold first run:
 * the 4.25s frame came out as 3.375s). requestVideoFrameCallback fires when the
 * new frame is presented; it is registered before seeking, since an engine may
 * present before `seeked`. Engines without it get one animation frame.
 */
export async function seekFrame(video: HTMLVideoElement, t: number): Promise<void> {
  const seeked = once(video, "seeked");
  if (typeof video.requestVideoFrameCallback !== "function") {
    video.currentTime = t;
    await seeked;
    await nextFrame();
    return;
  }
  let id = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const presented = new Promise<void>((resolve) => {
    id = video.requestVideoFrameCallback(() => resolve());
  });
  try {
    video.currentTime = t;
    await seeked;
    await Promise.race([presented, new Promise<void>((resolve) => (timer = setTimeout(resolve, FRAME_WAIT_MS)))]);
  } finally {
    clearTimeout(timer);
    video.cancelVideoFrameCallback(id);
  }
}

/**
 * Grab n evenly spaced frames as 512px-wide JPEG data URLs. Each is drawn only
 * once `seekFrame` sees it presented, because Safari can fire `seeked` early.
 */
export async function sampleFrames(
  file: Blob,
  n = FRAME_COUNT,
  onFrame?: (frame: SampledFrame, index: number) => void
): Promise<SampledClip> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  try {
    const loaded = once(video, "loadeddata");
    video.src = url;
    await loaded;

    const duration = video.duration;
    const scale = FRAME_WIDTH / video.videoWidth;
    const canvas = document.createElement("canvas");
    canvas.width = FRAME_WIDTH;
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is unavailable");

    const frames: SampledFrame[] = [];
    for (const t of sampleTimes(sampledSpan(duration), n)) {
      await seekFrame(video, t);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const frame = { t, dataUrl: canvas.toDataURL("image/jpeg", JPEG_QUALITY) };
      frames.push(frame);
      onFrame?.(frame, frames.length - 1);
    }

    return {
      frames,
      duration,
      trimmed: duration > MAX_CLIP_SECONDS,
      hasAudio: guessAudio(video as HTMLVideoElement & Parameters<typeof guessAudio>[0]),
    };
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}
