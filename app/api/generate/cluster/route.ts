import { NextResponse } from "next/server";
import { NoObjectGeneratedError, Output, generateText } from "ai";
import { assignIds, nextStubGroups } from "@/lib/cluster";
import { ClusterResponse } from "@/lib/cluster-schema";
import { LLM_MODEL, hasLlmKey } from "@/lib/llm";
import type { ClusterGroup, ClusterNodeData } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Long enough for the skeleton chips to read as loading when the fixture answers. */
const STUB_ROLL_MS = 600;

export async function POST(req: Request) {
  const { data, inputs } = (await req.json()) as {
    data: ClusterNodeData;
    inputs: { texts: string[] };
  };

  const seed = [data.prompt, ...inputs.texts].filter(Boolean).join("\n").trim();
  if (!seed) {
    return NextResponse.json({ error: "Prompt is empty" }, { status: 400 });
  }

  // Stub mode: the fixture's next set, through the same rotation the thin slice used.
  if (!hasLlmKey()) {
    await new Promise((resolve) => setTimeout(resolve, STUB_ROLL_MS));
    return NextResponse.json({ groups: nextStubGroups(data.groups ?? []), stub: true });
  }

  try {
    return NextResponse.json({ groups: await roll(seed), stub: false });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

/**
 * One model call, and one more if the answer fails the schema. Ids are assigned
 * here, after the schema check, never by the model.
 */
async function roll(seed: string): Promise<ClusterGroup[]> {
  for (let attempt = 1; ; attempt++) {
    try {
      const { output } = await generateText({
        model: LLM_MODEL,
        output: Output.object({ schema: ClusterResponse }),
        prompt: instructions(seed),
      });
      return assignIds(output.groups);
    } catch (err) {
      if (attempt === 1 && NoObjectGeneratedError.isInstance(err)) continue;
      throw err;
    }
  }
}

function instructions(seed: string): string {
  return [
    "You turn one loose idea for an image or video into grouped concept suggestions.",
    `Idea: ${seed}`,
    "Return 3 or 4 groups. Each group varies exactly one axis, such as camera, era, weather or material, and holds exactly 3 suggestions.",
    "Each suggestion is a self-contained prompt of at most 25 words that keeps the idea's subject.",
    'Mark exactly one group "wild": true and make that group deliberately surprising.',
    "Never repeat a suggestion.",
  ].join("\n");
}
