import { describe, expect, it } from "vitest";
import { guessAudio, pickThumbnails, sampleTimes } from "../frames";

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
