// @vitest-environment node
// The Blob SDK refuses to mint a client token where `window` exists, as jsdom's does.
import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/upload/clip/route";

describe("POST /api/upload/clip", () => {
  const tokenRequest = () =>
    POST(
      new Request("http://localhost/api/upload/clip", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "blob.generate-client-token",
          payload: { pathname: "clips/dusk.mp4", callbackUrl: "http://localhost/api/upload/clip", clientPayload: null, multipart: false },
        }),
      })
    );

  afterEach(() => vi.unstubAllEnvs());

  it("answers 501 without a Blob token, so the browser keeps the clip in the page", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    const res = await tokenRequest();
    expect(res.status).toBe(501);
  });

  it("hands out a client token when a Blob token is set", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "vercel_blob_rw_teststore_secret123");
    const res = await tokenRequest();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.type).toBe("blob.generate-client-token");
    expect(body.clientToken).toMatch(/^vercel_blob_client_teststore_/);
  });
});
