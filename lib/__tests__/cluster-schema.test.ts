import { describe, expect, it } from "vitest";
import { ClusterResponse } from "../cluster-schema";
import fixture from "../stubs/cluster.json";

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");

const group = (axis: string, wild?: boolean) => ({
  axis,
  ...(wild === undefined ? {} : { wild }),
  suggestions: [{ text: `${axis} one` }, { text: `${axis} two` }, { text: `${axis} three` }],
});

const valid = () => ({
  groups: [group("camera"), group("era"), group("weather"), group("material", true)],
});

describe("ClusterResponse schema", () => {
  it("accepts the right shape", () => {
    expect(ClusterResponse.safeParse(valid()).success).toBe(true);
  });

  it("accepts three groups as well as four", () => {
    const three = { groups: valid().groups.slice(1) };
    expect(ClusterResponse.safeParse(three).success).toBe(true);
  });

  it("rejects a response with no wild group", () => {
    const none = { groups: [group("camera"), group("era"), group("weather")] };
    expect(ClusterResponse.safeParse(none).success).toBe(false);
  });

  it("rejects a response with two wild groups", () => {
    const two = { groups: [group("camera", true), group("era"), group("material", true)] };
    expect(ClusterResponse.safeParse(two).success).toBe(false);
  });

  it("accepts a 25-word suggestion and rejects a 26-word one", () => {
    const at = valid();
    at.groups[0].suggestions[0].text = words(25);
    expect(ClusterResponse.safeParse(at).success).toBe(true);

    const over = valid();
    over.groups[0].suggestions[0].text = words(26);
    expect(ClusterResponse.safeParse(over).success).toBe(false);
  });

  it("rejects two groups instead of three", () => {
    const two = { groups: [group("camera"), group("material", true)] };
    expect(ClusterResponse.safeParse(two).success).toBe(false);
  });

  it("rejects five groups", () => {
    const five = { groups: [...valid().groups, group("palette")] };
    expect(ClusterResponse.safeParse(five).success).toBe(false);
  });

  it("rejects a group without exactly three suggestions", () => {
    const short = valid();
    short.groups[1].suggestions.pop();
    expect(ClusterResponse.safeParse(short).success).toBe(false);
  });
});

describe("lib/stubs/cluster.json", () => {
  it("holds at least two sets, so a stub re-roll has different chips to swap to", () => {
    expect(fixture.sets.length).toBeGreaterThanOrEqual(2);
  });

  it.each(fixture.sets.map((set, i) => [i, set] as const))(
    "set %i matches the schema",
    (_i, set) => {
      const result = ClusterResponse.safeParse(set);
      expect(result.success ? [] : result.error.issues).toEqual([]);
    }
  );

  it("has four groups per set, one of them wild", () => {
    for (const set of fixture.sets) {
      expect(set.groups).toHaveLength(4);
      expect(set.groups.filter((g) => "wild" in g && g.wild)).toHaveLength(1);
    }
  });

  it("uses the same axes in the same order in every set, so a re-roll keeps each row's label", () => {
    const axes = fixture.sets.map((set) => set.groups.map((g) => g.axis));
    for (const other of axes.slice(1)) expect(other).toEqual(axes[0]);
  });

  it("never repeats a suggestion across sets, so every unpinned chip changes on a re-roll", () => {
    const texts = fixture.sets.flatMap((set) =>
      set.groups.flatMap((g) => g.suggestions.map((s) => s.text))
    );
    expect(new Set(texts).size).toBe(texts.length);
  });
});
