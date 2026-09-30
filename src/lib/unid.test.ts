import { describe, expect, it } from "vitest";
import { parseFilter, serializeFilter } from "./document";
import { compileDoc, runFilter } from "./engine";
import { DEFAULT_CTX, makeItem } from "./item";
import { lintDoc } from "./lint";
import { starterFilter } from "./templates";
import { applyChoice } from "./simple";
import { shopTemplates, writeShop } from "./shop";
import { DEFAULT_UNID, readUnid, writeUnid } from "./unid";

const text = (r: ReturnType<typeof runFilter>) => r.display.lines.map((l) => l.map((x) => x.text).join("")).join("|");
const desc = (r: ReturnType<typeof runFilter>) => r.display.desc.map((l) => l.map((x) => x.text).join("")).join("|");

describe("unidentified item names", () => {
  const base = parseFilter("ItemDisplay[UNI]: %NAME% ***\nItemDisplay[]: %NAME%").lines;
  const lines = writeUnid(base, DEFAULT_UNID);
  const c = compileDoc({ lines, eol: "\n" });

  it("names single-possibility uniques before identifying, and later rules still style them", () => {
    expect(text(runFilter(c, makeItem("uap", { quality: "unique", identified: false }), DEFAULT_CTX))).toBe("Harlequin Crest ***");
    expect(text(runFilter(c, makeItem("uap", { quality: "unique", identified: true, title: "Harlequin Crest" }), DEFAULT_CTX))).toBe("Harlequin Crest ***");
  });
  it("lists the possibilities for bases with several, while later rules keep the tooltip", () => {
    const keep = compileDoc({ lines: writeUnid(parseFilter("ItemDisplay[UNI]: %NAME% ***{%NAME%}").lines, DEFAULT_UNID), eol: "\n" });
    const r = runFilter(keep, makeItem("rin", { quality: "unique", identified: false }), DEFAULT_CTX);
    expect(text(r)).toBe("Ring ***");
    expect(desc(r)).toContain("Could be:");
    expect(desc(r)).toContain("Stone of Jordan");
    // A later rule without { } replaces the tooltip, exactly as in game.
    expect(desc(runFilter(c, makeItem("rin", { quality: "unique", identified: false }), DEFAULT_CTX))).toBe("");
  });
  it("names set items too", () => {
    const r = runFilter(c, makeItem("lrg", { quality: "set", identified: false }), DEFAULT_CTX);
    expect(text(r)).toBe("Civerb's Ward");
  });
  it("writes clean rules, round-trips its options, and sits above the shop and Simple blocks", () => {
    let l2 = applyChoice(parseFilter(starterFilter()).lines, "rune.r30", { color: "RED" });
    l2 = writeShop(l2, shopTemplates(1).slice(0, 1).map((t) => t.make()), { dimOthers: false });
    l2 = writeUnid(l2, { ...DEFAULT_UNID, withBase: true });
    l2 = parseFilter(serializeFilter({ lines: l2, eol: "\n" })).lines;
    expect(readUnid(l2)).toEqual({ ...DEFAULT_UNID, withBase: true });
    const at = (tag: string) => l2.findIndex((l) => l.note?.startsWith(tag));
    expect(at("@ffu")).toBeLessThan(at("@ffs"));
    expect(at("@ffs")).toBeLessThan(at("@ff "));
    const issues = lintDoc({ lines: l2, eol: "\n" }).filter((i) => l2[i.line].note?.startsWith("@ffu") && i.sev !== "info");
    expect(issues.map((i) => `${i.check}: ${i.msg}`)).toEqual([]);
    expect(writeUnid(l2, null).some((l) => l.note?.startsWith("@ffu"))).toBe(false);
  });
});
