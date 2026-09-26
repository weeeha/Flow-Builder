// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { wantsStub } from "../stub";

import { POST as image } from "@/app/api/generate/image/route";
import { POST as speech } from "@/app/api/generate/speech/route";
import { POST as video } from "@/app/api/generate/video/route";

const post = (route: string, body: unknown, cookie?: string) =>
  new Request(`http://localhost/api/generate/${route}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("wantsStub", () => {
  it("reads flow-stub=1 among other cookies", () => {
    expect(wantsStub(post("image", {}, "a=1; flow-stub=1; b=2"))).toBe(true);
  });

  it("ignores any other value, a lookalike name, or no cookie", () => {
    expect(wantsStub(post("image", {}, "flow-stub=0"))).toBe(false);
    expect(wantsStub(post("image", {}, "no-flow-stub=1"))).toBe(false);
    expect(wantsStub(post("image", {}))).toBe(false);
  });
});

describe("a provider route with its key set and the stub cookie", () => {
  const providers = vi.fn(async () => new Response("should not be called", { status: 500 }));

  it("answers image, video and speech with stubs and never calls a provider", async () => {
    vi.stubEnv("FAL_KEY", "test-fal");
    vi.stubEnv("ELEVENLABS_API_KEY", "test-eleven");
    vi.stubEnv("RUNWAYML_API_SECRET", "test-runway");
    vi.stubGlobal("fetch", providers);
    const cookie = "flow-stub=1";

    const img = await image(post("image", { data: { prompt: "a lighthouse", model: "flux-dev" }, inputs: { texts: [], images: [] } }, cookie));
    const vid = await video(post("video", { data: { prompt: "push in", model: "seedance-2.0", duration: 6 }, inputs: { texts: [], images: [] } }, cookie));
    const tts = await speech(post("speech", { data: { prompt: "The light turns on.", model: "eleven_multilingual_v2", voice: "Rachel" }, inputs: { texts: [] } }, cookie));

    for (const res of [img, vid, tts]) {
      expect(res.status).toBe(200);
      expect((await res.json()).url).toMatch(/^https:\/\//);
    }
    expect(providers).not.toHaveBeenCalled();
  });
});
