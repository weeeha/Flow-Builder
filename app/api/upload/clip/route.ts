import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Only a clip's first minute is read, but a minute of 4K still runs to hundreds of MB. */
const MAX_CLIP_BYTES = 500 * 1024 * 1024;

/**
 * Issues the token a browser needs to upload a dropped clip to Blob storage
 * itself, so the clip never passes through this function. Without
 * BLOB_READ_WRITE_TOKEN it answers 501 and the clip stays in the page.
 */
export async function POST(req: Request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "Uploads are off: BLOB_READ_WRITE_TOKEN is not set" }, { status: 501 });
  }

  try {
    const result = await handleUpload({
      body: (await req.json()) as HandleUploadBody,
      request: req,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ["video/*"],
        maximumSizeInBytes: MAX_CLIP_BYTES,
        addRandomSuffix: true,
      }),
      // upload() already resolves with the URL in the browser; nothing to record here.
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
