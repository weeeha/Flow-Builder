import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hasLlmAccess } from "../llm";

const request = (headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/generate/cluster", { method: "POST", headers });

beforeEach(() => {
  vi.stubEnv("AI_GATEWAY_API_KEY", "");
  vi.stubEnv("VERCEL_OIDC_TOKEN", "");
});

afterEach(() => vi.unstubAllEnvs());

describe("hasLlmAccess", () => {
  it("is stub mode with no key and no Vercel token", () => {
    expect(hasLlmAccess(request())).toBe(false);
  });

  it("goes live with a gateway API key", () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
    expect(hasLlmAccess(request())).toBe(true);
  });

  it("goes live locally with the token `vercel env pull` writes", () => {
    vi.stubEnv("VERCEL_OIDC_TOKEN", "pulled-token");
    expect(hasLlmAccess(request())).toBe(true);
  });

  it("goes live on a deployment, where the token arrives as a request header", () => {
    expect(hasLlmAccess(request({ "x-vercel-oidc-token": "runtime-token" }))).toBe(true);
  });
});
