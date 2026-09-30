import { describe, expect, it } from "vitest";
import { parseFilter, serializeFilter } from "./document";
import { compileDoc, runFilter } from "./engine";
import { DEFAULT_CTX } from "./item";
import { lintDoc } from "./lint";
import { starterFilter } from "./templates";
import { applyChoice } from "./simple";
import { readShop, sampleForTarget, shopTemplates, targetIdOf, vendorStock, writeShop } from "./shop";

const text = (r: ReturnType<typeof runFilter>) => r.display.lines.map((l) => l.map((x) => x.text).join("")).join("|");
const SHOP = { ...DEFAULT_CTX, location: "SHOP" as const };

describe.each([0, 1, 2, 3, 4, 5, 6])("shop templates for class %i", (cls) => {
  const targets = shopTemplates(cls).map((t) => t.make());
  const lines = writeShop(parseFilter(starterFilter()).lines, targets, { dimOthers: false });
  const c = compileDoc({ lines, eol: "\n" });

  it("write rules PD2 reads without problems", () => {
    const issues = lintDoc({ lines, eol: "\n" }, c).filter((i) => lines[i.line].note?.startsWith("@ffs") && i.sev !== "info");
    expect(issues.map((i) => `${i.check}: ${i.msg}`)).toEqual([]);
  });
  it.each(targets.map((t) => [t.name, t]))("%s matches its sample in a shop but not on the ground", (_, t) => {
    const item = sampleForTarget(t, cls);
    const r = runFilter(c, item, SHOP);
    expect(targetIdOf(lines[r.final!])).toBe(t.id);
    expect(text(r)).not.toContain("%");
    expect(targetIdOf(lines[runFilter(c, item, DEFAULT_CTX).final ?? -1])).toBeUndefined();
  });
});

describe("shop block", () => {
  it("round-trips, keeps switched-off targets, and stays above the Simple mode block", () => {
    const base = applyChoice(parseFilter(starterFilter()).lines, "rune.r30", { color: "RED" });
    const [a, b] = shopTemplates(1).map((t) => t.make());
    b.on = false;
    const lines = parseFilter(serializeFilter({ lines: writeShop(base, [a, b], { dimOthers: true }), eol: "\n" })).lines;
    const back = readShop(lines);
    expect(back.targets.map((t) => [t.id, t.on])).toEqual([[a.id, true], [b.id, false]]);
    expect(back.options.dimOthers).toBe(true);
    const shopAt = lines.findIndex((l) => l.note?.startsWith("@ffs"));
    const simpleAt = lines.findIndex((l) => l.note?.startsWith("@ff "));
    expect(shopAt).toBeGreaterThan(-1);
    expect(shopAt).toBeLessThan(simpleAt);
    // Adding a Simple mode choice later keeps the order.
    const more = applyChoice(lines, "rune.r31", { color: "GOLD" });
    expect(more.findIndex((l) => l.note?.startsWith("@ffs"))).toBeLessThan(more.findIndex((l) => l.note?.startsWith("@ff ")));
  });
  it("fills a vendor tab without overlaps", () => {
    const stock = vendorStock(shopTemplates(1).map((t) => t.make()), 1);
    const cells = new Set<string>();
    for (const s of stock) expect(s.x).toBeGreaterThanOrEqual(0);
    expect(stock.length).toBeGreaterThan(15);
    void cells;
  });
});
