// Golden cases for PD2 engine behaviour, each traced to BH source in
// docs/PD2-Filter-Engine-Reference.md. If one of these fails, the emulator no longer matches PD2.
import { describe, expect, it } from "vitest";
import { collectDefinitions, parseFilter } from "./document";
import { compileCondition, evalTree } from "./conditions";
import { compileDoc, runFilter } from "./engine";
import { DEFAULT_CTX, makeItem, type TestItem } from "./item";
import { evalFormula, parseFormula, renderFormulaValue, tryCompile } from "./formula";
import { buildAction } from "./output";
import { lintDoc } from "./lint";

const defs = collectDefinitions([]);
const matches = (cond: string, item: TestItem) => {
  const c = compileCondition(cond, defs);
  return !c.error && evalTree(c.tree, { item, ctx: DEFAULT_CTX, defs });
};
const events = (cond: string) => compileCondition(cond, defs).bh.events.map((e) => e.kind);
const eth = makeItem("7cr", { ethereal: true });
const plain = makeItem("7cr");
const rare = makeItem("7cr", { quality: "rare" });

describe("condition parsing (ItemDisplay.cpp BuildConditions / ProcessConditions / Convert)", () => {
  it("a stray ) throws away the rest of the rule", () => {
    expect(matches("ETH) AND RARE", eth)).toBe(true);
    expect(events("ETH) AND RARE")).toContain("stray-close");
  });
  it("a rule whose conditions are all dropped matches everything", () => {
    expect(matches("Eth", plain)).toBe(true);
    expect(events("Eth")).toEqual(expect.arrayContaining(["dropped-unknown", "matches-everything"]));
  });
  it("a lone ! left behind means the rule never matches", () => {
    expect(compileCondition("!Eth", defs).bh.never).toBe(true);
  });
  it(">= drops the condition but keeps a leading !", () => {
    expect(events("ILVL>=5 RARE")).toContain("two-char-op");
    // !ILVL>=5 RARE -> !RARE
    expect(matches("!ILVL>=5 RARE", rare)).toBe(false);
    expect(matches("!ILVL>=5 RARE", plain)).toBe(true);
  });
  it("|| and && are real operators", () => {
    expect(matches("UNI || ETH", eth)).toBe(true);
    expect(matches("ETH && RARE", eth)).toBe(false);
  });
  it("lowercase keywords become item codes", () => {
    expect(matches("eth", eth)).toBe(false);
    expect(events("ilvl>5")).toContain("item-looks-like-keyword");
  });
  it("empty values mean 0 and ranges need a dash", () => {
    expect(matches("ILVL>", plain)).toBe(true);
    expect(events("SOCKETS~2")).toContain("range-no-dash");
    expect(matches("SOCKETS~2", makeItem("7cr", { sockets: 2 }))).toBe(false);
  });
  it("out-of-range STAT numbers are dropped, broadening the rule", () => {
    expect(events("STAT9999>0")).toContain("dropped-param");
    expect(matches("STAT9999>0", plain)).toBe(true);
  });
  it("A+B only sums the whitelisted parts", () => {
    expect(events("IAS+FCR>30")).toContain("add-part-skipped");
    expect(matches("IAS+FCR>30", makeItem("rin", { stats: { 93: 40, 105: 0 } }))).toBe(false);
    expect(matches("FRES+CRES>30", makeItem("rin", { stats: { 39: 20, 43: 20 } }))).toBe(true);
  });
  it("an unclosed ( discards the operators before it", () => {
    expect(compileCondition("ETH OR (SOCKETS>0 RARE", defs).bh.never).toBe(true);
    expect(matches("(ETH SOCKETS>0", makeItem("7cr", { ethereal: true, sockets: 3 }))).toBe(true);
  });
  it("value conditions without a comparison never match", () => {
    expect(matches("ILVL", plain)).toBe(false);
    expect(matches("!ILVL", plain)).toBe(true);
  });
});

describe("item groups (Item.cpp ancestor-type rules)", () => {
  it("circlets aren't helms", () => {
    expect(matches("HELM", makeItem("ci3"))).toBe(false);
    expect(matches("CIRC", makeItem("ci3"))).toBe(true);
    expect(matches("HELM", makeItem("ba5"))).toBe(true);
  });
  it("paladin and necromancer shields are shields", () => {
    expect(matches("SHIELD", makeItem("pae"))).toBe(true);
    expect(matches("SHIELD", makeItem("nef"))).toBe(true);
  });
  it("javelins aren't spears, and 2H swords aren't 1H", () => {
    expect(matches("SPEAR", makeItem("7ja"))).toBe(false);
    expect(matches("JAV", makeItem("7ja"))).toBe(true);
    expect(matches("1H", makeItem("7gd"))).toBe(false);
    expect(matches("2H", makeItem("7gd"))).toBe(true);
  });
  it("misc items are NORM, stacked gems have a gem level, RES checks every resist", () => {
    expect(matches("NORM", makeItem("r30"))).toBe(true);
    expect(matches("GEMLEVEL=5", makeItem("gpws"))).toBe(true);
    const r = makeItem("rin", { stats: { 39: 40, 41: 40, 43: 40, 45: 10 } });
    expect(matches("RES<30", r)).toBe(false); // not every resist is below 30
    expect(matches("RES>5", r)).toBe(true);
  });
});

describe("formulas (Formula.h)", () => {
  const ev = (s: string) => evalFormula(parseFormula(s), () => 0);
  it("all comparisons share one precedence level", () => {
    expect(ev("1<5<3")).toBe(1);
    expect(ev("2==2>0")).toBe(1);
  });
  it("unary minus binds tighter than ^, and ^ is right-associative", () => {
    expect(ev("-2^2")).toBe(4);
    expect(ev("2^3^2")).toBe(512);
  });
  it("NaN counts as true and unknown names don't compile", () => {
    expect(ev("IF(SQRT(0-1),1,2)")).toBe(1);
    expect(tryCompile("FRS+1").error?.status).toBe("SYNTAX_ERROR");
    expect(tryCompile("FORMULAX+1").error).toBeTruthy();
    expect(tryCompile("A = 1").error?.status).toBe("LEXICAL_ERROR");
  });
  it("renders with ties to even and f_err past 2^31", () => {
    expect(renderFormulaValue(0.125)).toBe("0.12");
    expect(renderFormulaValue(10)).toBe("10");
    expect(renderFormulaValue(1.5)).toBe("1.5");
    expect(renderFormulaValue(3e9)).toBe("f_err");
  });
});

describe("output (BuildAction)", () => {
  it("description is first { to first }; the rest prints literally", () => {
    const a = buildAction("A{a}{b}", defs);
    expect(a.desc).toBe("a");
    expect(a.name).toBe("A{b}");
  });
  it("only the first notification keyword counts; TIER is one digit", () => {
    const a = buildAction("%NAME%%MAP-0A%%MAP-0B%%TIER-10%", defs);
    expect(a.effects.map).toBe("0A");
    expect(a.effects.tier).toBeUndefined();
    expect(a.name).toContain("%MAP-0B%");
  });
  it("%CONTINUE% inside braces doesn't continue", () => {
    expect(buildAction("%NAME%{x %CONTINUE%}", defs).effects.cont).toBe(false);
  });
  it("a later rule without {} clears the description", () => {
    const c = compileDoc(parseFilter("ItemDisplay[ETH]: %NAME%{eth!}%CONTINUE%\nItemDisplay[]: %NAME%"));
    expect(runFilter(c, eth, DEFAULT_CTX).display.desc).toEqual([]);
    const k = compileDoc(parseFilter("ItemDisplay[ETH]: %NAME%{eth!}%CONTINUE%\nItemDisplay[]: %NAME%{%NAME%}"));
    expect(runFilter(k, eth, DEFAULT_CTX).display.desc.flat().map((r) => r.text).join("")).toBe("eth!");
  });
  it("only an exactly empty name hides; tier-silenced rules pass notification on", () => {
    const c = compileDoc(parseFilter(["ItemDisplayFilterName[]: A", "ItemDisplayFilterName[]: B", "ItemDisplay[r30]: %WHITE%", "ItemDisplay[r33]: %NAME%%MAP-0A%%TIER-1%%CONTINUE%", "ItemDisplay[r33]: %NAME%%DOT-84%"].join("\n")));
    expect(runFilter(c, makeItem("r30"), { ...DEFAULT_CTX, filtlvl: 1 }).hidden).toBe(false);
    const z = runFilter(c, makeItem("r33"), { ...DEFAULT_CTX, filtlvl: 2 });
    expect(z.tierSkipped.length).toBe(1);
    expect(z.notify?.effects.dot).toBe("84");
  });
});

describe("checks on real mistakes", () => {
  const lint = (text: string) => lintDoc(parseFilter(text)).map((i) => i.check);
  it("finds the typos PD2 silently ignores", () => {
    expect(lint("ItemDisplay[(7fb OR 7gd) (BARARIAN OR FILTLVL<2)]: %NAME%")).toContain("cond.unknown");
    expect(lint("ItemDisplay[bux]: %NAME%")).toContain("cond.item-unknown");
    expect(lint("ItemDisplay[ILVL > 80]: %NAME%")).toContain("cond.spaces-op");
    expect(lint("ItemDisplay[ILVL>=80]: %NAME%")).toContain("cond.two-char-op");
    expect(lint("Alias[RUNE]: RUNE>20")).toContain("alias.self");
    expect(lint("ItemDisplay[MAG RARE]: %NAME%")).toContain("sem.conflict");
    expect(lint("ItemDisplay[ci3 HELM]: %NAME%")).toContain("sem.conflict");
    expect(lint("ItemDisplay[r30]: %NAME%%TIER-10%%MAP-0A%")).toContain("out.notify-syntax");
    expect(lint("ItemDisplay[r30]: %NAME%{%CONTINUE%}")).toContain("out.continue-desc");
    expect(lint("ItemDisplay[]: %NAME%\nItemDisplay[r30]: x")).toContain("flow.unreachable");
  });
  it("explains an alias left unexpanded by alias order, and never suggests the word itself", () => {
    const text = ["Alias[MARK]: ILVL>50", "Alias[OUTER]: (rin MARK)", "ItemDisplay[OUTER]: %NAME%"].join("\n");
    const issues = lintDoc(parseFilter(text));
    const inRule = issues.find((x) => x.check === "cond.alias-text")!;
    expect(inRule.msg).toContain("MARK is an alias");
    expect(inRule.detail).toContain("line 2");
    expect(issues.some((x) => x.check === "cond.unknown")).toBe(false);
    expect(inRule.fixes[0].move).toBeTruthy();
    expect(inRule.fixes[0].safe).toBe(true);
    expect(issues.find((x) => x.check === "alias.order")?.fixes[0].move).toBeTruthy();
    const unk = lintDoc(parseFilter("Alias[FOO_OK]: ETH\nItemDisplay[FOO_OKK]: %NAME%")).find((x) => x.check === "cond.unknown")!;
    expect(unk.fixes.some((f) => f.label === "Use FOO_OKK")).toBe(false);
  });
  it("gives specific, correct fixes for common slips", () => {
    const one = (text: string, check: string) => lintDoc(parseFilter(text)).find((x) => x.check === check)!;
    expect(one("Alias[TREE13]: SK13>0\nItemDisplay[TREE 13]: %NAME%", "cond.unknown").fixes[0].key).toBe("TREE13");
    expect(one("ItemDisplay[aqv OR aq2]: %NAME%", "cond.item-unknown").fixes[0].label).toContain("aqv2");
    expect(one("ItemDisplay[SK263>0 OR 264>0]: %NAME%", "cond.item-unknown").fixes[0].key).toBe("SK263>0 OR SK264>0");
    expect(one("ItemDisplay[!SOCK=1~2]: %NAME%", "cond.value-junk").fixes[0].key).toBe("!SOCK~1-2");
    expect(one("ItemDisplay[ETH=0]: %NAME%", "cond.op-ignored").fixes[0].key).toBe("!ETH");
    expect(one("ItemDisplay[r30]: %NAME%%TIER-5%", "out.tier-no-effect").fixes[0].value).toBe("%NAME%");
    expect(one("ItemDisplay[ID]: %NAME%{5-10%pdr%CL%%WHITE%x}", "out.unknown").fixes[0].value).toBe("%NAME%{5-10%PERCENT%pdr%CL%%WHITE%x}");
    expect(one("ItemDisplay[FCR+IAS>10]: %NAME%", "cond.add-part").fixes[0].key).toBe("$f(FCR+IAS)>10");
    // Rune-only rules may print only rune keywords; staffmod rules may use one line break.
    expect(lintDoc(parseFilter("ItemDisplay[RUNE=3 OR RUNE=5]: %RUNENAME%")).some((x) => x.check === "out.item-keyword")).toBe(false);
    expect(lintDoc(parseFilter("ItemDisplay[!UNI (CLSK0>0 OR TABSK0>0)]: %NL%%NAME%")).some((x) => x.check === "out.newline")).toBe(false);
    expect(lintDoc(parseFilter("ItemDisplay[7cr]: %NAME%%NL%x")).some((x) => x.check === "out.newline")).toBe(true);
  });
  it("offers a working fix for >=", () => {
    const i = lintDoc(parseFilter("ItemDisplay[RARE ILVL>=80]: %NAME%")).find((x) => x.check === "cond.two-char-op")!;
    expect(i.fixes[0].key).toBe("RARE ILVL>79");
  });
});

describe("reference document", () => {
  it("every check links to a section that exists", async () => {
    const fs = await import("node:fs");
    const { CHECKS } = await import("./lint");
    const doc = fs.readFileSync(new URL("../../docs/PD2-Filter-Engine-Reference.md", import.meta.url), "utf8");
    const anchors = new Set([...doc.matchAll(/<a id="([^"]+)"><\/a>/g)].map((m) => m[1]));
    expect(CHECKS.filter((c) => !anchors.has(c.ref)).map((c) => `${c.id} -> ${c.ref}`)).toEqual([]);
  });
});
