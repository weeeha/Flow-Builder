import stub from "./stubs/cluster.json";
import type { ClusterGroup, PinnedSuggestion } from "./types";

/** Up to four pins per cluster, matching the four-groups cap. */
export const MAX_PINS = 4;

/** A group as the model or the fixture returns it, before ids exist. */
export interface RawClusterGroup {
  axis: string;
  wild?: boolean;
  suggestions: { text: string }[];
}

let idCounter = 0;
// Same recipe as nextId in lib/store.ts: no colon, because a suggestion id becomes a handle port.
const newId = (prefix: string) => `${prefix}-${++idCounter}-${Date.now().toString(36)}`;

/** Ids are assigned here, after the schema check, never by the model. */
export function assignIds(groups: RawClusterGroup[]): ClusterGroup[] {
  return groups.map((g) => ({
    id: newId("g"),
    axis: g.axis,
    ...(g.wild ? { wild: true } : {}),
    suggestions: g.suggestions.map((s) => ({ id: newId("s"), text: s.text })),
  }));
}

/**
 * Pin or unpin a suggestion. A pin copies the text, so it survives a re-roll.
 * At the cap a new pin is refused and the same array comes back.
 */
export function togglePin(
  pinned: PinnedSuggestion[],
  suggestion: { id: string; text: string },
  axis: string
): PinnedSuggestion[] {
  if (pinned.some((p) => p.id === suggestion.id)) {
    return pinned.filter((p) => p.id !== suggestion.id);
  }
  if (pinned.length >= MAX_PINS) return pinned;
  return [...pinned, { id: suggestion.id, text: suggestion.text, axis }];
}

/** One text per pin, keyed by the pin id, which is also its handle's port. */
export function toOutputTexts(pinned: PinnedSuggestion[]): Record<string, string> {
  return Object.fromEntries(pinned.map((p) => [p.id, p.text]));
}

/**
 * Merge a fresh roll into the groups on screen. A pinned chip keeps its slot, id and
 * text; every other slot takes the fresh suggestion. A row that holds a pin also keeps
 * its axis and wild flag, and outlives a fresh roll that has no row at its index.
 */
export function rerollGroups(
  current: ClusterGroup[],
  fresh: ClusterGroup[],
  pinned: PinnedSuggestion[]
): ClusterGroup[] {
  const pinnedIds = new Set(pinned.map((p) => p.id));
  const isPinned = (s: { id: string }) => pinnedIds.has(s.id);
  const merged: ClusterGroup[] = [];

  for (let i = 0; i < Math.max(current.length, fresh.length); i++) {
    const was = current[i];
    const now = fresh[i];
    if (!was) {
      merged.push(now);
      continue;
    }
    const holdsPin = was.suggestions.some(isPinned);
    if (!now) {
      if (holdsPin) merged.push({ ...was, suggestions: was.suggestions.filter(isPinned) });
      continue;
    }
    const kept = holdsPin ? was : now;
    merged.push({
      id: was.id,
      axis: kept.axis,
      ...(kept.wild ? { wild: true } : {}),
      suggestions: mergeSuggestions(was, now, isPinned),
    });
  }
  return merged;
}

/** One row's slots after a roll: a pinned chip keeps its slot, every other slot takes the fresh one. */
function mergeSuggestions(
  was: ClusterGroup,
  now: ClusterGroup,
  isPinned: (s: { id: string }) => boolean
): ClusterGroup["suggestions"] {
  return [
    ...now.suggestions.map((s, j) => {
      const old = was.suggestions[j];
      return old && isPinned(old) ? old : s;
    }),
    ...was.suggestions.slice(now.suggestions.length).filter(isPinned),
  ];
}

/**
 * Re-roll one row. That group's unpinned chips take the fresh roll's suggestions at
 * the same index, a pinned chip keeps its slot, id and text, and the row keeps its
 * own id, axis and wild flag. Every other group comes back untouched. An unknown
 * group id, or a fresh roll with no row at that index, hands back the same array.
 */
export function rerollGroup(
  current: ClusterGroup[],
  fresh: ClusterGroup[],
  pinned: PinnedSuggestion[],
  groupId: string
): ClusterGroup[] {
  const i = current.findIndex((g) => g.id === groupId);
  const was = current[i];
  const now = fresh[i];
  if (!was || !now) return current;
  const pinnedIds = new Set(pinned.map((p) => p.id));
  const suggestions = mergeSuggestions(was, now, (s) => pinnedIds.has(s.id));
  return current.map((g, j) => (j === i ? { ...was, suggestions } : g));
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Where a branched node can go: the wanted spot, slid down until it clears every
 * node in its column. One top-to-bottom pass is enough because it only moves down.
 */
export function clearSpot(spot: Box, taken: Box[], gap = 24): { x: number; y: number } {
  let y = spot.y;
  for (const box of [...taken].sort((a, b) => a.y - b.y)) {
    const sameColumn = box.x < spot.x + spot.width && spot.x < box.x + box.width;
    const collides = box.y < y + spot.height + gap && y < box.y + box.height + gap;
    if (sameColumn && collides) y = box.y + box.height + gap;
  }
  return { x: spot.x, y };
}

/**
 * Which fixture set a stub run serves next: the one after the set on screen, judged
 * by shared suggestion texts. Derived from the node's own groups so two cluster
 * nodes never trade sets through a shared counter.
 */
export function nextStubSetIndex(
  current: ClusterGroup[],
  sets: { groups: RawClusterGroup[] }[]
): number {
  const shown = new Set(current.flatMap((g) => g.suggestions.map((s) => s.text)));
  let onScreen = -1;
  let mostHits = 0;
  sets.forEach((set, i) => {
    const hits = set.groups.flatMap((g) => g.suggestions).filter((s) => shown.has(s.text)).length;
    if (hits > mostHits) {
      onScreen = i;
      mostHits = hits;
    }
  });
  return (onScreen + 1) % sets.length;
}

/** The next stub roll for a node, with fresh ids. */
export function nextStubGroups(current: ClusterGroup[]): ClusterGroup[] {
  return assignIds(stub.sets[nextStubSetIndex(current, stub.sets)].groups);
}
