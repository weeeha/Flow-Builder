import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runAll, runSingleNode } from "../executor";
import { useLedger } from "../ledger";
import { initialData } from "../node-kinds";
import { useFlowStore } from "../store";
import type { FlowNode } from "../types";

import { POST } from "@/app/api/generate/video/route";

// The executor's fetch lands on the real video route, in stub mode (no key set).
// `cookie` stands in for the browser's: set it to fail stub jobs on purpose.
let cookie = "";
const fetchSpy = vi.fn(async (url: string, init?: RequestInit): Promise<Response> =>
  POST(new Request(`http://localhost${url}`, { ...init, headers: { ...init?.headers, cookie } }))
);

const video = (id: string): FlowNode =>
  ({
    id,
    type: "video",
    position: { x: 0, y: 0 },
    data: { ...initialData("video"), model: "runway:gen4.5", prompt: "a lighthouse", duration: 4 },
  }) as FlowNode;

beforeEach(() => {
  cookie = "";
  vi.stubEnv("RUNWAYML_API_SECRET", "");
  vi.stubGlobal("fetch", fetchSpy);
  useLedger.setState({ rows: [], open: false, tries: 1 });
  useFlowStore.setState({ nodes: [video("v1"), video("v2")], edges: [] });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("the ledger the executor keeps", () => {
  it("writes one row per job, and says a stub run charged nothing", async () => {
    await runAll();
    const { rows, open } = useLedger.getState();
    expect(open).toBe(true);
    expect(rows.map((r) => [r.nodeId, r.status, r.charge.kind])).toEqual([
      ["v1", "done", "none"],
      ["v2", "done", "none"],
    ]);
    expect(rows[0]).toMatchObject({ provider: "runway", model: "runway:gen4.5" });
  });

  it("records a failed job with its own charge, and Run all stops there", async () => {
    cookie = "flow-stub-fail=1";
    await runAll();
    const { rows } = useLedger.getState();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "failed", charge: { kind: "none" } });
    expect(rows[0].error).toMatch(/Stub failure/);
  });

  it("starts a fresh ledger on Run all, and a single Run adds to it", async () => {
    await runAll();
    await runSingleNode("v1");
    expect(useLedger.getState().rows).toHaveLength(3);
    await runAll();
    expect(useLedger.getState().rows).toHaveLength(2);
  });

  it("writes no row for a node that runs in the browser", async () => {
    useFlowStore.setState({
      nodes: [{ id: "c", type: "composition", position: { x: 0, y: 0 }, data: initialData("composition") } as FlowNode],
    });
    await runAll();
    expect(useLedger.getState().rows).toHaveLength(0);
  });
});
