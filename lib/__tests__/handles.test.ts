import { describe, expect, it } from "vitest";
import { handleId, parseHandleId, sameHandleType } from "../handles";

describe("parseHandleId", () => {
  it("parses a plain id", () => {
    expect(parseHandleId("image-1-mfx2k1:image")).toEqual({
      nodeId: "image-1-mfx2k1",
      type: "image",
    });
  });

  it("parses a ported id", () => {
    expect(parseHandleId("cluster-2-mfx2k9:text:s4mfx2ka")).toEqual({
      nodeId: "cluster-2-mfx2k9",
      type: "text",
      port: "s4mfx2ka",
    });
  });

  it("leaves port undefined on a plain id", () => {
    expect(parseHandleId("tts-3-mfx2k1:audio")?.port).toBeUndefined();
  });

  it("treats everything after the type as the port", () => {
    // A node id can never contain a colon, so extra segments can only belong to the port.
    expect(parseHandleId("cluster-2-mfx2k9:text:a:b")).toEqual({
      nodeId: "cluster-2-mfx2k9",
      type: "text",
      port: "a:b",
    });
  });

  it.each([
    ["an empty string", ""],
    ["a bare node id", "image-1-mfx2k1"],
    ["an unknown handle type", "image-1-mfx2k1:depth"],
    ["an empty node id", ":text"],
    ["an empty port", "cluster-2-mfx2k9:text:"],
    ["an inherited object key as the type", "image-1-mfx2k1:toString"],
  ])("returns null for %s", (_label, id) => {
    expect(parseHandleId(id)).toBeNull();
  });

  it("returns null for a missing handle", () => {
    expect(parseHandleId(null)).toBeNull();
    expect(parseHandleId(undefined)).toBeNull();
  });
});

describe("handleId", () => {
  it("builds a plain id", () => {
    expect(handleId("image-1-mfx2k1", "text")).toBe("image-1-mfx2k1:text");
  });

  it("builds a ported id", () => {
    expect(handleId("cluster-2-mfx2k9", "text", "s4mfx2ka")).toBe(
      "cluster-2-mfx2k9:text:s4mfx2ka"
    );
  });

  it("round-trips through parseHandleId", () => {
    expect(parseHandleId(handleId("cluster-2-mfx2k9", "text", "s4mfx2ka"))).toEqual({
      nodeId: "cluster-2-mfx2k9",
      type: "text",
      port: "s4mfx2ka",
    });
  });
});

describe("sameHandleType", () => {
  it("accepts matching types", () => {
    expect(sameHandleType("image-1-a:image", "video-2-b:image")).toBe(true);
  });

  it("rejects mismatched types", () => {
    expect(sameHandleType("image-1-a:image", "video-2-b:text")).toBe(false);
  });

  it("ignores the port: a ported text source fits a plain text target", () => {
    expect(sameHandleType("cluster-2-c:text:s4", "image-1-a:text")).toBe(true);
  });

  it("rejects a connection when either handle is malformed", () => {
    expect(sameHandleType("cluster-2-c", "image-1-a:text")).toBe(false);
    expect(sameHandleType(null, null)).toBe(false);
  });
});
