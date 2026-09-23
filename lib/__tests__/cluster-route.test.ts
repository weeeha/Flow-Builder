import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NoObjectGeneratedError, generateText } from "ai";
import fixture from "../stubs/cluster.json";
import type { ClusterNodeData } from "../types";

// The model call is the one thing a test cannot make for real. Everything else in
// the module, NoObjectGeneratedError included, stays genuine.
vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  generateText: vi.fn(),
}));

import { POST } from "@/app/api/generate/cluster/route";

const [setA, setB] = fixture.sets;
const texts = (groups: { suggestions: { text: string }[] }[]) =>
  groups.flatMap((g) => g.suggestions.map((s) => s.text));

const idle: ClusterNodeData = { status: "idle", prompt: "", groups: [], pinned: [], outputTexts: {} };
const post = (data: Partial<ClusterNodeData>, inputTexts: string[] = []) =>
  POST(
    new Request("http://localhost/api/generate/cluster", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: { ...idle, ...data }, inputs: { texts: inputTexts } }),
    })
  );

const schemaFailure = () =>
  new NoObjectGeneratedError({
    message: "answer did not match the schema",
    text: "{}",
    response: { id: "r1", timestamp: new Date(0), modelId: "test" },
    usage: {} as never,
    finishReason: "stop",
  });

const model = vi.mocked(generateText);

beforeEach(() => {
  model.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/generate/cluster without a key", () => {
  it("rejects an empty prompt with 400 and never calls the model", async () => {
    const res = await post({ prompt: "   " });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Prompt is empty" });
    expect(model).not.toHaveBeenCalled();
  });

  it("serves the first fixture set with ids and stub: true", async () => {
    const res = await post({ prompt: "a lighthouse at dusk" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stub).toBe(true);
    expect(texts(body.groups)).toEqual(texts(setA.groups));
    expect(body.groups.every((g: { id?: string }) => typeof g.id === "string")).toBe(true);
    expect(model).not.toHaveBeenCalled();
  });

  it("rotates to the next fixture set when the node already shows one", async () => {
    const first = await (await post({ prompt: "a lighthouse at dusk" })).json();
    const res = await post({ prompt: "a lighthouse at dusk", groups: first.groups });
    expect(texts((await res.json()).groups)).toEqual(texts(setB.groups));
  });
});

describe("POST /api/generate/cluster with a key", () => {
  beforeEach(() => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
  });

  it("returns the model's groups with ids and stub: false after one call", async () => {
    model.mockResolvedValueOnce({ output: { groups: setB.groups } } as never);
    const res = await post({ prompt: "a lighthouse at dusk" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stub).toBe(false);
    expect(texts(body.groups)).toEqual(texts(setB.groups));
    expect(body.groups[0].suggestions[0].id).toMatch(/^s-/);
    expect(model).toHaveBeenCalledTimes(1);
  });

  it("folds wired text into the prompt it sends", async () => {
    model.mockResolvedValueOnce({ output: { groups: setA.groups } } as never);
    await post({ prompt: "" }, ["a lighthouse at dusk"]);
    const call = model.mock.calls[0][0] as { prompt: string };
    expect(call.prompt).toContain("a lighthouse at dusk");
  });

  it("asks once more when the first answer fails the schema", async () => {
    model.mockRejectedValueOnce(schemaFailure()).mockResolvedValueOnce({ output: { groups: setA.groups } } as never);
    const res = await post({ prompt: "a lighthouse at dusk" });
    expect(res.status).toBe(200);
    expect(model).toHaveBeenCalledTimes(2);
  });

  it("gives up after a second schema failure with a 500 and the error", async () => {
    model.mockRejectedValueOnce(schemaFailure()).mockRejectedValueOnce(schemaFailure());
    const res = await post({ prompt: "a lighthouse at dusk" });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toContain("schema");
    expect(model).toHaveBeenCalledTimes(2);
  });

  it("does not retry any other failure", async () => {
    model.mockRejectedValueOnce(new Error("gateway 401"));
    const res = await post({ prompt: "a lighthouse at dusk" });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("gateway 401");
    expect(model).toHaveBeenCalledTimes(1);
  });
});
