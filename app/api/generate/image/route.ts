import { NextResponse } from "next/server";
import type { ImageNodeData } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const FAL_MODELS: Record<ImageNodeData["model"], string> = {
  "flux-dev": "fal-ai/flux/dev",
  "flux-schnell": "fal-ai/flux/schnell",
  "nano-banana": "fal-ai/nano-banana",
};

export async function POST(req: Request) {
  const { data, inputs } = (await req.json()) as {
    data: ImageNodeData;
    inputs: { texts: string[]; images: string[] };
  };

  const prompt = [data.prompt, ...inputs.texts].filter(Boolean).join("\n");
  if (!prompt) {
    return NextResponse.json({ error: "Prompt is empty" }, { status: 400 });
  }

  const falKey = process.env.FAL_KEY;
  if (!falKey) {
    const seed = encodeURIComponent(prompt.slice(0, 60));
    return NextResponse.json({
      url: `https://placehold.co/800x450/e5e7eb/64748b?text=${seed}`,
    });
  }

  const model = FAL_MODELS[data.model] ?? FAL_MODELS["flux-dev"];
  const res = await fetch(`https://fal.run/${model}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Key ${falKey}`,
    },
    body: JSON.stringify({
      prompt,
      image_size: "landscape_16_9",
      num_images: 1,
      ...(inputs.images[0] ? { image_url: inputs.images[0] } : {}),
    }),
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: `fal ${res.status}: ${await res.text()}` },
      { status: 500 }
    );
  }
  const json = (await res.json()) as { images: { url: string }[] };
  return NextResponse.json({ url: json.images[0]?.url });
}
