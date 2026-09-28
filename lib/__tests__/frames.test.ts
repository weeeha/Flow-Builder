import { afterEach, describe, expect, it, vi } from "vitest";
import { FRAME_WAIT_MS, MAX_CLIP_SECONDS, guessAudio, pickThumbnails, sampleTimes, sampledSpan, seekFrame } from "../frames";

describe("sampleTimes", () => {
  it("spreads n timestamps evenly from the first frame to just before the end", () => {
    const times = sampleTimes(7, 8);
    expect(times).toHaveLength(8);
    expect(times[0]).toBe(0);
    expect(times[1]).toBeCloseTo(0.9929, 3);
    // Seeking to exactly `duration` lands past the last decodable frame on some
    // files, so the last sample sits a hair before it.
    expect(times[7]).toBeCloseTo(6.95, 5);
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThan(times[i - 1]);
  });

  it("samples a clip too short to spread from its start, once per slot", () => {
    expect(sampleTimes(0.02, 3)).toEqual([0, 0, 0]);
  });

  it("returns one frame at the start when asked for one", () => {
    expect(sampleTimes(10, 1)).toEqual([0]);
  });
});

describe("guessAudio", () => {
  it("trusts an audio track list when the engine has one", () => {
    expect(guessAudio({ audioTracks: { length: 1 } })).toBe(true);
    expect(guessAudio({ audioTracks: { length: 0 } })).toBe(false);
  });

  it("reads decoded audio bytes when there is no track list", () => {
    expect(guessAudio({ webkitAudioDecodedByteCount: 4096 })).toBe(true);
  });

  it("says unknown when nothing has decoded yet, since a muted seek may skip audio", () => {
    expect(guessAudio({ webkitAudioDecodedByteCount: 0 })).toBe("unknown");
  });

  it("says unknown when the engine exposes neither", () => {
    expect(guessAudio({})).toBe("unknown");
  });
});

describe("pickThumbnails", () => {
  const frames = Array.from({ length: 8 }, (_, i) => ({ t: i, dataUrl: `frame-${i}` }));

  it("keeps the first, middle and last of eight frames", () => {
    expect(pickThumbnails(frames, 3).map((f) => f.t)).toEqual([0, 4, 7]);
  });

  it("keeps every frame when there are no more than asked for", () => {
    expect(pickThumbnails(frames.slice(0, 2), 3)).toEqual(frames.slice(0, 2));
  });
});

describe("sampledSpan", () => {
  it("reads a clip up to a minute whole", () => {
    expect(sampledSpan(42)).toBe(42);
  });

  it("reads only the first minute of a longer clip", () => {
    expect(MAX_CLIP_SECONDS).toBe(60);
    expect(sampledSpan(130)).toBe(60);
  });
});

/** A paused <video> whose seeks and presented frames the test drives by hand. */
class FakeVideo extends EventTarget {
  seeks: number[] = [];
  cancelled: number[] = [];
  private callbacks = new Map<number, VideoFrameRequestCallback>();
  private nextId = 1;
  set currentTime(t: number) {
    this.seeks.push(t);
  }
  requestVideoFrameCallback(cb: VideoFrameRequestCallback) {
    this.callbacks.set(this.nextId, cb);
    return this.nextId++;
  }
  cancelVideoFrameCallback(id: number) {
    this.callbacks.delete(id);
    this.cancelled.push(id);
  }
  seeked() {
    this.dispatchEvent(new Event("seeked"));
  }
  present(mediaTime: number) {
    const due = [...this.callbacks.values()];
    this.callbacks.clear();
    for (const cb of due) cb(0, { mediaTime } as VideoFrameCallbackMetadata);
  }
}

function track(promise: Promise<void>) {
  const state = { settled: false };
  promise.then(() => (state.settled = true));
  return state;
}
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("seekFrame", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("waits past `seeked` until the new frame is presented, since Safari fires it early", async () => {
    const video = new FakeVideo();
    const state = track(seekFrame(video as unknown as HTMLVideoElement, 4.25));
    expect(video.seeks).toEqual([4.25]);
    video.seeked();
    await flush();
    // Safari has fired seeked but still shows the previous seek's picture.
    expect(state.settled).toBe(false);
    video.present(4.25);
    await flush();
    expect(state.settled).toBe(true);
  });

  it("counts a frame presented before `seeked` fires", async () => {
    const video = new FakeVideo();
    const state = track(seekFrame(video as unknown as HTMLVideoElement, 1.7));
    video.present(1.6667);
    await flush();
    expect(state.settled).toBe(false);
    video.seeked();
    await flush();
    expect(state.settled).toBe(true);
  });

  it("gives up waiting after FRAME_WAIT_MS and drops the pending callback", async () => {
    vi.useFakeTimers();
    const video = new FakeVideo();
    const state = track(seekFrame(video as unknown as HTMLVideoElement, 0));
    video.seeked();
    await vi.advanceTimersByTimeAsync(FRAME_WAIT_MS - 1);
    expect(state.settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(state.settled).toBe(true);
    expect(video.cancelled).toEqual([1]);
  });

  it("falls back to one animation frame after `seeked` without requestVideoFrameCallback", async () => {
    const raf = vi.fn((cb: FrameRequestCallback) => (setTimeout(() => cb(0), 0), 1));
    vi.stubGlobal("requestAnimationFrame", raf);
    const video = new FakeVideo() as FakeVideo & { requestVideoFrameCallback?: unknown };
    Object.defineProperty(video, "requestVideoFrameCallback", { value: undefined });
    const state = track(seekFrame(video as unknown as HTMLVideoElement, 2.55));
    await flush();
    expect(raf).not.toHaveBeenCalled();
    video.seeked();
    await flush();
    await flush();
    expect(raf).toHaveBeenCalledTimes(1);
    expect(state.settled).toBe(true);
  });

  it("rejects when the video errors mid-seek", async () => {
    const video = new FakeVideo();
    const result = seekFrame(video as unknown as HTMLVideoElement, 3.4);
    video.dispatchEvent(new Event("error"));
    await expect(result).rejects.toThrow("Could not read this file as a video");
  });
});
