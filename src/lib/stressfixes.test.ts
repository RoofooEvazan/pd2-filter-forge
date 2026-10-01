// Regression tests for problems found by rebuilding every public launcher filter (stress/).
import { describe, expect, it } from "vitest";
import { editLine, parseFilter, serializeFilter } from "./document";
import { compileDoc, runFilter } from "./engine";
import { DEFAULT_CTX, makeItem } from "./item";
import { applyChoice, groupFor, readChoices, specificity } from "./simple";
import { blankFilter } from "./templates";

const text = (r: ReturnType<typeof runFilter>) => r.display.lines.map((l) => l.map((x) => x.text).join("")).join("|");

describe("saving keeps the file exactly as it was", () => {
  it("doesn't add a newline to a file that didn't end with one", () => {
    const src = "ItemDisplay[r30]: %NAME%\r\nItemDisplay[]: %NAME%";
    expect(serializeFilter(parseFilter(src))).toBe(src);
    expect(serializeFilter(parseFilter(src + "\r\n"))).toBe(src + "\r\n");
  });
  it("keeps '// ' on disabled rules and a bare // note when a line is edited", () => {
    const doc = parseFilter("// ItemDisplay[r30]: %NAME%\nItemDisplay[r31]: %NAME% //\n");
    const a = editLine(doc.lines[0], { value: "%RED%%NAME%" });
    const b = editLine(doc.lines[1], { value: "%GOLD%%NAME%" });
    expect(serializeFilter({ ...doc, lines: [a, b] })).toBe("// ItemDisplay[r30]: %RED%%NAME%\nItemDisplay[r31]: %GOLD%%NAME% //\n");
  });
});

describe("Simple mode choices", () => {
  const base = parseFilter(blankFilter()).lines;
  it("put more specific choices first, whatever order they were made in", () => {
    expect(specificity("gold.big")).toBeLessThan(specificity("item.gld"));
    expect(specificity("uni.rin")).toBeLessThan(specificity("item.rin"));
    let lines = applyChoice(base, "item.gld", { hide: "always" });
    lines = applyChoice(lines, "gold.big", { color: "GOLD" });
    const c = compileDoc({ lines, eol: "\n" });
    expect(runFilter(c, makeItem("gld", { gold: 8000 }), { ...DEFAULT_CTX, filtlvl: 1 }).hidden).toBe(false);
    expect(runFilter(c, makeItem("gld", { gold: 100 }), { ...DEFAULT_CTX, filtlvl: 1 }).hidden).toBe(true);
  });
  it("can decorate the name with text before and after it", () => {
    const lines = applyChoice(base, "rune.r30", { prefix: "ooo ", suffix: " ooo" });
    expect(readChoices(lines).get("rune.r30")).toEqual({ prefix: "ooo ", suffix: " ooo" });
    expect(text(runFilter(compileDoc({ lines, eol: "\n" }), makeItem("r30"), DEFAULT_CTX))).toBe("ooo Ber Rune ooo");
  });
  it("can limit a searched base to its white and grey versions", () => {
    expect(groupFor("white.7cr")?.cond).toBe("7cr NMAG");
    const lines = applyChoice(base, "white.7cr", { hide: "always" });
    const c = compileDoc({ lines, eol: "\n" });
    expect(runFilter(c, makeItem("7cr", { sockets: 5 }), { ...DEFAULT_CTX, filtlvl: 1 }).hidden).toBe(true);
    expect(runFilter(c, makeItem("7cr", { quality: "rare" }), { ...DEFAULT_CTX, filtlvl: 1 }).hidden).toBe(false);
  });
});
