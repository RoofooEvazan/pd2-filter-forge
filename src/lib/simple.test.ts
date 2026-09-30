import { describe, expect, it } from "vitest";
import { parseFilter, serializeFilter } from "./document";
import { tokenize, compileCondition, evalTree } from "./conditions";
import { collectDefinitions } from "./document";
import { compileDoc, runFilter } from "./engine";
import { DEFAULT_CTX, makeItem } from "./item";
import { ITEM_BY_CODE } from "./data";
import { lintDoc } from "./lint";
import { starterFilter } from "./templates";
import { ALL_GROUPS, applyChoice, readChoices, itemGroup, groupFor, saveMystery, deleteMystery, readMysteries, MYSTERY_PRESETS, mysteryText } from "./simple";

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

describe("mystery drops", () => {
  const base = parseFilter(starterFilter()).lines;
  const mys = { ...MYSTERY_PRESETS[0], id: "m1" };
  const withMystery = () => {
    let lines = saveMystery(base, mys);
    lines = applyChoice(lines, "rune.r30", { mystery: "m1" });
    lines = applyChoice(lines, "uni.ring", { mystery: "m1", color: "GOLD" });
    return lines;
  };
  it("round-trips mysteries and item choices through the file", () => {
    const lines = parseFilter(serializeFilter({ lines: withMystery(), eol: "\n" })).lines;
    expect(readMysteries(lines)).toEqual([expect.objectContaining({ id: "m1", name: "Little Bastard" })]);
    expect(readChoices(lines).get("rune.r30")).toEqual({ mystery: "m1" });
    expect(readChoices(lines).get("uni.ring")).toEqual({ mystery: "m1", color: "GOLD" });
  });
  it("shows the banner on the ground and the real name once picked up or in town", () => {
    const c = compileDoc({ lines: withMystery(), eol: "\n" });
    const ber = makeItem("r30");
    const ground = runFilter(c, ber, DEFAULT_CTX);
    expect(text(ground)).toBe(mysteryText(mys));
    expect(ground.notify?.effects.dot).toBe("60");
    expect(text(runFilter(c, ber, { ...DEFAULT_CTX, location: "INVENTORY" }))).toContain("Ber");
    expect(text(runFilter(c, ber, { ...DEFAULT_CTX, mapid: 109 }))).toContain("Ber");
    // Identified uniques are no longer a mystery.
    expect(text(runFilter(c, makeItem("rin", { quality: "unique", identified: true, title: "Stone of Jordan" }), DEFAULT_CTX))).toContain("Stone of Jordan");
    expect(text(runFilter(c, makeItem("rin", { quality: "unique", identified: false }), DEFAULT_CTX))).toBe(mysteryText(mys));
  });
  it("writes rules PD2 reads cleanly, and deleting the mystery frees its items", () => {
    const lines = withMystery();
    const issues = lintDoc({ lines, eol: "\n" }).filter((i) => lines[i.line].note?.startsWith("@ff"));
    expect(issues.filter((i) => i.sev !== "info").map((i) => i.msg)).toEqual([]);
    const after = deleteMystery(lines, "m1");
    expect(readMysteries(after)).toEqual([]);
    expect(readChoices(after).has("rune.r30")).toBe(false);
    expect(readChoices(after).get("uni.ring")).toEqual({ color: "GOLD" });
  });
});
