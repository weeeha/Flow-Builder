import { beforeEach, describe, expect, it } from "vitest";
import { CLIP_LOG_KEY, clipLogCounts, recordClipRun } from "../clip-log";

beforeEach(() => {
  localStorage.clear();
});

describe("the clip validity log", () => {
  it("counts runs by path, keeping stub runs apart so they never inflate the real rate", () => {
    recordClipRun({ path: "first pass", stub: true });
    recordClipRun({ path: "first pass", stub: false });
    recordClipRun({ path: "repaired", stub: false });
    recordClipRun({ path: "fallback", stub: false });
    recordClipRun({ path: "first pass", stub: false });
    expect(clipLogCounts()).toEqual({
      real: { "first pass": 2, repaired: 1, fallback: 1 },
      stub: 1,
      firstPassRate: 0.5,
    });
  });

  it("has no rate before any real run", () => {
    recordClipRun({ path: "first pass", stub: true });
    expect(clipLogCounts().firstPassRate).toBeNull();
  });

  it("stamps each entry and keeps them in localStorage", () => {
    recordClipRun({ path: "repaired", stub: false });
    const [entry] = JSON.parse(localStorage.getItem(CLIP_LOG_KEY)!);
    expect(entry).toMatchObject({ path: "repaired", stub: false });
    expect(typeof entry.at).toBe("string");
  });

  it("starts over from a log it cannot read", () => {
    localStorage.setItem(CLIP_LOG_KEY, "{not json");
    recordClipRun({ path: "fallback", stub: false });
    expect(clipLogCounts().real.fallback).toBe(1);
  });
});
