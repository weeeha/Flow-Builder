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
  duration: number;
  hasAudio: boolean | "unknown";
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
 * Grab n evenly spaced frames as 512px-wide JPEG data URLs. Waits one animation
 * frame after `seeked` before drawing, because Safari can fire it a tick before
 * the frame is paintable.
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
    for (const t of sampleTimes(duration, n)) {
      const seeked = once(video, "seeked");
      video.currentTime = t;
      await seeked;
      await nextFrame();
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const frame = { t, dataUrl: canvas.toDataURL("image/jpeg", JPEG_QUALITY) };
      frames.push(frame);
      onFrame?.(frame, frames.length - 1);
    }

    return {
      frames,
      duration,
      hasAudio: guessAudio(video as HTMLVideoElement & Parameters<typeof guessAudio>[0]),
    };
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}
