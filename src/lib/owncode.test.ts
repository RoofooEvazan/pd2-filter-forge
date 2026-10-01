// Problems → "Use a different item code": the user's own replacement for an unknown code is checked first.
import { describe, expect, it } from "vitest";
import { parseFilter } from "./document";
import { lintDoc, tryItemCode } from "./lint";

const setup = (text: string) => {
  const doc = parseFilter(text);
  const found = lintDoc(doc).find((x) => x.check === "cond.item-unknown")!;
  return { lines: doc.lines, found };
};

describe("using your own item code", () => {
  it("is offered for an unknown code written in the rule", () => {
    expect(setup("ItemDisplay[bux RARE]: %NAME%").found.swap).toEqual({ token: "bux", code: "bux" });
  });
  it("applies a real code that causes no new problem", () => {
    const { lines, found } = setup("ItemDisplay[(cqv1 OR aqv) RARE]: %NAME%");
    const t = tryItemCode(lines, found, "CQV ");
    expect(t).toMatchObject({ code: "cqv", item: "Light Bolts", problems: [] });
    expect(t.fix?.key).toBe("(cqv OR aqv) RARE");
  });
  it("accepts an item name", () => {
    const { lines, found } = setup("ItemDisplay[bux RARE]: %NAME%");
    expect(tryItemCode(lines, found, "buckler")).toMatchObject({ code: "buc", problems: [] });
  });
  it("refuses a code no item has, with suggestions", () => {
    const { lines, found } = setup("ItemDisplay[bux RARE]: %NAME%");
    const t = tryItemCode(lines, found, "bux2");
    expect(t.fix).toBeUndefined();
    expect(t.problems[0]).toContain("No item has the code");
  });
  it("flags a code already in the rule", () => {
    const { lines, found } = setup("ItemDisplay[(cqv1 OR aqv) RARE]: %NAME%");
    expect(tryItemCode(lines, found, "aqv").problems[0]).toContain("already in this rule");
  });
  it("flags a code that makes the rule a copy of another", () => {
    const { lines, found } = setup("ItemDisplay[buc RARE]: %RED%%NAME%\nItemDisplay[bux RARE]: %NAME%");
    expect(tryItemCode(lines, found, "buc").problems.join(" ")).toContain("Line 1 already has exactly these conditions");
    expect(tryItemCode(lines, found, "rin").problems).toEqual([]);
  });
  it("flags a new problem the code causes in the rule", () => {
    // A tier 3 map among tier 1 maps: the odd-code check fires.
    const { lines, found } = setup("ItemDisplay[t11 OR t21 OR t2x]: %NAME%");
    expect(tryItemCode(lines, found, "t22").problems).toEqual([]);
    expect(tryItemCode(lines, found, "t13").problems.join(" ")).toContain("Bastion Keep Map");
  });
});
