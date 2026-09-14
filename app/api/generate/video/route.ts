import { NextResponse } from "next/server";
import type { VideoNodeData } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const FAL_MODELS: Record<VideoNodeData["model"], string> = {
  "seedance-2.0": "fal-ai/bytedance/seedance/v1/lite/image-to-video",
  "kling-1.6": "fal-ai/kling-video/v1.6/standard/image-to-video",
  "veo-3.1": "fal-ai/veo3/fast",
};

export async function POST(req: Request) {
  const { data, inputs } = (await req.json()) as {
    data: VideoNodeData;
    inputs: { texts: string[]; images: string[] };
  };

  const prompt = [data.prompt, ...inputs.texts].filter(Boolean).join("\n");
  const startImage = inputs.images[0];

  const falKey = process.env.FAL_KEY;
  if (!falKey) {
    return NextResponse.json({
      url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    });
  }

  const model = FAL_MODELS[data.model] ?? FAL_MODELS["seedance-2.0"];
  const res = await fetch(`https://fal.run/${model}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Key ${falKey}`,
    },
    body: JSON.stringify({
      prompt,
      duration: data.duration,
      ...(startImage ? { image_url: startImage } : {}),
    }),
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: `fal ${res.status}: ${await res.text()}` },
      { status: 500 }
    );
  }
  const json = (await res.json()) as { video: { url: string } };
  return NextResponse.json({ url: json.video?.url });
}
