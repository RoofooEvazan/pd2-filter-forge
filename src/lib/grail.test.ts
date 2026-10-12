// Holy grail (Season 14): BH's ANYDISCOVERED / ALLDISCOVERED / ANYOWNED / ALLOWNED and the grail block.
import { describe, expect, it } from "vitest";
import { makeRule, parseFilter, type Line } from "./document";
import { compileDoc, runFilter } from "./engine";
import { DEFAULT_CTX, makeItem, type GrailState } from "./item";
import { lintDoc } from "./lint";
import { DEFAULT_GRAIL, readGrail, refreshGrail, writeGrail, writtenKeeps } from "./grail";
import { applyChoice } from "./simple";
import { DEFAULT_UNID, writeUnid } from "./unid";
import { ITEM_BY_CODE } from "./data";

const text = (r: ReturnType<typeof runFilter>) => r.display.lines.map((l) => l.map((x) => x.text).join("")).join("|");
const lint = (src: string) => lintDoc(parseFilter(src));

describe("grail conditions", () => {
  const c = compileDoc(parseFilter("ItemDisplay[UNI ALLDISCOVERED]: all\nItemDisplay[UNI ANYDISCOVERED]: some\nItemDisplay[ALLOWNED]: owned\nItemDisplay[]: none\n"));
  const show = (patch: Parameters<typeof makeItem>[1]) => text(runFilter(c, makeItem("uap", { quality: "unique", ...patch }), DEFAULT_CTX));
  it("follow the found state, ANY vs ALL for unidentified items", () => {
    const by = (d: GrailState) => show({ identified: false, discovered: d });
    expect([by("none"), by("some"), by("all")]).toEqual(["none", "some", "all"]);
  });
  it("only ever match uniques and set items", () => {
    expect(text(runFilter(c, makeItem("r30", { discovered: "all", owned: "all" }), DEFAULT_CTX))).toBe("none");
    expect(show({ quality: "set", owned: "all" })).toBe("owned");
  });
  it("are known keywords, case-sensitive like BH", () => {
    expect(lint("ItemDisplay[UNI !ALLDISCOVERED]: %NAME%")).toEqual([]);
    expect(lint("ItemDisplay[UNI allDiscovered]: %NAME%").map((i) => i.check)).toContain("cond.lowercase");
  });
  it("are flagged on items that can't be in the grail", () => {
    expect(lint("ItemDisplay[MAG ANYDISCOVERED]: %NAME%")[0]?.msg).toContain("only true for uniques and set items");
    expect(lint("ItemDisplay[r30 ALLDISCOVERED]: %NAME%")[0]?.msg).toContain("no unique or set version");
    expect(lint("ItemDisplay[uap ALLDISCOVERED]: %NAME%")).toEqual([]);
  });
});

describe("Season 14 data", () => {
  it("has the new maps, uniques and old-stack names", () => {
    expect(ITEM_BY_CODE.get("t18")?.n).toBe("Poisoned Well Map");
    expect(ITEM_BY_CODE.get("r30s")?.n).toBe("Ber Rune (old)");
  });
  it("warns about rules that only match the old rune stacks", () => {
    const i = lint("ItemDisplay[r30s]: %NAME%").find((x) => x.check === "sem.stacked")!;
    expect(i.fixes[0].key).toBe("(r30 OR r30s)");
    expect(lint("ItemDisplay[r30]: %NAME%").filter((x) => x.check === "sem.stacked")).toEqual([]);
  });
});

describe("grail block", () => {
  const src = "ItemDisplayFilterName[]: Normal\nItemDisplay[UNI uap]: %GOLD%*** %NAME% ***\nItemDisplay[UNI]: %GOLD%%NAME%\nItemDisplay[]: %NAME%\n";
  const run = (lines: Line[], code: string, discovered: GrailState, quality: "unique" | "set" = "unique") =>
    runFilter(compileDoc({ lines, eol: "\n" }), makeItem(code, { quality, identified: false, discovered }), { ...DEFAULT_CTX, filtlvl: 1 });
  const lines = writeGrail(parseFilter(src).lines, DEFAULT_GRAIL);

  it("tags possible new finds and hides found ones", () => {
    expect(text(run(lines, "rin", "none"))).toBe("Ring [NEW]");
    expect(text(run(lines, "rin", "some"))).toBe("Ring [NEW]");
    expect(run(lines, "rin", "all").hidden).toBe(true);
  });
  it("keeps showing what the filter shows specifically", () => {
    expect(writtenKeeps(lines)).toContain("uni.uap");
    expect(text(run(lines, "uap", "all"))).toBe("*** Shako ***");
    expect(text(run(lines, "uap", "none"))).toBe("*** Shako [NEW] ***");
  });
  it("follows Simple mode choices and new rules", () => {
    let l2 = applyChoice(lines, "uni.rin", { color: "RED" });
    l2 = refreshGrail(l2);
    expect(run(l2, "rin", "all").hidden).toBe(false);
    const at = l2.findIndex((l) => l.kind === "rule" && l.key === "UNI");
    const l3 = refreshGrail([...l2.slice(0, at), makeRule("SET lrg", "%GREEN%%NAME%"), ...l2.slice(at)]);
    expect(writtenKeeps(l3)).toContain("set.lrg");
  });
  it("can hide only from a level, or never, and leaves no problems", () => {
    const lv = writeGrail([...parseFilter(src + "ItemDisplayFilterName[]: Strict\n").lines], { ...DEFAULT_GRAIL, hide: 2 });
    expect(run(lv, "rin", "all").hidden).toBe(false);
    expect(readGrail(lv)?.hide).toBe(2);
    expect(lintDoc({ lines, eol: "\n" }).filter((i) => i.sev !== "info")).toEqual([]);
    expect(writeGrail(lines, null).length).toBe(parseFilter(src).lines.length);
  });
});

describe("grail block on game versions before Season 14", () => {
  it("does nothing there instead of hiding every unique", () => {
    // Older BH drops the unknown word; what's left must leave a lone "!" so the rule is skipped.
    const lines = writeGrail(parseFilter("ItemDisplay[UNI]: %GOLD%%NAME%\n").lines, DEFAULT_GRAIL);
    const rules = lines.filter((l) => l.kind === "rule" && l.note?.startsWith("@ffg"));
    expect(rules.length).toBe(4);
    for (const r of rules) {
      const old = (r.key ?? "").replace(/\b(ANY|ALL)(DISCOVERED|OWNED)\b/g, "NOTAKEYWORD");
      expect(lintDoc(parseFilter(`ItemDisplay[${old}]: x`)).map((i) => i.check)).toContain("cond.never");
    }
  });
});

describe("grail block placement", () => {
  it("sits after unidentified names and before the Simple choices, in either order of creation", () => {
    const base = parseFilter("ItemDisplay[UNI]: %GOLD%%NAME%\nItemDisplay[]: %NAME%\n").lines;
    const order = (lines: Line[]) => lines.map((l) => (l.note ?? l.text ?? "").slice(0, 4)).filter((t) => t.startsWith("@ff")).map((t) => t.trim());
    const a = writeGrail(writeUnid(applyChoice(base, "rune.r30", { color: "RED" }), DEFAULT_UNID), DEFAULT_GRAIL);
    const b = applyChoice(writeUnid(writeGrail(base, DEFAULT_GRAIL), DEFAULT_UNID), "rune.r30", { color: "RED" });
    for (const l of [a, b]) {
      const o = order(l);
      expect(o.lastIndexOf("@ffu")).toBeLessThan(o.indexOf("@ffg"));
      expect(o.lastIndexOf("@ffg")).toBeLessThan(o.indexOf("@ff"));
    }
  });
});
