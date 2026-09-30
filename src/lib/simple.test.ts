import { describe, expect, it } from "vitest";
import { parseFilter, serializeFilter } from "./document";
import { tokenize, compileCondition, evalTree } from "./conditions";
import { collectDefinitions } from "./document";
import { compileDoc, runFilter } from "./engine";
import { DEFAULT_CTX, makeItem } from "./item";
import { ITEM_BY_CODE } from "./data";
import { lintDoc } from "./lint";
import { starterFilter } from "./templates";
import { ALL_GROUPS, applyChoice, readChoices, itemGroup, groupFor } from "./simple";

const text = (r: ReturnType<typeof runFilter>) => r.display.lines.map((l) => l.map((x) => x.text).join("")).join("|");
const colorOf = (r: ReturnType<typeof runFilter>) => r.display.lines.flat()[0]?.color;

describe("catalog", () => {
  it.each([...ALL_GROUPS.values()].map((g) => [g.id, g]))("%s is valid and its sample matches", (_, g) => {
    expect(ITEM_BY_CODE.has(g.sample.code)).toBe(true);
    const toks = tokenize(g.cond);
    expect(toks.flatMap((t) => (t.t === "leaf" && t.leaf.issue ? [t.leaf.issue] : []))).toEqual([]);
    const defs = collectDefinitions([]);
    const { tree, error } = compileCondition(g.cond, defs);
    expect(error).toBeUndefined();
    const { code, ...patch } = g.sample;
    expect(evalTree(tree, { item: makeItem(code, patch), ctx: DEFAULT_CTX, defs })).toBe(true);
  });
});

describe("choices", () => {
  const base = parseFilter(starterFilter()).lines;

  it("recolors, adds an alert, and round-trips through the note", () => {
    const lines = applyChoice(base, "rune.r30", { color: "RED", stars: true, icon: { size: "border", hex: "62" }, sound: 4714 });
    expect(readChoices(lines).get("rune.r30")).toEqual({ color: "RED", stars: true, icon: { size: "border", hex: "62" }, sound: 4714 });
    const r = runFilter(compileDoc({ lines, eol: "\n" }), makeItem("r30"), DEFAULT_CTX);
    expect(text(r)).toBe("*** Ber Rune ***");
    expect(colorOf(r)).toBe("RED");
    expect(r.notify?.effects).toMatchObject({ border: "62", sound: 4714 });
    // The block lands before the first rule and passes the linter.
    expect(lintDoc({ lines, eol: "\n" }).filter((i) => i.sev === "error")).toEqual([]);
  });

  it("recolors items whose color is built into their name", () => {
    for (const [id, code] of [["rune.r33", "r33"], ["cur.imma", "imma"]]) {
      const lines = applyChoice(base, id, { color: "PURPLE" });
      const r = runFilter(compileDoc({ lines, eol: "\n" }), makeItem(code), DEFAULT_CTX);
      // Every run, not just the first, must take the new color.
      expect(new Set(r.display.lines.flat().map((x) => x.color))).toEqual(new Set(["PURPLE"]));
    }
  });

  it("an alert-only choice keeps the filter's own look", () => {
    const before = runFilter(compileDoc({ lines: base, eol: "\n" }), makeItem("r15"), DEFAULT_CTX);
    const lines = applyChoice(base, "rune.r15", { icon: { size: "map", hex: "84" } });
    const after = runFilter(compileDoc({ lines, eol: "\n" }), makeItem("r15"), DEFAULT_CTX);
    expect(text(after)).toBe(text(before));
    expect(after.notify?.effects.map).toBe("84");
  });

  it("hides from a level upward, and removing a choice restores the file", () => {
    const lines = applyChoice(base, "pot.low", { hide: 2 });
    const c = compileDoc({ lines, eol: "\n" });
    expect(runFilter(c, makeItem("hp1"), { ...DEFAULT_CTX, filtlvl: 1 }).hidden).toBe(false);
    expect(runFilter(c, makeItem("hp1"), { ...DEFAULT_CTX, filtlvl: 2 }).hidden).toBe(true);
    const restored = applyChoice(lines, "pot.low", null);
    expect(serializeFilter({ lines: restored, eol: "\n" })).toBe(serializeFilter({ lines: base, eol: "\n" }));
  });

  it("supports single items picked by search, placed before catalog groups", () => {
    const g = itemGroup("unique", "uap");
    expect(g.label).toBe("Harlequin Crest");
    expect(groupFor(g.id)?.cond).toBe("uap UNI");
    let lines = applyChoice(base, "uni.elite", { color: "GOLD" });
    lines = applyChoice(lines, g.id, { color: "PURPLE", rename: "SHAKO 100% {wow}" });
    const r = runFilter(compileDoc({ lines, eol: "\n" }), makeItem("uap", { quality: "unique", title: "Harlequin Crest" }), DEFAULT_CTX);
    expect(text(r)).toBe("SHAKO 100% {wow}");
    expect(colorOf(r)).toBe("PURPLE");
  });

  it("typed names can't inject keywords", () => {
    const lines = applyChoice(base, "item.key", { rename: "Key // %RED% hi" });
    const r = runFilter(compileDoc({ lines, eol: "\n" }), makeItem("key", { qty: 1 }), DEFAULT_CTX);
    expect(text(r)).toBe("Key / %RED% hi");
  });
});
