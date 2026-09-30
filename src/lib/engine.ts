// Runs a whole filter against a test item the way PD2's BH module does.
// Reference: docs/PD2-Filter-Engine-Reference.md §10 (evaluation pipeline).
//  * Name pass: rules top to bottom; the first match without %CONTINUE% decides.
//  * Description pass: every matching rule replaces the description; a rule without {} clears it.
//  * Notification pass: over "map rules" only (icon, line or sound); rules silenced by %TIER% are
//    skipped; the first remaining match notifies, regardless of %CONTINUE% or hiding.
//  * Minimap icons: every matching map rule draws, up to the first without %CONTINUE%, if revealed.
import type { FilterDoc, Definitions } from "./document";
import { collectDefinitions } from "./document";
import { compileCondition, evalTree, type EvalEnv, type Node } from "./conditions";
import { buildAction, defaultNameMarked, finalize, isBlank, measure, nameLimit, resolveOutput, toLines, type Action, type Effects, type Rendered } from "./output";
import { defaultColor, type TestItem, type ViewContext } from "./item";
import type { BhResult } from "./bh";

export interface CompiledRule {
  index: number;
  id: string;
  tree: Node | null;
  /** Set when PD2 can't build the rule (it never matches). */
  error?: string;
  bh: BhResult;
  out: string;
  action: Action;
  effects: Effects;
  notifies: boolean;
}

export interface Compiled {
  defs: Definitions;
  rules: CompiledRule[];
}

// Compiling thousands of rules takes a while, so results are cached per (definitions, text) and
// only edited lines are recompiled.
let cacheSig = "";
let condCache = new Map<string, ReturnType<typeof compileCondition>>();
let lastDefs: Definitions | null = null;

function defsSignature(defs: Definitions) {
  return JSON.stringify([[...defs.aliases].map(([k, v]) => [k, v.value]), [...defs.formulas].map(([k, v]) => [k, v.value])]);
}

export function compileDoc(doc: FilterDoc): Compiled {
  let defs = collectDefinitions(doc.lines);
  const sig = defsSignature(defs);
  if (sig !== cacheSig || !lastDefs) {
    cacheSig = sig;
    condCache = new Map();
    lastDefs = defs;
  } else {
    // Same aliases and formulas: reuse the object so per-definition caches stay warm.
    lastDefs = { ...lastDefs, levels: defs.levels, aliases: lastDefs.aliases, formulas: lastDefs.formulas };
    defs = lastDefs;
  }
  const rules: CompiledRule[] = [];
  doc.lines.forEach((l, index) => {
    if (l.kind !== "rule" || l.disabled) return;
    const key = l.key ?? "";
    let c = condCache.get(key);
    if (!c) condCache.set(key, (c = compileCondition(key, defs)));
    const out = l.value ?? "";
    const action = buildAction(out, defs);
    rules.push({ index, id: l.id, tree: c.tree, error: c.error, bh: c.bh, out, action, effects: action.effects, notifies: action.isMap });
  });
  return { defs, rules };
}

export interface FilterResult {
  /** Line indexes of every rule that matched in the name pass, in order. */
  matched: number[];
  /** The rule that decided the display, if any. */
  final?: number;
  display: Rendered;
  hidden: boolean;
  /** The rule that supplied the text notification and sound. */
  notify?: { index: number; effects: Effects; suppressedByTier: false; icons: { index: number; effects: Effects }[] };
  /** Map rules that matched but were skipped because of %TIER%. */
  tierSkipped: number[];
}

export function runFilter(c: Compiled, item: TestItem, ctx: ViewContext): FilterResult {
  const env: EvalEnv = { item, ctx, defs: c.defs };
  const original = defaultNameMarked(item);
  let prev = { name: original, desc: "" };
  const matched: number[] = [];
  let final: number | undefined;
  const nlUsed = { n: 0 };

  for (const r of c.rules) {
    if (r.error) continue;
    if (!evalTree(r.tree, env)) continue;
    matched.push(r.index);
    const name = resolveOutput(r.action, "name", prev, env, nlUsed);
    const desc = r.action.desc != null ? resolveOutput(r.action, "desc", prev, env) : "";
    prev = { name, desc };
    if (!r.effects.cont) {
      final = r.index;
      break;
    }
  }

  let { s: name, truncated } = finalize(prev.name, nameLimit(ctx));
  let hidden = isBlank(name);
  // Filter level 0 is "Show All Items": an empty result falls back to the original name.
  if (hidden && ctx.filtlvl === 0) {
    hidden = false;
    name = finalize(original, nameLimit(ctx)).s;
  }
  const desc = finalize(prev.desc, null).s;

  let notify: FilterResult["notify"];
  const tierSkipped: number[] = [];
  for (const r of c.rules) {
    if (!r.notifies || r.error) continue;
    if (!evalTree(r.tree, env)) continue;
    const tier = r.effects.tier;
    if (ctx.filtlvl !== 0 && tier != null && tier < ctx.filtlvl) {
      tierSkipped.push(r.index);
      continue;
    }
    notify = { index: r.index, effects: r.effects, suppressedByTier: false, icons: [] };
    break;
  }
  if (notify) {
    for (const r of c.rules) {
      if (!r.notifies || r.error || !evalTree(r.tree, env)) continue;
      notify.icons.push({ index: r.index, effects: r.effects });
      if (!r.effects.cont) break;
    }
  }

  const m = measure(name);
  return {
    matched,
    final,
    hidden,
    notify,
    tierSkipped,
    display: { lines: toLines(name, defaultColor(item)), desc: desc ? toLines(desc, "BLUE") : [], hidden, truncated, ...m },
  };
}

/** Quick check of a single rule's conditions (used to light up rules in the list). */
export function ruleMatches(c: Compiled, index: number, item: TestItem, ctx: ViewContext): boolean {
  const r = c.rules.find((x) => x.index === index);
  if (!r || r.error) return false;
  return evalTree(r.tree, { item, ctx, defs: c.defs });
}
