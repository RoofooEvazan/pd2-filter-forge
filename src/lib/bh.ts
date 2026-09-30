// A line-by-line port of how PD2's BH module turns a rule's condition text into something it can
// evaluate (ItemDisplay.cpp: BuildConditions, ProcessConditions, Rule::Convert), recording every
// place where it silently drops, truncates or reinterprets what the author wrote.
// Reference: docs/PD2-Filter-Engine-Reference.md §5–§6.
import { COND_BY_CODE, type CondKeyword } from "./spec";
import { DATA, ITEM_BY_CODE, type BaseItem } from "./data";
import { findIslands, tryCompile, type FNode } from "./formula";

export type Op = "=" | "<" | ">" | "~";

export interface BhLeaf {
  /** Text of the token as the engine saw it (after alias/island replacement). */
  text: string;
  key: string;
  op?: Op;
  v: number;
  v2: number;
  cls: "flag" | "value" | "param" | "item" | "add" | "formula" | "island";
  kw?: CondKeyword;
  prefix?: string;
  params?: number[];
  /** For item codes: the 4 characters compared. */
  code?: string;
  base?: BaseItem;
  /** For add conditions: parts BH actually sums. */
  parts?: { name: string; params: number[] }[];
  formula?: FNode;
  formulaKey?: string;
}

export type BhNode = { t: "and" | "or"; a: BhNode; b: BhNode } | { t: "not"; a: BhNode } | { t: "leaf"; leaf: BhLeaf };

export type EventKind =
  | "dropped-unknown" // COND_NULL: token ignored
  | "dropped-bad-value" // value didn't parse: token and its trailing ) ! vanish
  | "dropped-param" // STATn/SKn… number missing or out of range
  | "dropped-formula" // FORMULAX not defined / didn't compile / wrong case
  | "two-char-op" // >= <= == != <>
  | "value-junk" // trailing text after the number ignored
  | "empty-value" // ILVL> means ILVL>0
  | "no-operator" // value keyword without comparison: always false
  | "op-ignored" // comparison on a flag or item code
  | "range-no-dash" // ~80: second bound 0
  | "range-inverted" // ~90-80
  | "item-unknown" // item code that no item has
  | "item-truncated" // longer than 4 characters
  | "item-looks-like-keyword" // eth, ilvl>5, and…
  | "add-part-skipped" // part of A+B that BH doesn't sum
  | "add-range" // ~ on add / GOODSK: never matches
  | "mid-token-paren" // ( ) ! inside a token
  | "stray-close" // ) without ( : rest of rule thrown away
  | "unclosed-open" // ( never closed: operators before it discarded
  | "never-matches" // Convert fails
  | "matches-everything" // nothing survived
  | "island-failed" // $f(...) didn't compile: raw text becomes junk tokens
  | "value-out-of-domain"; // BYTE targets and obvious domain issues

export interface BhEvent {
  kind: EventKind;
  token: string;
  detail?: string;
}

export interface BhResult {
  /** null = no conditions = matches every item. */
  tree: BhNode | null;
  /** Convert() failed: the rule never matches. */
  never: boolean;
  events: BhEvent[];
  /** Operand count that survived. */
  operands: number;
}

export interface BhContext {
  /** Compiled formulas by reference name (FORMULAKEY), as BH registers them. */
  formulas: Map<string, FNode>;
  /** Formula keys that exist in the file but failed to compile. */
  failedFormulas?: Set<string>;
}

const STAT_MAX = DATA.meta.statRecs;
const SKILL_MAX = DATA.meta.skillRecs;
const PREFIXES = ["SK", "OS", "CHSK", "CLSK", "TABSK", "STAT", "CHARSTAT", "MULTI"] as const;
const ADD_NAMES = new Set(["LIFE", "MANA", "STR", "DEX", "CRES", "FRES", "LRES", "PRES", "MINDMG", "MAXDMG", "EDEF", "EDAM", "FCR", "AR", "REPLIFE"]);
/** Targets BH stores as a BYTE (they wrap outside 0-255). */
const BYTE_TARGETS = new Set(["GEMLEVEL", "GEMTYPE", "RUNE", "ILVL", "QLVL", "ALVL", "MAPID", "CRAFTALVL", "REROLLALVL", "LVLREQ"]);

const isUpper = (c: string | undefined) => !!c && c !== c.toLowerCase() && c === c.toUpperCase();

/** C++ `wstringstream >> int`: optional sign then digits; trailing junk ignored; fail if none or overflow. */
function readInt(s: string): { ok: boolean; v: number; junk: boolean } {
  const m = s.match(/^[+-]?\d+/);
  if (!m) return { ok: false, v: 0, junk: false };
  const v = Number(m[0]);
  if (v > 2147483647 || v < -2147483648) return { ok: false, v: 0, junk: false };
  return { ok: true, v, junk: m[0].length < s.length };
}

const trimW = (s: string) => s.replace(/^ +| +$/g, "").replace(/^\t+|\t+$/g, "");

type RTok = { t: "and" | "or" | "not" | "lp" | "rp" } | { t: "leaf"; leaf: BhLeaf };

/** Replace $f(...) islands that compile with ISLAND_n names, like BH. */
export function replaceIslands(cond: string, ctx: BhContext, events: BhEvent[], startIndex = 0): { text: string; islands: Map<string, FNode> } {
  const islands = new Map<string, FNode>();
  let out = "";
  let last = 0;
  let n = startIndex;
  for (const isl of findIslands(cond)) {
    const c = tryCompile(isl.body);
    out += cond.slice(last, isl.start);
    if (c.node) {
      const name = `ISLAND_${islandName(n++)}`;
      islands.set(name, c.node);
      out += name;
    } else {
      events.push({ kind: "island-failed", token: cond.slice(isl.start, isl.end), detail: c.error?.message });
      out += cond.slice(isl.start, isl.end);
    }
    last = isl.end;
  }
  out += cond.slice(last);
  void ctx;
  return { text: out, islands };
}

function islandName(n: number) {
  // A..Z, AA, BA, …: little-endian base 26 like BH's IslandReplacementHelper.
  let s = "";
  let x = n;
  do {
    s += String.fromCharCode(65 + (x % 26));
    x = Math.floor(x / 26) - 1;
  } while (x >= 0);
  return s;
}

function classifyKey(key: string, ctx: BhContext, islands: Map<string, FNode>, events: BhEvent[], token: string): Omit<BhLeaf, "text" | "op" | "v" | "v2"> | null {
  const kw = COND_BY_CODE.get(key);
  if (kw && kw.kind !== "logic") return { key, cls: kw.kind === "param" ? "param" : (kw.kind as "flag" | "value"), kw };
  if (key.length >= 3 && !isUpper(key[0]) && !isUpper(key[1]) && !isUpper(key[2])) {
    const code = key.slice(0, 4);
    const base = ITEM_BY_CODE.get(code);
    if (key.length > 4) events.push({ kind: "item-truncated", token, detail: code });
    const up = key.toUpperCase().split(/[<>=~]/)[0];
    if (!base) {
      const looksLikeKeyword = COND_BY_CODE.has(up) || up === "AND" || up === "OR" || up === "NOT";
      // Three-letter words like "nec" or "bar" are usually item-code typos rather than keywords.
      if (looksLikeKeyword && (key.length > 3 || /[<>=~]/.test(token) || up === "AND" || up === "ETH" || up === "UNI" || up === "SET")) events.push({ kind: "item-looks-like-keyword", token, detail: up });
      else events.push({ kind: "item-unknown", token, detail: code });
    }
    return { key, cls: "item", code, base };
  }
  if (key.includes("+")) {
    const parts: { name: string; params: number[] }[] = [];
    for (const part of key.split("+")) {
      const m = part.match(/([A-Z_]+)(\d{1,9})?(?:,(\d{1,9}))?/);
      const name = m?.[1] ?? "";
      const params = m ? [m[2], m[3]].filter((x) => x != null).map(Number) : [];
      const ok =
        (ADD_NAMES.has(name) && params.length === 0) ||
        (name === "STAT" && params.length === 1) ||
        (name === "MULTI" && params.length === 2) ||
        (ctx.formulas.has(name) || islands.has(name));
      if (ok) parts.push({ name, params });
      else events.push({ kind: "add-part-skipped", token, detail: part });
    }
    return { key, cls: "add", parts };
  }
  for (const p of PREFIXES) {
    if (!key.startsWith(p)) continue;
    if (p === "MULTI") {
      const m = key.match(/([0-9]{1,10}),([0-9]{1,10})/);
      if (!m) {
        events.push({ kind: "dropped-param", token, detail: "MULTI needs two numbers: MULTIstat,layer" });
        return null;
      }
      return { key, cls: "param", prefix: p, params: [Number(m[1]), Number(m[2])], kw: COND_BY_CODE.get("MULTI") };
    }
    const r = readInt(key.slice(p.length));
    const max = p === "CLSK" ? 6 : p === "TABSK" ? 50 : p === "STAT" || p === "CHARSTAT" ? STAT_MAX : SKILL_MAX;
    if (!r.ok || r.v < 0 || r.v > max) {
      events.push({ kind: "dropped-param", token, detail: r.ok ? `${p}${r.v} is out of range (0–${max})` : `${p} needs a number` });
      return null;
    }
    if (r.junk) events.push({ kind: "value-junk", token, detail: `${p}${r.v}` });
    return { key, cls: "param", prefix: p, params: [r.v], kw: COND_BY_CODE.get(p) };
  }
  const f = ctx.formulas.get(key) ?? islands.get(key);
  if (f) return { key, cls: key.startsWith("ISLAND_") ? "island" : "formula", formula: f, formulaKey: key };
  if (key.toUpperCase().startsWith("FORMULA")) {
    const up = key.toUpperCase();
    const why = ctx.failedFormulas?.has(up) ? "its formula doesn't compile" : ctx.formulas.has(up) ? `references are case-sensitive: write ${up}` : "no Formula with that name";
    events.push({ kind: "dropped-formula", token, detail: why });
    return null;
  }
  events.push({ kind: "dropped-unknown", token, detail: key });
  return null;
}

/** Parse a condition string (aliases already expanded) exactly as BH does. */
export function parseBh(condIn: string, ctx: BhContext): BhResult {
  const events: BhEvent[] = [];
  const { text: cond, islands } = replaceIslands(condIn, ctx, events);
  const conds: RTok[] = [];
  let last: "none" | "operand" | "rp" | "other" = "none";
  const addOperand = (leaf: BhLeaf) => {
    if (last === "operand" || last === "rp") conds.push({ t: "and" });
    conds.push({ t: "leaf", leaf });
    last = "operand";
  };
  const addNon = (t: "and" | "or" | "not" | "lp" | "rp") => {
    if ((t === "not" || t === "lp") && (last === "operand" || last === "rp")) conds.push({ t: "and" });
    conds.push({ t });
    last = t === "rp" ? "rp" : "other";
  };
  const opOf = (c: string) => (c === "!" ? "not" : c === "(" ? "lp" : "rp") as "not" | "lp" | "rp";

  for (const raw of cond.split(/[ \t\n\r\v\f]+/).filter(Boolean)) {
    let i = 0;
    for (; i < raw.length && "!()".includes(raw[i]); i++) addNon(opOf(raw[i]));
    let j = raw.length;
    for (; j > i && "!()".includes(raw[j - 1]); j--);
    const trailing = raw.slice(j).split("").map(opOf);
    const body = raw.slice(i, j);
    if (/[!()]/.test(body)) events.push({ kind: "mid-token-paren", token: raw });
    if (!body) {
      trailing.forEach(addNon);
      continue;
    }
    const d = body.search(/[<=>~]/);
    let key = body;
    let op: Op | undefined;
    let v = 0;
    let v2 = 0;
    if (d >= 0) {
      key = trimW(body.slice(0, d));
      op = body[d] as Op;
      const val = trimW(body.slice(d + 1));
      if (/^[=<>]/.test(val) || (op === "<" && val.startsWith(">"))) events.push({ kind: "two-char-op", token: raw, detail: body.slice(d, d + 2) });
      if (val.length > 0) {
        if (op === "~" && val.includes("-")) {
          const k = val.indexOf("-");
          const a = readInt(val.slice(0, k));
          const b = readInt(val.slice(k + 1));
          if (!a.ok || !b.ok) {
            events.push({ kind: "dropped-bad-value", token: raw, detail: val });
            continue; // BH returns: operand and trailing ) ! are lost
          }
          v = a.v;
          v2 = b.v;
          if (v > v2) events.push({ kind: "range-inverted", token: raw });
        } else {
          const r = readInt(val);
          if (!r.ok) {
            if (!events.some((e) => e.token === raw && e.kind === "two-char-op")) events.push({ kind: "dropped-bad-value", token: raw, detail: val });
            continue;
          }
          if (r.junk) events.push({ kind: "value-junk", token: raw, detail: val });
          v = r.v;
          if (op === "~") events.push({ kind: "range-no-dash", token: raw });
        }
      } else events.push({ kind: "empty-value", token: raw });
    }
    if (key === "AND" || key === "&&" || key === "OR" || key === "||") {
      addNon(key === "AND" || key === "&&" ? "and" : "or");
      trailing.forEach(addNon);
      continue;
    }
    const c = classifyKey(key, ctx, islands, events, body);
    if (c) {
      const leaf: BhLeaf = { ...c, text: body, op, v, v2 };
      if ((leaf.cls === "flag" || leaf.cls === "item") && op) events.push({ kind: "op-ignored", token: body });
      if ((leaf.cls === "value" || leaf.cls === "param" || leaf.cls === "add") && !op) events.push({ kind: "no-operator", token: body });
      if ((leaf.cls === "add" && op === "~" && leaf.parts?.some((p) => ctx.formulas.has(p.name) || islands.has(p.name))) || (leaf.kw && (leaf.kw.code === "GOODSK" || leaf.kw.code === "GOODTBSK") && op === "~"))
        events.push({ kind: "add-range", token: raw });
      if (leaf.kw && BYTE_TARGETS.has(leaf.kw.code) && op && (v > 255 || v < 0 || v2 > 255 || v2 < 0)) events.push({ kind: "value-out-of-domain", token: raw, detail: "stored as 0–255: the number wraps around" });
      addOperand(leaf);
    }
    trailing.forEach(addNon);
  }

  // Shunting-yard exactly as ProcessConditions: binary ops pop every operator; NOT never pops.
  const out: RTok[] = [];
  const stack: RTok[] = [];
  let truncated = false;
  for (let k = 0; k < conds.length; k++) {
    const c = conds[k];
    if (c.t === "leaf") out.push(c);
    else if (c.t === "and" || c.t === "or" || c.t === "not") {
      if (c.t !== "not") {
        while (stack.length) {
          const top = stack[stack.length - 1];
          if (top.t === "and" || top.t === "or" || top.t === "not") out.push(stack.pop()!);
          else break;
        }
      }
      stack.push(c);
    } else if (c.t === "lp") stack.push(c);
    else {
      let found = false;
      while (stack.length) {
        const top = stack.pop()!;
        if (top.t === "lp") {
          found = true;
          break;
        }
        out.push(top);
      }
      if (!found) {
        const rest = conds.slice(k + 1).filter((x) => x.t === "leaf").map((x) => (x as { leaf: BhLeaf }).leaf.text);
        events.push({ kind: "stray-close", token: ")", detail: rest.join(" ") });
        truncated = true;
        break;
      }
    }
  }
  if (!truncated) {
    while (stack.length) {
      const top = stack.pop()!;
      if (top.t === "lp") {
        if (stack.some((x) => x.t !== "lp")) events.push({ kind: "unclosed-open", token: "(", detail: "operators before it are discarded" });
        else events.push({ kind: "unclosed-open", token: "(" });
        break;
      }
      out.push(top);
    }
  }

  // Convert: RPN to tree; any malformation means the rule never matches.
  const st: BhNode[] = [];
  let never = false;
  for (const c of out) {
    if (c.t === "leaf") st.push({ t: "leaf", leaf: c.leaf });
    else if (c.t === "not") {
      const a = st.pop();
      if (!a) {
        never = true;
        break;
      }
      st.push({ t: "not", a });
    } else if (c.t === "and" || c.t === "or") {
      const b = st.pop();
      const a = st.pop();
      if (!a || !b) {
        never = true;
        break;
      }
      st.push({ t: c.t, a, b });
    } else {
      never = true;
      break;
    }
  }
  const operands = conds.filter((c) => c.t === "leaf").length;
  if (!never && out.length > 0 && st.length !== 1) never = true;
  if (out.length === 0) {
    // No conditions at all: BH's Rule::Evaluate returns true for every item.
    if (condIn.trim() !== "" && operands === 0) events.push({ kind: "matches-everything", token: condIn.trim() });
    return { tree: null, never: false, events, operands };
  }
  if (never) events.push({ kind: "never-matches", token: condIn.trim() });
  return { tree: never ? null : st[0], never, events, operands };
}

export function bhLeaves(n: BhNode | null, out: BhLeaf[] = []): BhLeaf[] {
  if (!n) return out;
  if (n.t === "leaf") out.push(n.leaf);
  else if (n.t === "not") bhLeaves(n.a, out);
  else {
    bhLeaves(n.a, out);
    bhLeaves(n.b, out);
  }
  return out;
}

/** Leaves that must all be true for the rule to match (the top-level AND chain, outside NOT/OR). */
export function requiredLeaves(n: BhNode | null): BhLeaf[] {
  if (!n) return [];
  if (n.t === "leaf") return [n.leaf];
  if (n.t === "and") return [...requiredLeaves(n.a), ...requiredLeaves(n.b)];
  return [];
}
