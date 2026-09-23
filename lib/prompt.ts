/**
 * The prompt a node actually sends: its own prompt, the text wired into it, or both.
 * With both, the own prompt comes first and the wired text follows, joined by a single
 * space, the order the generation routes already used (Nick, plan task 12, 2026-09-23).
 * Blank strings count as absent.
 */
export function effectivePrompt(wired: string[], own?: string): string {
  return [own, ...wired]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
}
