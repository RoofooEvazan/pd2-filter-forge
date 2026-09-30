// Rule conditions: tokenising, building an expression tree exactly the way PD2's BH does it,
// evaluating against a test item, and serialising an edited tree back to text.
//
// BH quirks reproduced here (see ItemDisplay.cpp):
//  * Tokens are split on whitespace; "!", "(" and ")" are peeled off the ends of each token.
//  * Adjacent operands get an implicit AND.
//  * AND and OR share one precedence level and apply left-to-right: A OR B C == (A OR B) AND C.
//  * A value code without a comparison (e.g. "ILVL") never matches.
//  * Unrecognised tokens are silently dropped.
import { COND_BY_CODE, PARAM_PREFIXES, type CondKeyword } from "./spec";
import { lookupCode, type BaseItem } from "./data";
import { expandAliases, type Definitions } from "./document";
import { evalFormula, findIslands, tryCompile, FormulaRuntimeError, type FNode } from "./formula";
import { gemInfo, has, paramValue, rawStat, runeNumber, statValue, valueOf, type TestItem, type ViewContext } from "./item";
import { bhLeaves, parseBh, type BhLeaf, type BhNode, type BhResult } from "./bh";

export type Op = "=" | "<" | ">" | "~";
export type CondClass = "flag" | "value" | "param" | "item" | "add" | "alias" | "formula" | "inline" | "unknown";

export interface Leaf {
  text: string;
  key: string;
  op?: Op;
  v?: number;
  v2?: number;
  cls: CondClass;
  kw?: CondKeyword;
  /** For param codes: the prefix (STAT, SK, MULTI...) and numbers. */
  prefix?: string;
  params?: number[];
  base?: BaseItem;
  /** Inline formula body / formula key. */
  formula?: string;
  /** Problems found while reading this token. */
  issue?: string;
  /** Item code as compared (first 4 characters). */
  code?: string;
  /** Add-condition parts BH actually sums. */
  parts?: { name: string; params: number[] }[];
  /** Compiled formula / island. */
  fnode?: FNode;
  islands?: Map<string, FNode>;
}

export type Tok = { t: "lp" } | { t: "rp" } | { t: "not" } | { t: "and" } | { t: "or" } | { t: "leaf"; leaf: Leaf };

// ------------------------------------------------------------------ tokenising

function splitKeyOp(tok: string): { key: string; op?: Op; v?: number; v2?: number; bad?: boolean } {
  const i = tok.search(/[<=>~]/);
  if (i < 0) return { key: tok };
  const key = tok.slice(0, i).trim();
  const op = tok[i] as Op;
  const rest = tok.slice(i + 1).trim();
  if (op === "~" && rest.includes("-")) {
    const [a, b] = rest.split("-");
    const v = parseInt(a, 10);
    const v2 = parseInt(b, 10);
    return { key, op, v, v2, bad: Number.isNaN(v) || Number.isNaN(v2) };
  }
  const v = parseInt(rest, 10);
  return { key, op, v, bad: rest !== "" && Number.isNaN(v) };
}

export function classify(text: string, defs?: Definitions): Leaf {
  const { key, op, v, v2, bad } = splitKeyOp(text);
  const leaf: Leaf = { text, key, op, v, v2, cls: "unknown" };
  if (bad) leaf.issue = "The value after the comparison isn't a whole number.";

  const kw = COND_BY_CODE.get(key);
  if (kw && kw.kind !== "logic") {
    leaf.kw = kw;
    leaf.cls = kw.kind === "param" ? "param" : kw.kind;
    if (kw.kind === "value" && !op) leaf.issue = `${key} needs a comparison like ${key}>0 — on its own it never matches.`;
    if (kw.kind === "flag" && op) leaf.issue = `${key} is a yes/no condition; the "${op}${rest(text, key)}" part is ignored.`;
    return leaf;
  }
  if (defs?.aliases.has(key)) {
    leaf.cls = "alias";
    return leaf;
  }
  if (key.startsWith("ISLAND_") || key.startsWith("$f(")) {
    leaf.cls = "inline";
    return leaf;
  }
  if (key.length >= 3 && !/[A-Z]/.test(key.slice(0, 3))) {
    leaf.cls = "item";
    leaf.base = lookupCode(key);
    if (!leaf.base) leaf.issue = `No item has the code "${key.slice(0, 4)}".`;
    if (op) leaf.issue = "Item codes don't take comparisons.";
    return leaf;
  }
  if (key.includes("+")) {
    leaf.cls = "add";
    if (!op) leaf.issue = "Added stats need a comparison, e.g. FRES+CRES>40.";
    return leaf;
  }
  for (const p of PARAM_PREFIXES) {
    if (key.startsWith(p)) {
      const m = key.slice(p.length).match(p === "MULTI" ? /^(\d+),(\d+)$/ : /^(\d+)$/);
      if (!m) break;
      leaf.cls = "param";
      leaf.prefix = p;
      leaf.params = m.slice(1).map(Number);
      leaf.kw = COND_BY_CODE.get(p);
      if (!op) leaf.issue = `${key} needs a comparison like ${key}>0 — on its own it never matches.`;
      return leaf;
    }
  }
  if (key.startsWith("FORMULA")) {
    leaf.cls = "formula";
    leaf.formula = key.slice(7);
    if (defs && !defs.formulas.has(leaf.formula)) leaf.issue = `No Formula[${leaf.formula}] is defined.`;
    return leaf;
  }
  if (/^[a-z]/.test(key) && key.length < 3) leaf.issue = "Item codes are at least 3 characters.";
  else leaf.issue = `PD2 doesn't recognise "${key}" and will silently skip it.`;
  return leaf;
}
const rest = (text: string, key: string) => text.slice(key.length + 1);

/** Tokenise a condition string. Inline $f(...) formulas stay whole. */
export function tokenize(cond: string, defs?: Definitions): Tok[] {
  // Protect inline formulas from whitespace splitting and paren peeling.
  const islands = findIslands(cond);
  let s = cond;
  for (let i = islands.length - 1; i >= 0; i--) s = s.slice(0, islands[i].start) + `\u0000${i}\u0000` + s.slice(islands[i].end);
  const restore = (t: string) => t.replace(/\u0000(\d+)\u0000/g, (_, n) => cond.slice(islands[+n].start, islands[+n].end));

  const out: Tok[] = [];
  for (const raw of s.split(/\s+/).filter(Boolean)) {
    let i = 0;
    for (; i < raw.length && "!()".includes(raw[i]); i++) out.push(raw[i] === "!" ? { t: "not" } : raw[i] === "(" ? { t: "lp" } : { t: "rp" });
    let j = raw.length;
    const tail: Tok[] = [];
    for (; j > i && "!()".includes(raw[j - 1]); j--) tail.unshift(raw[j - 1] === "!" ? { t: "not" } : raw[j - 1] === "(" ? { t: "lp" } : { t: "rp" });
    const body = raw.slice(i, j);
    if (body) {
      if (body === "AND" || body === "&&") out.push({ t: "and" });
      else if (body === "OR" || body === "||") out.push({ t: "or" });
      else {
        const text = restore(body);
        const leaf = text.includes("$f(") ? inlineLeaf(text) : classify(text, defs);
        out.push({ t: "leaf", leaf });
      }
    }
    out.push(...tail);
  }
  return out;
}

function inlineLeaf(text: string): Leaf {
  const isl = findIslands(text)[0];
  const after = text.slice(isl.end);
  const m = after.match(/^\s*([<=>~])\s*(-?\d+)(?:-(\d+))?/);
  const leaf: Leaf = { text, key: text, cls: "inline", formula: isl.body };
  if (m) {
    leaf.op = m[1] as Op;
    leaf.v = Number(m[2]);
    if (m[3]) leaf.v2 = Number(m[3]);
  }
  const c = tryCompile(isl.body);
  if (c.error) leaf.issue = `Formula problem: ${c.error.message}`;
  else leaf.fnode = c.node;
  return leaf;
}

// ------------------------------------------------------------------ tree (BH semantics)

export type Node = { t: "and" | "or"; items: Node[] } | { t: "not"; item: Node } | { t: "leaf"; leaf: Leaf };

export interface ParseResult {
  tree: Node | null;
  error?: string;
  /** The rule mixes AND and OR outside parentheses, so left-to-right order matters. */
  mixed?: boolean;
}

type RTok = Tok | { t: "_and" };

export function buildTree(tokens: Tok[]): ParseResult {
  // 1. insert implicit ANDs exactly as BH's AddOperand / AddNonOperand do
  const infix: RTok[] = [];
  let last: "operand" | "rp" | "other" = "other";
  for (const t of tokens) {
    if (t.t === "leaf") {
      if (last === "operand" || last === "rp") infix.push({ t: "and" });
      infix.push(t);
      last = "operand";
    } else if (t.t === "not" || t.t === "lp") {
      if (last === "operand" || last === "rp") infix.push({ t: "and" });
      infix.push(t);
      last = "other";
    } else {
      infix.push(t);
      last = t.t === "rp" ? "rp" : "other";
    }
  }
  // 2. BH's shunting-yard: a binary operator pops every operator (binary or NOT) above it
  const outQ: RTok[] = [];
  const stack: RTok[] = [];
  // Operators seen at each parenthesis depth, to spot AND/OR mixed without grouping.
  const levels: Set<string>[] = [new Set()];
  let mixed = false;
  for (const t of infix) {
    if (t.t === "leaf") outQ.push(t);
    else if (t.t === "and" || t.t === "or") {
      const seen = levels[levels.length - 1];
      seen.add(t.t);
      if (seen.size > 1) mixed = true;
      while (stack.length) {
        const top = stack[stack.length - 1];
        if (top.t === "and" || top.t === "or" || top.t === "not") outQ.push(stack.pop()!);
        else break;
      }
      stack.push(t);
    } else if (t.t === "not") stack.push(t);
    else if (t.t === "lp") {
      stack.push(t);
      levels.push(new Set());
    } else if (t.t === "rp") {
      if (levels.length > 1) levels.pop();
      let found = false;
      while (stack.length) {
        const top = stack.pop()!;
        if (top.t === "lp") {
          found = true;
          break;
        }
        outQ.push(top);
      }
      if (!found) return { tree: null, error: "There's a ) without a matching (.", mixed };
    }
  }
  while (stack.length) {
    const top = stack.pop()!;
    if (top.t === "lp") return { tree: null, error: "There's a ( that is never closed.", mixed };
    outQ.push(top);
  }
  // 3. RPN -> tree
  const st: Node[] = [];
  for (const t of outQ) {
    if (t.t === "leaf") st.push({ t: "leaf", leaf: t.leaf });
    else if (t.t === "not") {
      const a = st.pop();
      if (!a) return { tree: null, error: "A ! isn't followed by anything to negate.", mixed };
      st.push({ t: "not", item: a });
    } else if (t.t === "and" || t.t === "or") {
      const b = st.pop();
      const a = st.pop();
      if (!a || !b) return { tree: null, error: `${t.t.toUpperCase()} is missing a condition on one side.`, mixed };
      st.push({ t: t.t, items: [a, b] });
    }
  }
  if (st.length > 1) return { tree: null, error: "Couldn't combine all the conditions.", mixed };
  return { tree: st[0] ? flatten(st[0]) : null, mixed };
}

/** Merge nested same-type groups so A AND (B AND C) becomes one AND of three items. */
export function flatten(n: Node): Node {
  if (n.t === "leaf") return n;
  if (n.t === "not") return { t: "not", item: flatten(n.item) };
  const items: Node[] = [];
  for (const c of n.items.map(flatten)) {
    if (c.t === n.t) items.push(...c.items);
    else items.push(c);
  }
  return { t: n.t, items };
}

export function parseCondition(cond: string, defs?: Definitions): ParseResult & { tokens: Tok[] } {
  const tokens = tokenize(cond, defs);
  return { ...buildTree(tokens), tokens };
}

// ------------------------------------------------------------------ serialising

export function serializeTree(n: Node | null, top = true): string {
  if (!n) return "";
  switch (n.t) {
    case "leaf":
      return n.leaf.text;
    case "not": {
      const inner = serializeTree(n.item, false);
      return n.item.t === "leaf" ? `!${inner}` : `!(${inner})`;
    }
    case "and":
    case "or": {
      if (n.items.length === 0) return "";
      if (n.items.length === 1) return serializeTree(n.items[0], top);
      const parts = n.items.map((c) => {
        const s = serializeTree(c, false);
        return (c.t === "and" || c.t === "or") && c.items.length > 1 ? `(${s})` : s;
      });
      return parts.join(n.t === "and" ? " " : " OR ");
    }
  }
}

// ------------------------------------------------------------------ evaluation
// Semantics follow BH's Condition classes; see docs/PD2-Filter-Engine-Reference.md §7.

/** BH's weapon subgroup is the first matching ancestor type in this order (Item.cpp:320-378). */
const WEAPON_CHAIN = ["club", "mace", "hamm", "wand", "staf", "bow", "axe", "scep", "swor", "knif", "jave", "spea", "pole", "xbow"];
function weaponGroup(b: BaseItem | undefined): string | undefined {
  if (!b || b.cat !== "weapon") return undefined;
  return WEAPON_CHAIN.find((t) => b.tc.includes(t));
}
const wg = (...g: string[]) => (_: TestItem, b: BaseItem | undefined) => g.includes(weaponGroup(b) ?? "");
/** PD2 throwing potions aren't in BH's hand table, so they are neither 1H nor 2H. */
const outsideHandTable = (b: BaseItem | undefined) => !!b && /^tp..$/.test(b.c);

const FLAG_TEST: Record<string, (it: TestItem, b: BaseItem | undefined, ctx: ViewContext) => boolean> = {
  TRUE: () => true,
  FALSE: () => false,
  NMAG: (it) => it.quality === "inferior" || it.quality === "normal" || it.quality === "superior",
  MAG: (it) => it.quality === "magic",
  RARE: (it) => it.quality === "rare",
  SET: (it) => it.quality === "set",
  UNI: (it) => it.quality === "unique",
  CRAFT: (it) => it.quality === "crafted",
  NORM: (_, b) => (b?.tier ?? "n") === "n",
  EXC: (_, b) => b?.tier === "x",
  ELT: (_, b) => b?.tier === "e",
  ID: (it) => it.identified,
  INF: (it) => it.quality === "inferior",
  SUP: (it) => it.quality === "superior",
  ETH: (it) => it.ethereal,
  RW: (it) => it.runeword,
  GEMMED: (it) => it.gemmed || it.runeword,
  FOOLS: (it) => it.fools,
  ARMOR: (_, b) => b?.cat === "armor",
  WEAPON: (_, b) => b?.cat === "weapon",
  JEWELRY: (_, b) => has(b, "ring", "amul"),
  CHARM: (_, b) => has(b, "char"),
  QUIVER: (_, b) => has(b, "bowq", "xboq"),
  MISC: (_, b) => b?.cat === "misc",
  CLASS: (_, b) => has(b, "pelt", "phlm", "ashd", "head", "h2h", "orb", "amaz"),
  // Circlets are their own group, never HELM (Item.cpp:441-448).
  HELM: (_, b) => b?.cat === "armor" && has(b, "helm") && !has(b, "circ"),
  CHEST: (_, b) => has(b, "tors"),
  // "shld" (any shield) covers paladin and necromancer shields too (Item.cpp:465).
  SHIELD: (_, b) => b?.cat === "armor" && has(b, "shld"),
  GLOVES: (_, b) => has(b, "glov"),
  BOOTS: (_, b) => has(b, "boot"),
  BELT: (_, b) => has(b, "belt"),
  CIRC: (_, b) => has(b, "circ"),
  AXE: wg("axe"),
  MACE: wg("club", "mace", "hamm"),
  CLUB: wg("club"),
  TMACE: wg("mace"),
  HAMMER: wg("hamm"),
  SWORD: wg("swor"),
  DAGGER: wg("knif"),
  THROWING: (_, b) => b?.cat === "weapon" && has(b, "thro"),
  JAV: wg("jave"),
  SPEAR: wg("spea"),
  POLEARM: wg("pole"),
  BOW: wg("bow"),
  XBOW: wg("xbow"),
  STAFF: wg("staf"),
  WAND: wg("wand"),
  SCEPTER: wg("scep"),
  "1H": (_, b) => b?.cat === "weapon" && b.hand === "1" && !outsideHandTable(b),
  "2H": (_, b) => b?.cat === "weapon" && (b.hand === "2" || b.hand === "12") && !outsideHandTable(b),
  DRU: (_, b) => has(b, "pelt"),
  BAR: (_, b) => has(b, "phlm"),
  DIN: (_, b) => has(b, "ashd"),
  NEC: (_, b) => has(b, "head"),
  SIN: (_, b) => has(b, "h2h"),
  SOR: (_, b) => has(b, "orb"),
  ZON: (_, b) => has(b, "amaz"),
  AMAZON: (_, __, c) => c.cls === 0,
  SORCERESS: (_, __, c) => c.cls === 1,
  NECROMANCER: (_, __, c) => c.cls === 2,
  PALADIN: (_, __, c) => c.cls === 3,
  BARBARIAN: (_, __, c) => c.cls === 4,
  DRUID: (_, __, c) => c.cls === 5,
  ASSASSIN: (_, __, c) => c.cls === 6,
  GROUND: (_, __, c) => c.location === "GROUND",
  SHOP: (_, __, c) => c.location === "SHOP",
  EQUIPPED: (_, __, c) => c.location === "EQUIPPED" || c.location === "MERC",
  MERC: (_, __, c) => c.location === "MERC",
  INVENTORY: (_, __, c) => c.location === "INVENTORY",
  STASH: (_, __, c) => c.location === "STASH",
  CUBE: (_, __, c) => c.location === "CUBE",
};

export function compare(val: number, op: Op | undefined, v = 0, v2 = 0): boolean {
  switch (op) {
    case "=":
      return val === v;
    case "<":
      return val < v;
    case ">":
      return val > v;
    case "~":
      return v <= val && val <= v2;
    default:
      return false; // BH: a value condition without an operator never matches
  }
}

export interface EvalEnv {
  item: TestItem;
  ctx: ViewContext;
  defs: Definitions;
  formulaCache?: Map<string, FNode | null>;
}

function compiled(env: EvalEnv, src: string): FNode | null {
  const cache = (env.formulaCache ??= new Map());
  if (!cache.has(src)) cache.set(src, tryCompile(src).node ?? null);
  return cache.get(src)!;
}

const CL_FLAGS = ["", "DRU", "BAR", "DIN", "NEC", "SIN", "SOR", "ZON"];
const EQ_FLAGS = ["", "HELM", "CHEST", "SHIELD", "GLOVES", "BOOTS", "BELT", "CIRC"];
const WP_FLAGS = ["", "AXE", "MACE", "SWORD", "DAGGER", "THROWING", "JAV", "SPEAR", "POLEARM", "BOW", "XBOW", "STAFF", "WAND", "SCEPTER"];

/** Value of a formula variable (upper-case name) the way BH's formulaVarDefs resolve it. */
export function resolveCode(name: string, params: number[], env: EvalEnv): number {
  const { item, ctx } = env;
  const base = lookupCode(item.code);
  const code = name.toUpperCase();
  const flag = (k: string) => +(FLAG_TEST[k]?.(item, base, ctx) ?? false);
  switch (code) {
    case "CL":
      if (!(params[0] >= 1 && params[0] <= 7)) throw new FormulaRuntimeError(`CL${params[0]} is out of range (1–7)`);
      return flag(CL_FLAGS[params[0]]);
    case "EQ":
      if (!(params[0] >= 1 && params[0] <= 7)) throw new FormulaRuntimeError(`EQ${params[0]} is out of range (1–7)`);
      return flag(EQ_FLAGS[params[0]]);
    case "WP":
      if (!(params[0] >= 1 && params[0] <= 13)) throw new FormulaRuntimeError(`WP${params[0]} is out of range (1–13)`);
      return flag(WP_FLAGS[params[0]]);
    case "CLSK":
      if (!(params[0] >= 0 && params[0] <= 6)) throw new FormulaRuntimeError(`CLSK${params[0]} is out of range (0–6)`);
      return paramValue("CLSK", params, item, ctx);
    case "ONEHAND":
      return flag("1H");
    case "TWOHAND":
      return flag("2H");
    case "CHARSTAT":
      // Raw player stat: life and mana stay in 1/256 units.
      return (ctx.charstats[params[0]] ?? 0) * (params[0] === 7 || params[0] === 9 ? 256 : 1);
  }
  if (params.length && ["STAT", "MULTI", "SK", "OS", "CHSK", "TABSK"].includes(code)) return paramValue(code, params, item, ctx);
  const kw = COND_BY_CODE.get(code);
  if (kw && kw.kind === "flag") return flag(kw.code);
  const v = valueOf(kw?.code ?? code, item, ctx);
  return v ?? 0;
}

function runFormula(node: FNode, env: EvalEnv): { v: number; error: boolean } {
  try {
    return { v: evalFormula(node, (n, p) => resolveCode(n, p, env)), error: false };
  } catch (e) {
    if (e instanceof FormulaRuntimeError) return { v: 0, error: true };
    throw e;
  }
}

/** Value of a Formula[] by reference name, for output and add conditions. */
export function formulaValue(ref: string, env: EvalEnv): { v: number; error: boolean } | null {
  const node = compiledFormulas(env.defs).get(ref.toUpperCase());
  return node ? runFormula(node, env) : null;
}

const ADD_STAT: Record<string, number> = { LIFE: 7, MANA: 9, STR: 0, DEX: 2, CRES: 43, FRES: 39, LRES: 41, PRES: 45, EDEF: 16, EDAM: 17, FCR: 105, AR: 19, REPLIFE: 74 };

function addPartValue(part: { name: string; params: number[] }, env: EvalEnv, islands?: Map<string, FNode>): { v: number; isFormula: boolean } {
  const { item, ctx } = env;
  if (part.name === "STAT") return { v: rawStat(item, part.params[0]), isFormula: false };
  if (part.name === "MULTI") return { v: paramValue("MULTI", part.params, item, ctx), isFormula: false };
  if (part.name === "MINDMG" || part.name === "MAXDMG") return { v: valueOf(part.name, item, ctx) ?? 0, isFormula: false };
  if (ADD_STAT[part.name] != null) return { v: statValue(item, ADD_STAT[part.name]), isFormula: false };
  const node = compiledFormulas(env.defs).get(part.name) ?? islands?.get(part.name);
  if (node) {
    const r = runFormula(node, env);
    return { v: r.error ? 0 : r.v, isFormula: true };
  }
  return { v: 0, isFormula: false };
}

export function evalLeaf(leaf: Leaf, env: EvalEnv): boolean {
  const { item, ctx } = env;
  const base = lookupCode(item.code);
  switch (leaf.cls) {
    case "flag":
      return FLAG_TEST[leaf.kw!.code]?.(item, base, ctx) ?? false;
    case "item":
      // Exact 4-character compare: "r33" does not match the stacked "r33s".
      return item.code.slice(0, 4) === (leaf.code ?? leaf.key.slice(0, 4));
    case "value": {
      const code = leaf.kw!.code;
      if (code === "PREFIX" || code === "SUFFIX") {
        if (leaf.op === "<" || leaf.op === ">") return false;
        if (item.quality === "rare" && !item.identified) return false;
        if (item.quality === "unique" || item.quality === "set") return false;
        const ids = code === "PREFIX" ? item.prefixes : item.suffixes;
        return ids.some((id) => id > 0 && compare(id, leaf.op, leaf.v, leaf.v2));
      }
      if (code === "AUTOMOD" && (item.quality === "magic" || item.quality === "rare") && !item.identified) return false;
      // These only apply to their own item kind; on anything else they are false.
      if (code === "GOLD" && item.code !== "gld") return false;
      if (code === "RUNE" && !runeNumber(item.code)) return false;
      if ((code === "GEMLEVEL" || code === "GEMTYPE") && !gemInfo(base).type) return false;
      if (code === "MAPID" && ctx.mapid <= 0) return false;
      // RES: every one of the four resistances must pass (ItemDisplay.cpp:5164).
      if (code === "RES") return [39, 41, 43, 45].every((id) => compare(statValue(item, id), leaf.op, leaf.v, leaf.v2));
      const v = valueOf(code, item, ctx);
      return v != null && compare(v, leaf.op, leaf.v, leaf.v2);
    }
    case "param":
      return compare(paramValue(leaf.prefix ?? leaf.kw!.code, leaf.params ?? [], item, ctx), leaf.op, leaf.v, leaf.v2);
    case "add": {
      let sum = 0;
      for (const part of leaf.parts ?? []) sum += addPartValue(part, env, leaf.islands).v;
      // Only the lower bound is passed along, so "~" compares lo <= sum <= 0.
      return compare(sum, leaf.op, leaf.v, 0);
    }
    case "formula":
    case "inline": {
      const node = leaf.fnode ?? (leaf.formula ? compiled(env, leaf.formula) : null);
      if (!node) return false;
      const r = runFormula(node, env);
      if (r.error) return false;
      return leaf.op ? compare(r.v, leaf.op, leaf.v, leaf.v2) : r.v !== 0; // NaN counts as true
    }
    default:
      return false;
  }
}

export function evalTree(n: Node | null, env: EvalEnv): boolean {
  if (!n) return true; // no conditions: BH matches every item
  switch (n.t) {
    case "leaf":
      return evalLeaf(n.leaf, env);
    case "not":
      return !evalTree(n.item, env);
    case "and":
      return n.items.every((c) => evalTree(c, env));
    case "or":
      return n.items.some((c) => evalTree(c, env));
  }
}

// ------------------------------------------------------------------ compiling (BH-faithful)

const formulaCache = new WeakMap<Definitions, Map<string, FNode>>();
const failedCache = new WeakMap<Definitions, Set<string>>();

/** Formulas as BH registers them: "FORMULA"+KEY upper-cased; ones that don't compile are skipped. */
export function compiledFormulas(defs: Definitions): Map<string, FNode> {
  let m = formulaCache.get(defs);
  if (!m) {
    m = new Map();
    const failed = new Set<string>();
    for (const [key, { value }] of defs.formulas) {
      const c = tryCompile(value);
      if (c.node) m.set(`FORMULA${key}`, c.node);
      else failed.add(`FORMULA${key}`);
    }
    formulaCache.set(defs, m);
    failedCache.set(defs, failed);
  }
  return m;
}

function toLeaf(b: BhLeaf): Leaf {
  return {
    text: b.text,
    key: b.key,
    op: b.op,
    v: b.v,
    v2: b.v2,
    cls: b.cls === "island" ? "inline" : b.cls,
    kw: b.kw,
    prefix: b.prefix,
    params: b.params,
    base: b.base,
    code: b.code,
    parts: b.parts,
    fnode: b.formula,
    formula: b.formulaKey?.startsWith("FORMULA") ? b.formulaKey.slice(7) : undefined,
  };
}

function toNode(b: BhNode, islands: Map<string, FNode>): Node {
  if (b.t === "leaf") return { t: "leaf", leaf: { ...toLeaf(b.leaf), islands } };
  if (b.t === "not") return { t: "not", item: toNode(b.a, islands) };
  return { t: b.t, items: [toNode(b.a, islands), toNode(b.b, islands)] };
}

export interface CompiledCondition extends ParseResult {
  bh: BhResult;
}

/** Compile a rule's conditions exactly as the game does (aliases expanded, BH parser). */
export function compileCondition(cond: string, defs: Definitions): CompiledCondition {
  const formulas = compiledFormulas(defs);
  const expanded = expandAliases(cond, defs.aliases, "cond");
  const bh = parseBh(expanded, { formulas, failedFormulas: failedCache.get(defs) });
  // Islands are referenced by name from add conditions; collect them for evaluation.
  const islands = new Map<string, FNode>();
  for (const l of bhLeaves(bh.tree)) if (l.cls === "island" && l.formula) islands.set(l.key, l.formula);
  if (bh.never) return { tree: null, error: "PD2 can't build this rule, so it never matches.", bh };
  return { tree: bh.tree ? flatten(toNode(bh.tree, islands)) : null, bh };
}

/** Every item code referenced by a condition (after alias expansion). */
export function referencedCodes(cond: string, defs: Definitions): string[] {
  return bhLeaves(parseBh(expandAliases(cond, defs.aliases, "cond"), { formulas: compiledFormulas(defs) }).tree)
    .filter((l) => l.cls === "item")
    .map((l) => l.code!);
}
