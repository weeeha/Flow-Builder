import "server-only";
import { DEFAULT_LLM_MODEL } from "./models";
import { wantsStub } from "./stub";

/**
 * Model for every LLM route. The AI SDK resolves a plain string id through the
 * AI Gateway provider, which authenticates with AI_GATEWAY_API_KEY or else the
 * project's Vercel OIDC token, so no provider call is needed.
 */
export const LLM_MODEL = process.env.FLOW_LLM_MODEL ?? DEFAULT_LLM_MODEL;

/**
 * False means stub mode: an LLM route returns its local fixture from lib/stubs/.
 * True when the gateway can authenticate: an API key, or the Vercel OIDC token,
 * which a deployment receives as a request header and `vercel env pull` writes
 * locally (where it lasts 12 hours; pull again when calls start failing).
 * The check scripts' stub cookie turns it off regardless.
 */
export function hasLlmAccess(req: Request): boolean {
  if (wantsStub(req)) return false;
  return Boolean(
    process.env.AI_GATEWAY_API_KEY ||
      process.env.VERCEL_OIDC_TOKEN ||
      req.headers.get("x-vercel-oidc-token")
  );
}
