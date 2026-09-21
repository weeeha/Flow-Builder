import { describe, expect, it } from "vitest";
import {
  MAX_PINS,
  assignIds,
  clearSpot,
  nextStubSetIndex,
  rerollGroup,
  rerollGroups,
  toOutputTexts,
  togglePin,
} from "../cluster";
import fixture from "../stubs/cluster.json";
import type { ClusterGroup, PinnedSuggestion } from "../types";

const [setA, setB] = fixture.sets;
const ids = (groups: ClusterGroup[]) => groups.flatMap((g) => g.suggestions.map((s) => s.id));
const pinOf = (groups: ClusterGroup[], g: number, s: number): PinnedSuggestion => ({
  ...groups[g].suggestions[s],
  axis: groups[g].axis,
});

describe("assignIds", () => {
  it("gives every group and suggestion a unique id and keeps text, axis and wild", () => {
    const groups = assignIds(setA.groups);
    const all = [...groups.map((g) => g.id), ...ids(groups)];
    expect(new Set(all).size).toBe(all.length);
    expect(groups.map((g) => g.axis)).toEqual(setA.groups.map((g) => g.axis));
    expect(groups.filter((g) => g.wild)).toHaveLength(1);
    expect(groups[0].suggestions[0].text).toBe(setA.groups[0].suggestions[0].text);
  });

  it("never puts a colon in an id, because a suggestion id becomes a handle port", () => {
    const groups = assignIds(setA.groups);
    for (const id of [...groups.map((g) => g.id), ...ids(groups)]) expect(id).not.toContain(":");
  });

  it("hands out fresh ids on every call, so a re-rolled chip is never mistaken for a pinned one", () => {
    const first = ids(assignIds(setA.groups));
    const second = ids(assignIds(setA.groups));
    expect(first.filter((id) => second.includes(id))).toEqual([]);
  });
});

describe("togglePin", () => {
  const groups = assignIds(setA.groups);
  const chip = groups[0].suggestions[1];

  it("pins by copying the text and the axis", () => {
    expect(togglePin([], chip, "camera")).toEqual([{ id: chip.id, text: chip.text, axis: "camera" }]);
  });

  it("unpins a chip that is already pinned", () => {
    const pinned = togglePin([], chip, "camera");
    expect(togglePin(pinned, chip, "camera")).toEqual([]);
  });

  it(`refuses a pin past ${MAX_PINS} and hands back the same array`, () => {
    const full = ids(groups)
      .slice(0, MAX_PINS)
      .map((id) => ({ id, text: "t", axis: "camera" }));
    expect(togglePin(full, groups[3].suggestions[2], "material")).toBe(full);
  });

  it("still unpins at the cap", () => {
    const full = groups[0].suggestions
      .concat(groups[1].suggestions[0])
      .map((s) => ({ ...s, axis: "camera" }));
    expect(full).toHaveLength(MAX_PINS);
    expect(togglePin(full, groups[0].suggestions[0], "camera")).toHaveLength(MAX_PINS - 1);
  });

  it("does not mutate its input", () => {
    const pinned: PinnedSuggestion[] = [];
    togglePin(pinned, chip, "camera");
    expect(pinned).toEqual([]);
  });
});

describe("toOutputTexts", () => {
  it("keys each pinned text by its pin id", () => {
    expect(
      toOutputTexts([
        { id: "s-1", text: "neon alley at night", axis: "camera" },
        { id: "s-2", text: "a cat on a rooftop", axis: "era" },
      ])
    ).toEqual({ "s-1": "neon alley at night", "s-2": "a cat on a rooftop" });
  });

  it("is empty with no pins", () => {
    expect(toOutputTexts([])).toEqual({});
  });
});

describe("rerollGroups", () => {
  it("takes the fresh roll as is when nothing is on screen yet", () => {
    const fresh = assignIds(setA.groups);
    expect(rerollGroups([], fresh, [])).toEqual(fresh);
  });

  it("leaves a pinned chip untouched, in the same slot with the same id and text", () => {
    const current = assignIds(setA.groups);
    const pin = pinOf(current, 3, 1);
    const merged = rerollGroups(current, assignIds(setB.groups), [pin]);
    expect(merged[3].suggestions[1]).toBe(current[3].suggestions[1]);
  });

  it("replaces every unpinned chip", () => {
    const current = assignIds(setA.groups);
    const pin = pinOf(current, 3, 1);
    const merged = rerollGroups(current, assignIds(setB.groups), [pin]);
    const survivors = ids(merged).filter((id) => ids(current).includes(id));
    expect(survivors).toEqual([pin.id]);
    expect(ids(merged)).toHaveLength(12);
  });

  it("keeps group ids stable, so rows stay mounted across a re-roll", () => {
    const current = assignIds(setA.groups);
    const merged = rerollGroups(current, assignIds(setB.groups), []);
    expect(merged.map((g) => g.id)).toEqual(current.map((g) => g.id));
  });

  it("keeps the axis and wild flag of a row that holds a pin, and takes the fresh ones otherwise", () => {
    const current = assignIds(setA.groups);
    const fresh = assignIds([
      { axis: "lens", suggestions: setB.groups[0].suggestions },
      { axis: "season", wild: true, suggestions: setB.groups[1].suggestions },
      ...setB.groups.slice(2).map((g) => ({ axis: g.axis, suggestions: g.suggestions })),
    ]);
    const merged = rerollGroups(current, fresh, [pinOf(current, 0, 0)]);
    expect(merged[0].axis).toBe("camera");
    expect(merged[1].axis).toBe("season");
    expect(merged[1].wild).toBe(true);
  });

  it("keeps a pinned chip whose row has no counterpart in a shorter fresh roll", () => {
    const current = assignIds(setA.groups);
    const pin = pinOf(current, 3, 2);
    const merged = rerollGroups(current, assignIds(setB.groups.slice(0, 3)), [pin]);
    expect(merged).toHaveLength(4);
    expect(merged[3].suggestions).toEqual([current[3].suggestions[2]]);
  });

  it("drops an unpinned row that a shorter fresh roll no longer has", () => {
    const current = assignIds(setA.groups);
    const merged = rerollGroups(current, assignIds(setB.groups.slice(0, 3)), []);
    expect(merged).toHaveLength(3);
  });

  it("does not mutate the groups on screen", () => {
    const current = assignIds(setA.groups);
    const before = JSON.stringify(current);
    rerollGroups(current, assignIds(setB.groups), [pinOf(current, 1, 1)]);
    expect(JSON.stringify(current)).toBe(before);
  });
});

describe("clearSpot", () => {
  const spot = { x: 500, y: 100, width: 320, height: 360 };

  it("keeps the wanted position when nothing is in the way", () => {
    expect(clearSpot(spot, [{ x: 0, y: 0, width: 380, height: 900 }])).toEqual({ x: 500, y: 100 });
  });

  it("slides below a node it would overlap", () => {
    const taken = [{ x: 480, y: 80, width: 320, height: 340 }];
    expect(clearSpot(spot, taken, 24)).toEqual({ x: 500, y: 444 });
  });

  it("keeps sliding past a stack of nodes, whatever order they come in", () => {
    const taken = [
      { x: 500, y: 464, width: 320, height: 340 },
      { x: 500, y: 100, width: 320, height: 340 },
    ];
    expect(clearSpot(spot, taken, 24)).toEqual({ x: 500, y: 828 });
  });

  it("ignores nodes in another column", () => {
    const taken = [{ x: 900, y: 100, width: 320, height: 340 }];
    expect(clearSpot(spot, taken)).toEqual({ x: 500, y: 100 });
  });
});

describe("nextStubSetIndex", () => {
  it("starts with the first set", () => {
    expect(nextStubSetIndex([], fixture.sets)).toBe(0);
  });

  it("moves to the next set and wraps around", () => {
    expect(nextStubSetIndex(assignIds(setA.groups), fixture.sets)).toBe(1);
    expect(nextStubSetIndex(assignIds(setB.groups), fixture.sets)).toBe(0);
  });

  it("is not thrown off by a pinned chip left over from another set", () => {
    const current = assignIds(setA.groups);
    const mixed = rerollGroups(current, assignIds(setB.groups), [pinOf(current, 0, 0)]);
    expect(nextStubSetIndex(mixed, fixture.sets)).toBe(0);
  });
});

describe("rerollGroup", () => {
  it("replaces only that group's unpinned chips and leaves every other group as it was", () => {
    const current = assignIds(setA.groups);
    const fresh = assignIds(setB.groups);
    const merged = rerollGroup(current, fresh, [], current[1].id);
    expect(merged[1].suggestions.map((s) => s.text)).toEqual(fresh[1].suggestions.map((s) => s.text));
    expect(merged[0]).toBe(current[0]);
    expect(merged[2]).toBe(current[2]);
    expect(merged[3]).toBe(current[3]);
  });

  it("keeps a pinned chip in that group, same slot, id and text", () => {
    const current = assignIds(setA.groups);
    const pin = pinOf(current, 1, 2);
    const merged = rerollGroup(current, assignIds(setB.groups), [pin], current[1].id);
    expect(merged[1].suggestions[2]).toBe(current[1].suggestions[2]);
    expect(merged[1].suggestions[0].id).not.toBe(current[1].suggestions[0].id);
  });

  it("keeps the group's id, axis and wild flag, whatever the fresh row says", () => {
    const current = assignIds(setA.groups);
    const fresh = assignIds(setB.groups.map((g) => ({ axis: "lens", suggestions: g.suggestions })));
    const merged = rerollGroup(current, fresh, [], current[3].id);
    expect(merged[3].id).toBe(current[3].id);
    expect(merged[3].axis).toBe("material");
    expect(merged[3].wild).toBe(true);
  });

  it("hands back the same array for a group id it does not know", () => {
    const current = assignIds(setA.groups);
    expect(rerollGroup(current, assignIds(setB.groups), [], "g-nope")).toBe(current);
  });

  it("does not mutate the groups on screen", () => {
    const current = assignIds(setA.groups);
    const before = JSON.stringify(current);
    rerollGroup(current, assignIds(setB.groups), [pinOf(current, 1, 1)], current[1].id);
    expect(JSON.stringify(current)).toBe(before);
  });
});
