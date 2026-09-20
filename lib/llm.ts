import "server-only";
import { DEFAULT_LLM_MODEL } from "./models";

/**
 * Model for every LLM route. The AI SDK resolves a plain string id through the
 * AI Gateway provider, which reads AI_GATEWAY_API_KEY, so no provider call is needed.
 */
export const LLM_MODEL = process.env.FLOW_LLM_MODEL ?? DEFAULT_LLM_MODEL;

/** False means stub mode: an LLM route returns its local fixture from lib/stubs/. */
export function hasLlmKey(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY);
}
