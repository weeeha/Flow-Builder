import { NextResponse } from "next/server";
import RunwayML, { TaskFailedError, TaskTimedOutError } from "@runwayml/sdk";
import { providerOf, runwayModelId } from "@/lib/models";
import type { VideoNodeData } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Placeholder clip returned when a provider key is missing (stub mode). */
const STUB_URL =
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";

const FAL_MODELS: Partial<Record<VideoNodeData["model"], string>> = {
  "seedance-2.0": "fal-ai/bytedance/seedance/v1/lite/image-to-video",
  "kling-1.6": "fal-ai/kling-video/v1.6/standard/image-to-video",
  "veo-3.1": "fal-ai/veo3/fast",
};

interface GenerateRequest {
  data: VideoNodeData;
  inputs: { texts: string[]; images: string[] };
}

interface GenerateArgs {
  model: VideoNodeData["model"];
  prompt: string;
  duration: VideoNodeData["duration"];
  startImage?: string;
}

export async function POST(req: Request) {
  const { data, inputs } = (await req.json()) as GenerateRequest;
  const args: GenerateArgs = {
    model: data.model,
    prompt: [data.prompt, ...inputs.texts].filter(Boolean).join("\n"),
    duration: data.duration,
    startImage: inputs.images[0],
  };

  try {
    const url =
      providerOf(args.model) === "runway"
        ? await generateWithRunway(args)
        : await generateWithFal(args);
    return NextResponse.json({ url });
  } catch (err) {
    return NextResponse.json({ error: describeError(err) }, { status: 500 });
  }
}

async function generateWithFal({
  model,
  prompt,
  duration,
  startImage,
}: GenerateArgs): Promise<string> {
  const falKey = process.env.FAL_KEY;
  if (!falKey) return STUB_URL;

  const endpoint = FAL_MODELS[model] ?? FAL_MODELS["seedance-2.0"]!;
  const res = await fetch(`https://fal.run/${endpoint}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Key ${falKey}`,
    },
    body: JSON.stringify({
      prompt,
      duration,
      ...(startImage ? { image_url: startImage } : {}),
    }),
  });
  if (!res.ok) throw new Error(`fal ${res.status}: ${await res.text()}`);

  const json = (await res.json()) as { video?: { url: string } };
  if (!json.video?.url) throw new Error("fal returned no video url");
  return json.video.url;
}

/**
 * Runway Dev API. Creates a generation task and blocks on the SDK's poller
 * until it succeeds, fails, or times out. Image-to-video when an image handle
 * is connected, text-to-video otherwise. Each Runway model has its own typed
 * parameter set, so the request is built per model rather than generically.
 */
async function generateWithRunway({
  model,
  prompt,
  duration,
  startImage,
}: GenerateArgs): Promise<string> {
  if (!process.env.RUNWAYML_API_SECRET) return STUB_URL;

  const client = new RunwayML(); // reads RUNWAYML_API_SECRET
  const promptText = prompt.trim().slice(0, 1000);
  const ratio = "1280:720" as const;
  const id = runwayModelId(model);

  const task = (() => {
    if (id === "gen4.5") {
      if (!promptText) throw new Error("Gen-4.5 needs a text prompt");
      const base = { model: "gen4.5" as const, promptText, duration, ratio };
      return startImage
        ? client.imageToVideo.create({ ...base, promptImage: startImage })
        : client.textToVideo.create(base);
    }
    if (id === "seedance2_5") {
      const base = {
        model: "seedance2_5" as const,
        duration,
        ratio,
        ...(promptText ? { promptText } : {}),
      };
      return startImage
        ? client.imageToVideo.create({ ...base, promptImage: startImage })
        : client.textToVideo.create(base);
    }
    throw new Error(`Unknown Runway model: ${id}`);
  })();

  // Stay under the route's 300s cap so a slow task fails cleanly instead of being killed mid-poll.
  const done = await task.waitForTaskOutput({ timeout: 280_000 });
  const url = done.output?.[0];
  if (!url) throw new Error("Runway task succeeded but returned no output");
  return url;
}

function describeError(err: unknown): string {
  if (err instanceof TaskFailedError) {
    const details = (err as { taskDetails?: { failure?: string } }).taskDetails;
    return `Runway task failed: ${details?.failure ?? err.message}`;
  }
  if (err instanceof TaskTimedOutError) {
    return "Runway task timed out. Try a shorter clip or run the node again.";
  }
  return err instanceof Error ? err.message : String(err);
}
