// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const retrieve = vi.fn();
vi.mock("@runwayml/sdk", () => ({
  default: class {
    organization = { retrieve };
  },
}));

const { GET } = await import("@/app/api/balance/route");

const get = (cookie?: string) =>
  new Request("http://localhost/api/balance", { headers: cookie ? { cookie } : {} });

afterEach(() => {
  vi.unstubAllEnvs();
  retrieve.mockReset();
});

describe("GET /api/balance", () => {
  it("says stub with no Runway key, and never calls Runway", async () => {
    vi.stubEnv("RUNWAYML_API_SECRET", "");
    const res = await GET(get());
    expect(await res.json()).toEqual({ mode: "stub" });
    expect(retrieve).not.toHaveBeenCalled();
  });

  it("says stub with a key when the check scripts' cookie is set", async () => {
    vi.stubEnv("RUNWAYML_API_SECRET", "test-runway");
    const res = await GET(get("flow-stub=1"));
    expect(await res.json()).toEqual({ mode: "stub" });
    expect(retrieve).not.toHaveBeenCalled();
  });

  it("returns the organization's credit balance when live", async () => {
    vi.stubEnv("RUNWAYML_API_SECRET", "test-runway");
    retrieve.mockResolvedValue({ creditBalance: 1240, tier: {}, usage: {} });
    const res = await GET(get());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ mode: "live", credits: 1240 });
  });

  it("answers 502 with the reason when Runway refuses", async () => {
    vi.stubEnv("RUNWAYML_API_SECRET", "test-runway");
    retrieve.mockRejectedValue(new Error("401 Unauthorized"));
    const res = await GET(get());
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ mode: "error", error: "401 Unauthorized" });
  });
});
