// Cases from a review of the Roofoo filters, where the checker's advice was wrong or noisy.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { parseFilter } from "./document";
import { lintDoc } from "./lint";

const lint = (text: string) => lintDoc(parseFilter(text));

describe("review of the Roofoo filters", () => {
  it("PvP arena list: no map suggestions for dead codes, and t69 is flagged as a tier 3 map", () => {
    const issues = lint("ItemDisplay[t60 OR t61 OR t62 OR t63 OR t69]: %NAME%{PvP Arena}");
    const dead = issues.filter((i) => i.check === "cond.item-unknown");
    expect(dead.map((i) => i.token)).toEqual(["t60", "t63"]);
    for (const d of dead) {
      expect(d.fixes.map((f) => f.label)).toEqual([`Remove “${d.token}”`]);
      expect(d.advice).toContain("PvP arena maps");
    }
    const odd = issues.find((i) => i.check === "cond.odd-code")!;
    expect(odd.msg).toContain("t69 is Ruined Cistern Map");
    expect(odd.fixes[0].key).toBe("t60 OR t61 OR t62 OR t63");
  });
  it("uses the comment above the rule: cqv1 next to 'Heavy Bolts' is a leftover", () => {
    const i = lint("// Hide rare Heavy Bolts\nItemDisplay[(cqv1 OR cqv2 OR cqv3) RARE]:{%NAME%}").find((x) => x.check === "cond.item-unknown")!;
    expect(i.advice).toContain("cqv2");
    expect(i.advice).toContain("leftover");
    expect(i.fixes.some((f) => f.label.includes("cqv —"))).toBe(false);
  });
  it("doesn't flag a color that matches the item's built-in color", () => {
    expect(lint("ItemDisplay[fort]: %GOLD%%NAME%").some((i) => i.check === "out.builtin-color")).toBe(false);
    expect(lint("ItemDisplay[fort]: %RED%%NAME%").some((i) => i.check === "out.builtin-color")).toBe(true);
  });
  it("unused wrapper aliases: all reported unused, none reported for expansion order", () => {
    const text = [
      "Alias[OSUNI1]: (uap UNI)",
      "Alias[OSUNIETH1]: (uap UNI ETH)",
      "Alias[ONESTARUNIQUE]: (OSUNI1)",
      "Alias[ONESTARUNIQUEETH]: (OSUNIETH1)",
      "ItemDisplay[OSUNI1 OR OSUNIETH1]: %NAME%",
    ].join("\n");
    const issues = lint(text);
    expect(issues.filter((i) => i.check === "alias.unused").map((i) => i.line + 1)).toEqual([3, 4]);
    expect(issues.some((i) => i.check === "alias.order")).toBe(false);
  });
  it("still reports alias order when a rule does use the outer alias", () => {
    expect(lint("Alias[MARK]: ILVL>50\nAlias[OUTER]: (rin MARK)\nItemDisplay[OUTER]: %NAME%").some((i) => i.check === "alias.order")).toBe(true);
  });
});

describe("on the real file", () => {
  const f = "C:/Program Files/Diablo II/ProjectD2/filters/local/RoofooNewTesting.filter";
  it.skipIf(!fs.existsSync(f))("prints what the reviewed rules now say", () => {
    const doc = parseFilter(fs.readFileSync(f, "latin1"));
    const issues = lintDoc(doc);
    const at = (n: number) => issues.filter((i) => i.line + 1 === n).map((i) => `${i.check}: ${i.msg} | ${i.advice ?? ""} | ${i.fixes.map((x) => x.label).join(" / ")}`);
    console.log([...at(5641), ...at(7961)].join("\n"));
    const unused = issues.filter((i) => i.check === "alias.unused").map((i) => doc.lines[i.line].key);
    console.log("unused:", unused.filter((k) => /STAR/.test(k ?? "")).join(", "));
    console.log("alias.order:", issues.filter((i) => i.check === "alias.order").length);
  });
});
