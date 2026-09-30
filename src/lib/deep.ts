// Deep checks: for each rule, build an item it targets and run the whole filter on it, to find rules
// that an earlier rule overrides, notifications that never fire, and descriptions that get wiped.
// Heuristic (it only tests one example item per rule), so results are reported as "likely".
import type { FilterDoc } from "./document";
import type { Compiled, CompiledRule } from "./engine";
import { runFilter } from "./engine";
import { evalTree } from "./conditions";
import { bhLeaves, requiredLeaves, type BhNode } from "./bh";
import { sampleItem } from "./sample";
import { DEFAULT_CTX, type TestItem, type ViewContext } from "./item";
import { CHECK_BY_ID, IMPACTS, type Issue } from "./lint";
import { lookupCode } from "./data";

const CLASS_FLAGS = ["AMAZON", "SORCERESS", "NECROMANCER", "PALADIN", "BARBARIAN", "DRUID", "ASSASSIN"];
const LOCATIONS = ["GROUND", "SHOP", "EQUIPPED", "MERC", "INVENTORY", "STASH", "CUBE"] as const;

/** A viewing context that satisfies the rule's own character/level/location requirements. */
function contextFor(r: CompiledRule, levels: number): ViewContext {
  const ctx: ViewContext = { ...DEFAULT_CTX, filtlvl: 1, location: "GROUND", charstats: {} };
  let lo = 0;
  let hi = Math.max(1, levels);
  for (const leaf of requiredLeaves(r.bh.tree)) {
    const k = leaf.kw?.code;
    if (!k) continue;
    const ci = CLASS_FLAGS.indexOf(k);
    if (ci >= 0) ctx.cls = ci;
    if ((LOCATIONS as readonly string[]).includes(k)) ctx.location = k as ViewContext["location"];
    if (k === "FILTLVL") {
      if (leaf.op === ">") lo = Math.max(lo, leaf.v + 1);
      if (leaf.op === "<") hi = Math.min(hi, leaf.v - 1);
      if (leaf.op === "=") lo = hi = leaf.v;
      if (leaf.op === "~") [lo, hi] = [Math.max(lo, leaf.v), Math.min(hi, leaf.v2)];
    }
    if (k === "CLVL" && leaf.op === ">") ctx.clvl = Math.min(99, leaf.v + 1);
    if (k === "CLVL" && leaf.op === "<") ctx.clvl = Math.max(1, leaf.v - 1);
    if (k === "DIFF" && leaf.op === "=") ctx.diff = leaf.v;
    if (k === "MAPID" && leaf.op === "=") ctx.mapid = leaf.v;
  }
  ctx.filtlvl = Math.max(1, Math.min(lo || 1, hi));
  if (lo > hi) ctx.filtlvl = lo;
  return ctx;
}

const SITUATIONAL = new Set(["CLVL", "DIFF", "MAPID", "CRAFTALVL", "REROLLALVL", "REQLVL", "UPLVL", "PRICE", "BUYPRICE", "CHARSTAT", "GOODSK", "GOODTBSK", ...CLASS_FLAGS, ...LOCATIONS]);
function dependsOnSituation(r: CompiledRule | undefined): boolean {
  return !!r && bhLeaves(r.bh.tree).some((l) => (l.kw && SITUATIONAL.has(l.kw.code)) || l.prefix === "CHARSTAT");
}

/** Filter levels the rule can apply at (at least level 1). */
function levelRange(r: CompiledRule, levels: number): number[] {
  const out: number[] = [];
  for (let lv = 1; lv <= Math.max(1, Math.min(12, levels)); lv++) {
    const ok = requiredLeaves(r.bh.tree).every((leaf) => {
      if (leaf.kw?.code !== "FILTLVL") return true;
      switch (leaf.op) {
        case ">": return lv > leaf.v;
        case "<": return lv < leaf.v;
        case "=": return lv === leaf.v;
        case "~": return lv >= leaf.v && lv <= leaf.v2;
      }
      return true;
    });
    if (ok) out.push(lv);
  }
  return out.length ? out : [1];
}

function mk(check: string, doc: FilterDoc, index: number, msg: string): Issue {
  const def = CHECK_BY_ID.get(check)!;
  return { check, line: index, id: doc.lines[index].id, sev: IMPACTS[def.impact].sev, msg, fixes: [] };
}

/** Item codes the rule is about: required directly, or as an OR of alternatives. */
function targetCodes(n: BhNode | null): string[] {
  if (!n) return [];
  if (n.t === "leaf") return n.leaf.cls === "item" && n.leaf.base ? [n.leaf.code!] : [];
  if (n.t === "and") return [...targetCodes(n.a), ...targetCodes(n.b)];
  if (n.t === "or") {
    const a = targetCodes(n.a);
    const b = targetCodes(n.b);
    return a.length && b.length ? [...a, ...b] : [];
  }
  return [];
}

export interface DeepProgress {
  done: number;
  total: number;
  issues: Issue[];
}

/** Run the deep checks in small slices so the UI stays responsive. */
export async function runDeepChecks(doc: FilterDoc, c: Compiled, onProgress: (p: DeepProgress) => void, signal: { cancelled: boolean }): Promise<Issue[]> {
  const issues: Issue[] = [];
  const rules = c.rules.filter((r) => !r.error);
  const levels = c.defs.levels.length;
  const byIndex = new Map(c.rules.map((r) => [r.index, r]));
  const line = (i: number) => i + 1;
  let lastYield = performance.now();
  const memo = new Map<string, ReturnType<typeof runFilter>>();
  for (let k = 0; k < rules.length; k++) {
    if (signal.cancelled) break;
    const r = rules[k];
    // Only rules aimed at specific items give a trustworthy example item.
    if (!targetCodes(r.bh.tree).length) continue;
    const base = sampleItem(r.tree);
    const ctx0 = contextFor(r, levels);
    const run = (item: TestItem, ctx: ViewContext) => {
      const key = JSON.stringify([item, ctx]);
      let res = memo.get(key);
      if (!res) memo.set(key, (res = runFilter(c, item, ctx)));
      return res;
    };
    // Variants of the example item and every filter level the rule allows: a rule only counts as
    // shadowed if an earlier rule wins in all of them.
    const variants = [base, { ...base, qty: 7 }, { ...base, identified: !base.identified }, { ...base, ethereal: !base.ethereal }, { ...base, sockets: base.sockets ? 0 : 3 }, { ...base, ilvl: 40 }].filter((it) =>
      evalTree(r.tree, { item: it, ctx: ctx0, defs: c.defs })
    );
    if (!variants.length) continue;
    const lvls = levelRange(r, levels);
    const example = `${lookupCode(base.code)?.n ?? base.code}${base.quality !== "normal" ? ` (${base.quality})` : ""}`;
    let shadowedBy: number | null = null;
    let notifyBy: number | null = null;
    let reached = false;
    let notifyReached = !r.notifies;
    outer: for (const lv of lvls) {
      for (const it of variants) {
        const ctx = { ...ctx0, filtlvl: lv };
        if (!evalTree(r.tree, { item: it, ctx, defs: c.defs })) continue;
        const res = run(it, ctx);
        if (res.matched.includes(r.index) || res.final == null || res.final > r.index) reached = true;
        // An earlier rule that depends on the character, zone or location may let items through elsewhere.
        else if (dependsOnSituation(byIndex.get(res.final))) reached = true;
        else shadowedBy ??= res.final;
        if (r.notifies) {
          if (!res.notify || res.notify.index >= r.index || res.notify.icons.some((x) => x.index === r.index) || dependsOnSituation(byIndex.get(res.notify.index))) notifyReached = true;
          else notifyBy ??= res.notify.index;
        }
        if (reached && notifyReached) break outer;
      }
    }
    if (!reached && shadowedBy != null)
      issues.push(mk("flow.shadowed", doc, r.index, `For items like ${example}, line ${line(shadowedBy)} decides first at every filter level, so this rule is likely never reached.`));
    if (!notifyReached && notifyBy != null)
      issues.push(mk("flow.notify-shadowed", doc, r.index, `For items like ${example}, line ${line(notifyBy)} supplies the notification first, so this rule's icon/sound likely never fires.`));
    // A description only matters if the rule writes real text into it.
    if (reached && r.effects.cont && r.action.desc != null && r.action.desc.replace(/%NAME%|%[A-Z_]+%/g, "").trim() !== "") {
      const ctx = { ...ctx0, filtlvl: lvls[0] };
      const res = run(variants[0], ctx);
      if (res.matched.includes(r.index)) {
        const after = res.matched.filter((m) => m > r.index);
        const wIdx = after.findIndex((m) => byIndex.get(m)?.action.desc == null);
        const kIdx = after.findIndex((m) => byIndex.get(m)?.action.desc != null);
        if (wIdx >= 0 && (kIdx < 0 || wIdx < kIdx))
          issues.push(mk("flow.desc-wiped", doc, r.index, `For items like ${example}, line ${line(after[wIdx])} matches later without { }, which clears this description. End later rules with {%NAME%} to keep it.`));
      }
    }
    if (performance.now() - lastYield > 30) {
      onProgress({ done: k + 1, total: rules.length, issues: [...issues] });
      await new Promise((res) => setTimeout(res, 0));
      lastYield = performance.now();
    }
  }
  onProgress({ done: rules.length, total: rules.length, issues });
  return issues;
}
