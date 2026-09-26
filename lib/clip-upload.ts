import { upload } from "@vercel/blob/client";
import type { FlowNode } from "./types";

/** The route that hands the browser a one-off Blob upload token. */
export const CLIP_UPLOAD_ROUTE = "/api/upload/clip";

/** Past this, the SDK splits the upload into parts and retries each one. */
const MULTIPART_BYTES = 32 * 1024 * 1024;

/**
 * Put a dropped clip in Blob storage so it outlives the page, straight from the
 * browser. Null when it cannot: uploads are off (no BLOB_READ_WRITE_TOKEN, the
 * route answers 501) or the upload failed. The clip then stays a session-only
 * object URL, which a reload marks missing.
 */
export async function uploadClip(file: File): Promise<string | null> {
  try {
    const blob = await upload(`clips/${file.name}`, file, {
      access: "public",
      handleUploadUrl: CLIP_UPLOAD_ROUTE,
      contentType: file.type,
      multipart: file.size > MULTIPART_BYTES,
    });
    return blob.url;
  } catch (err) {
    console.warn(`Clip kept for this session only: ${(err as Error).message}`);
    return null;
  }
}

/** Object URLs die with the page that made them. */
const isSessionOnly = (url?: string) => url?.startsWith("blob:") ?? false;

/**
 * After a reload, a reference card whose clip was never uploaded keeps its
 * frames, breakdown and graph, but the clip itself is gone. Clear the dead URL
 * so nothing downstream is handed it, and flag the card.
 */
export function markLostClips(nodes: FlowNode[]): FlowNode[] {
  return nodes.map((node) =>
    node.type === "reference" && isSessionOnly(node.data.clipUrl)
      ? { ...node, data: { ...node.data, clipUrl: undefined, outputUrl: undefined, clipMissing: true } }
      : node
  );
}
