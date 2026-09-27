import { migrate } from "./format";
import { listFlows, saveFlow } from "./repo";

/** Where every version before flow documents kept its one flow. Never deleted. */
export const LEGACY_KEY = "flow-builder-state";
export const LEGACY_FLAG = "flow-builder-legacy-imported";

/**
 * Carry the pre-documents flow over once, as "Untitled flow". Only into an empty
 * repository, only when it has nodes, and only once per browser. The old key
 * stays as a backup.
 */
export async function importLegacyFlow(): Promise<string | null> {
  if (localStorage.getItem(LEGACY_FLAG)) return null;
  const raw = localStorage.getItem(LEGACY_KEY);
  if (!raw || (await listFlows()).length > 0) return null;
  try {
    const file = migrate(JSON.parse(raw));
    if (file.nodes.length === 0) return null;
    const saved = await saveFlow(file);
    localStorage.setItem(LEGACY_FLAG, "1");
    return saved.id;
  } catch (err) {
    console.warn(`Saved flow from an older version could not be read: ${(err as Error).message}`);
    return null;
  }
}
