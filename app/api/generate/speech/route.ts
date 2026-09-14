import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import type { TTSNodeData } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const VOICE_IDS: Record<string, string> = {
  Rachel: "21m00Tcm4TlvDq8ikWAM",
  Adam: "pNInz6obpgDQGcFmaJgB",
  Alice: "Xb7hH8MSUJpSbSDYk0k2",
  Bella: "EXAVITQu4vr4xnSDxMaL",
  Charlie: "IKne3meq5aSn9XLyUdCD",
  Domi: "AZnzlk1XvdvUeBnXmlld",
};

export async function POST(req: Request) {
  const { data, inputs } = (await req.json()) as {
    data: TTSNodeData;
    inputs: { texts: string[] };
  };
  const text = [data.prompt, ...inputs.texts].filter(Boolean).join(" ");
  if (!text) {
    return NextResponse.json({ error: "Text is empty" }, { status: 400 });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
    });
  }

  const voiceId = VOICE_IDS[data.voice] ?? VOICE_IDS.Rachel;
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "content-type": "application/json",
        accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: data.model,
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    }
  );

  if (!res.ok) {
    return NextResponse.json(
      { error: `elevenlabs ${res.status}: ${await res.text()}` },
      { status: 500 }
    );
  }

  const buf = Buffer.from(await res.arrayBuffer());

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(`tts/${Date.now()}.mp3`, buf, {
      access: "public",
      contentType: "audio/mpeg",
    });
    return NextResponse.json({ url: blob.url });
  }

  const dataUrl = `data:audio/mpeg;base64,${buf.toString("base64")}`;
  return NextResponse.json({ url: dataUrl });
}
