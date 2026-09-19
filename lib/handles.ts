import { HANDLE_COLORS, type HandleType } from "./types";

export type ParsedHandleId = { nodeId: string; type: HandleType; port?: string };

/**
 * Handle id grammar: `${nodeId}:${handleType}` for a plain handle, or
 * `${nodeId}:${handleType}:${port}` for a named one. Node ids never contain a
 * colon (see `nextId` in lib/store.ts), so the first segment is always the node
 * and anything after the type belongs to the port.
 */
export function handleId(nodeId: string, type: HandleType, port?: string): string {
  return port ? `${nodeId}:${type}:${port}` : `${nodeId}:${type}`;
}

export function parseHandleId(id: string | null | undefined): ParsedHandleId | null {
  if (!id) return null;
  const [nodeId, type, ...rest] = id.split(":");
  if (!nodeId || !type || !Object.hasOwn(HANDLE_COLORS, type)) return null;
  if (rest.length === 0) return { nodeId, type: type as HandleType };
  const port = rest.join(":");
  if (!port) return null;
  return { nodeId, type: type as HandleType, port };
}

/** Connection rule: both handles must parse and share a type. A port never affects validity. */
export function sameHandleType(
  sourceHandle: string | null | undefined,
  targetHandle: string | null | undefined
): boolean {
  const from = parseHandleId(sourceHandle);
  const to = parseHandleId(targetHandle);
  return from !== null && to !== null && from.type === to.type;
}
