import { NextResponse } from "next/server";
import RunwayML from "@runwayml/sdk";
import type { Balance } from "@/lib/balance";
import { wantsStub } from "@/lib/stub";

export const runtime = "nodejs";

/**
 * The Runway credit balance for the Run all readout. With no key, or with the
 * check scripts' stub cookie, it says stub mode instead of calling Runway, the
 * same rule every generation route follows.
 */
export async function GET(req: Request) {
  if (!process.env.RUNWAYML_API_SECRET || wantsStub(req)) {
    return NextResponse.json({ mode: "stub" } satisfies Balance);
  }
  try {
    const org = await new RunwayML().organization.retrieve(); // reads RUNWAYML_API_SECRET
    return NextResponse.json({ mode: "live", credits: org.creditBalance } satisfies Balance);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ mode: "error", error } satisfies Balance, { status: 502 });
  }
}
