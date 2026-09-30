import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseFilter, serializeFilter, computeSections, collectDefinitions, editLine } from "./document";
import { buildTree, parseCondition, serializeTree, tokenize, compileCondition, evalTree } from "./conditions";
import { compileDoc, runFilter } from "./engine";
import { DEFAULT_CTX, makeItem } from "./item";
import { composeOutput, splitOutput } from "./output";
import { evalFormula, parseFormula, renderFormulaValue } from "./formula";

const PD2 = "C:/Program Files/Diablo II/ProjectD2/filters";
const realFilters: string[] = [];
for (const sub of ["local", "online"]) {
  const dir = path.join(PD2, sub);
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) if (f.endsWith(".filter") && fs.statSync(path.join(dir, f)).isFile()) realFilters.push(path.join(dir, f));
}
const readLatin1 = (p: string) => fs.readFileSync(p).toString("latin1");

const lineText = (s: string) => s.replace(/\r?\n$/, "");

describe("document round trip", () => {
  it.each(realFilters.map((f) => [path.basename(f), f]))("%s is byte-identical after parse+serialise", (_, f) => {
    const text = readLatin1(f);
    const doc = parseFilter(text);
    const out = serializeFilter(doc);
    // A missing final newline is the only allowed difference.
    expect(lineText(out)).toBe(lineText(text.replace(/^\uFEFF/, "")));
  });

  it("re-serialises only edited lines", () => {
    const doc = parseFilter("ItemDisplay[r33]:   %ORANGE%Zod  // best rune\n// ==== RUNES ====\n");
    const l = editLine(doc.lines[0], { value: "%RED%ZOD" });
    expect(l.raw).toBe("ItemDisplay[r33]: %RED%ZOD\t// best rune");
    expect(doc.lines[1].kind).toBe("comment");
  });

  it("detects disabled rules and sections", () => {
    const doc = parseFilter("//=====\n// RUNES\n//=====\n//ItemDisplay[r01]: El\nItemDisplay[r33]: Zod\n");
    expect(doc.lines[3].kind).toBe("rule");
    expect(doc.lines[3].disabled).toBe(true);
    const secs = computeSections(doc.lines);
    expect(secs.map((s) => s.title)).toContain("RUNES");
  });
});

describe("conditions", () => {
  it("uses BH's left-to-right AND/OR precedence", () => {
    // A OR B C  ==  (A OR B) AND C
    const { tree, mixed } = buildTree(tokenize("UNI OR SET ETH"));
    expect(mixed).toBe(true);
    expect(serializeTree(tree)).toBe("(UNI OR SET) ETH");
    const env = (q: any, eth: boolean) => ({ item: makeItem("uap", { quality: q, ethereal: eth }), ctx: DEFAULT_CTX, defs: collectDefinitions([]) });
    expect(evalTree(tree, env("unique", false))).toBe(false);
    expect(evalTree(tree, env("unique", true))).toBe(true);
  });

  it("handles negated groups and ranges", () => {
    const { tree } = parseCondition("MAG !ID HELM !(BAR OR DRU OR ELT) SOCKETS~1-2");
    expect(serializeTree(tree)).toBe("MAG !ID HELM !(BAR OR DRU OR ELT) SOCKETS~1-2");
    const defs = collectDefinitions([]);
    const env = { item: makeItem("cap", { quality: "magic", identified: false, sockets: 2 }), ctx: DEFAULT_CTX, defs };
    expect(evalTree(tree, env)).toBe(true);
  });

  it("expands aliases and evaluates add conditions and formulas", () => {
    const doc = parseFilter("Alias[GOODRES]: FRES+CRES+LRES+PRES>79\nFormula[RESCOUNT]: COUNT(FRES>0,CRES>0,LRES>0,PRES>0)\n");
    const defs = collectDefinitions(doc.lines);
    const item = makeItem("rin", { quality: "rare", stats: { 39: 30, 41: 30, 43: 20 } });
    const env = { item, ctx: DEFAULT_CTX, defs };
    expect(evalTree(compileCondition("RARE GOODRES", defs).tree, env)).toBe(true);
    expect(evalTree(compileCondition("FORMULARESCOUNT>2", defs).tree, env)).toBe(true);
    expect(evalTree(compileCondition("$f(FRES+CRES)>49", defs).tree, env)).toBe(true);
    expect(evalTree(compileCondition("$f(FRES+CRES)>50", defs).tree, env)).toBe(false);
  });

  it("flags value codes without comparisons and unknown tokens", () => {
    const toks = tokenize("ILVL NOTAREALTHING r33 zzz");
    const issues = toks.flatMap((t) => (t.t === "leaf" && t.leaf.issue ? [t.leaf.key] : []));
    expect(issues).toEqual(["ILVL", "NOTAREALTHING", "zzz"]);
  });
});

describe("formulas", () => {
  it("evaluates and renders like PD2", () => {
    expect(evalFormula(parseFormula("IF(2>1, POW(2,3), 0) + MOD(-17,5)"), () => 0)).toBe(6);
    expect(renderFormulaValue(1.495)).toBe("1.5");
    expect(renderFormulaValue(1 / 0)).toBe("f_err");
    expect(evalFormula(parseFormula("MULTI83,2 * 2"), (n, p) => (n === "MULTI" && p[0] === 83 && p[1] === 2 ? 3 : 0))).toBe(6);
  });
});

describe("output", () => {
  it("round-trips structured effects", () => {
    const p = splitOutput("%ORANGE%%NAME%{Rune %RUNENUM%}%BORDER-0A%%SOUNDID-4714%%TIER-2%%CONTINUE%");
    expect(p.name).toBe("%ORANGE%%NAME%");
    expect(p.desc).toBe("Rune %RUNENUM%");
    expect(p.effects).toMatchObject({ border: "0A", sound: 4714, tier: 2, cont: true });
    expect(composeOutput(p)).toBe("%ORANGE%%NAME%{Rune %RUNENUM%}%BORDER-0A%%SOUNDID-4714%%TIER-2%%CONTINUE%");
  });
});

describe("runFilter", () => {
  const doc = parseFilter(
    [
      "ItemDisplayFilterName[]: Relaxed",
      "ItemDisplayFilterName[]: Strict",
      "ItemDisplay[ETH]: %GRAY%eth %NAME%%CONTINUE%",
      "ItemDisplay[SOCKETS>0]: %NAME% [%SOCKETS%]%CONTINUE%",
      "ItemDisplay[RUNE>29]: %RED%*** %NAME% ***%BORDER-0A%%TIER-1%",
      "ItemDisplay[NMAG !ETH SOCKETS=0 FILTLVL>1]:",
      "ItemDisplay[]: %NAME%",
    ].join("\n")
  );
  const c = compileDoc(doc);
  const text = (r: ReturnType<typeof runFilter>) => r.display.lines.map((l) => l.map((x) => x.text).join("")).join("|");

  it("chains %CONTINUE% rules", () => {
    const r = runFilter(c, makeItem("7cr", { ethereal: true, sockets: 5 }), DEFAULT_CTX);
    expect(text(r)).toBe("eth Phase Blade [5]");
    expect(r.matched.length).toBe(3);
  });
  it("hides by filter level and shows everything at level 0", () => {
    const plain = makeItem("cap");
    expect(runFilter(c, plain, { ...DEFAULT_CTX, filtlvl: 2 }).hidden).toBe(true);
    expect(runFilter(c, plain, { ...DEFAULT_CTX, filtlvl: 1 }).hidden).toBe(false);
    expect(runFilter(c, plain, { ...DEFAULT_CTX, filtlvl: 0 }).hidden).toBe(false);
  });
  it("reports notifications and tier suppression", () => {
    expect(runFilter(c, makeItem("r33"), { ...DEFAULT_CTX, filtlvl: 1 }).notify?.effects.border).toBe("0A");
    const r = runFilter(c, makeItem("r33"), { ...DEFAULT_CTX, filtlvl: 2 });
    expect(text(r)).toBe("*** Zod Rune ***");
    // Above its TIER the rule is skipped by the notification pass entirely.
    expect(r.notify).toBeUndefined();
    expect(r.tierSkipped.length).toBe(1);
  });
});

describe("real filters", () => {
  it.each(realFilters.map((f) => [path.basename(f), f]))("%s compiles and runs", (_, f) => {
    const doc = parseFilter(readLatin1(f));
    const c = compileDoc(doc);
    const errors = c.rules.filter((r) => r.error);
    // Surface counts in the test log for a quick health check.
    console.log(path.basename(f), `${c.rules.length} rules, ${errors.length} with structural errors, ${c.defs.aliases.size} aliases, ${c.defs.levels.length} levels`);
    for (const code of ["r33", "uap", "cm3", "7cr", "t11", "gld", "hp5"]) {
      const r = runFilter(c, makeItem(code, { gold: 5000 }), DEFAULT_CTX);
      expect(r.display.lines).toBeDefined();
    }
    expect(errors.length).toBeLessThan(c.rules.length * 0.02 + 1);
  }, 30000);
});

describe("templates", () => {
  it("starter and blank filters have no problems", async () => {
    const { starterFilter, blankFilter } = await import("./templates");
    const { lintDoc } = await import("./lint");
    for (const t of [starterFilter(), blankFilter()]) {
      const issues = lintDoc(parseFilter(t)).filter((i) => i.sev !== "info");
      expect(issues.map((i) => i.msg)).toEqual([]);
    }
  });
  it("finds sections but not blurbs", async () => {
    const { starterFilter } = await import("./templates");
    const titles = computeSections(parseFilter(starterFilter()).lines).map((s: { title: string }) => s.title);
    expect(titles).toContain("RUNES");
    expect(titles.some((t: string) => t.startsWith("Flip"))).toBe(false);
  });
});

describe("item-kind scoped conditions", () => {
  const defs = collectDefinitions([]);
  const ev = (cond: string, code: string) => evalTree(compileCondition(cond, defs).tree, { item: makeItem(code, { gold: 50 }), ctx: DEFAULT_CTX, defs });
  it("GOLD, RUNE and GEM conditions are false on other items, like BH", () => {
    expect(ev("GOLD<100", "r30")).toBe(false);
    expect(ev("GOLD<100", "gld")).toBe(true);
    expect(ev("RUNE<10", "uap")).toBe(false);
    expect(ev("GEMLEVEL<4", "r01")).toBe(false);
    expect(ev("GEMLEVEL<4", "gcv")).toBe(true);
  });
  it("MAPTIER is -1 on non-maps", () => {
    expect(ev("MAPTIER<1", "uap")).toBe(true);
    expect(ev("MAPTIER=0", "uap")).toBe(false);
    expect(ev("MAPTIER=1", "t11")).toBe(true);
  });
});
