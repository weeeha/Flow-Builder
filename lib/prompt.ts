/**
 * The prompt a node actually sends: its own prompt, the text wired into it, or both.
 *
 * PROVISIONAL for the "both present" case. Plan task 12 [HAND] is Nick's: he decides
 * whether the wire prefixes, suffixes or replaces the own prompt, and what joins them.
 * Until then both are kept and joined with a single space, own prompt first, which is
 * the order the generation routes already used. Blank strings count as absent.
 */
export function effectivePrompt(wired: string[], own?: string): string {
  return [own, ...wired]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
}
