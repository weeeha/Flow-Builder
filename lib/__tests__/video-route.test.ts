// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

// One fake task per test: what waitForTaskOutput resolves to, or throws.
const outcome = vi.fn();
const create = vi.fn(() => ({ waitForTaskOutput: () => outcome() }));

class TaskFailedError extends Error {
  constructor(readonly taskDetails: unknown) {
    super("Task failed");
  }
}
class TaskTimedOutError extends Error {
  constructor(readonly taskDetails: unknown) {
    super("Task timed out");
  }
}

vi.mock("@runwayml/sdk", () => ({
  default: class {
    textToVideo = { create };
    imageToVideo = { create };
  },
  TaskFailedError,
  TaskTimedOutError,
}));

const { POST } = await import("@/app/api/generate/video/route");

const post = (model: string, prompt: string, cookie?: string) =>
  POST(
    new Request("http://localhost/api/generate/video", {
      method: "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify({ data: { model, prompt, duration: 4 }, inputs: { texts: [], images: [] } }),
    })
  );

afterEach(() => {
  vi.unstubAllEnvs();
  outcome.mockReset();
  create.mockClear();
});

describe("POST /api/generate/video receipts", () => {
  it("says stub with no key, and never calls Runway", async () => {
    vi.stubEnv("RUNWAYML_API_SECRET", "");
    const res = await post("runway:gen4.5", "a lighthouse");
    expect(await res.json()).toMatchObject({ stub: true });
    expect(create).not.toHaveBeenCalled();
  });

  it("fails a stub job on purpose only when the opt-in cookie is set", async () => {
    vi.stubEnv("RUNWAYML_API_SECRET", "");
    const res = await post("runway:gen4.5", "a lighthouse", "flow-stub-fail=1");
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ stub: true });
  });

  it("returns the cost Runway reported with the clip", async () => {
    vi.stubEnv("RUNWAYML_API_SECRET", "test-runway");
    outcome.mockResolvedValue({ id: "t", status: "SUCCEEDED", output: ["https://x.test/a.mp4"], cost: { credits: 48 } });
    const res = await post("runway:gen4.5", "a lighthouse");
    expect(await res.json()).toEqual({ url: "https://x.test/a.mp4", stub: false, cost: 48 });
  });

  it("sends a failed task's reported cost in the error body", async () => {
    vi.stubEnv("RUNWAYML_API_SECRET", "test-runway");
    outcome.mockRejectedValue(new TaskFailedError({ status: "FAILED", failure: "moderation", cost: { credits: 0 } }));
    const res = await post("runway:gen4.5", "a lighthouse");
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ stub: false, cost: 0, error: "Runway task failed: moderation" });
  });

  it("marks a timeout as cost missing, not as a refund", async () => {
    vi.stubEnv("RUNWAYML_API_SECRET", "test-runway");
    outcome.mockRejectedValue(new TaskTimedOutError({ status: "RUNNING" }));
    const body = await (await post("runway:gen4.5", "a lighthouse")).json();
    expect(body).toMatchObject({ stub: false, costMissing: "timed-out" });
    expect(body).not.toHaveProperty("cost");
  });

  it("refuses an empty Gen-4.5 prompt itself, before calling Runway", async () => {
    vi.stubEnv("RUNWAYML_API_SECRET", "test-runway");
    const body = await (await post("runway:gen4.5", "")).json();
    expect(body).toMatchObject({ stub: false, refused: true });
    expect(create).not.toHaveBeenCalled();
  });
});
