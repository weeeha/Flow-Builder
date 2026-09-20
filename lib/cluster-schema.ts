import { z } from "zod";

/**
 * The shape the model (or the stub fixture) returns, before ids exist. Ids are
 * assigned after this check, never by the model. Kept apart from lib/cluster.ts
 * so the client bundle, which only needs the pure helpers, does not pull in zod.
 */
const Suggestion = z.object({
  text: z.string().refine((s) => s.trim().split(/\s+/).length <= 25, "25 words max"),
});

const Group = z.object({
  axis: z.string().min(1),
  wild: z.boolean().optional(),
  suggestions: z.array(Suggestion).length(3),
});

export const ClusterResponse = z
  .object({ groups: z.array(Group).min(3).max(4) })
  .refine((r) => r.groups.filter((g) => g.wild).length === 1, "exactly one wild group");

export type ClusterResponseData = z.infer<typeof ClusterResponse>;
