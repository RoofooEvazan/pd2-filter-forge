// PD2 filter formulas: Formula[KEY]: expr and inline $f(expr). A port of BH's Formula.h
// (see docs/PD2-Filter-Engine-Reference.md §8): case-insensitive, 32-bit float maths,
// NaN counts as true, one precedence level for all comparisons, unknown names are compile errors.

export type FNode =
  | { t: "num"; v: number }
  | { t: "var"; name: string; params: number[] }
  | { t: "un"; op: string; a: FNode }
  | { t: "bin"; op: string; a: FNode; b: FNode }
  | { t: "call"; name: string; args: FNode[] };

export type FormulaStatus = "LEXICAL_ERROR" | "SYNTAX_ERROR" | "ARG_COUNT_ERROR";

export class FormulaError extends Error {
  constructor(
    public status: FormulaStatus,
    message: string,
    public at = 0
  ) {
    super(message);
  }
}

// Every variable BH registers (ItemDisplay.cpp formulaVarDefs), with its parameter count.
const PARAM_VARS: Record<string, number> = { stat: 1, multi: 2, charstat: 1, chsk: 1, cl: 1, clsk: 1, eq: 1, os: 1, sk: 1, tabsk: 1, wp: 1 };
const PLAIN_VARS = (
  "allattrib allsk alvl amazon ar area armor arper assassin automod axe bar barbarian baseblock basemaxkick basemaxoneh basemaxsmite " +
  "basemaxthrow basemaxtwoh baseminkick baseminoneh baseminsmite baseminthrow basemintwoh belt boots bow buyprice charm chest circ class " +
  "club clvl craft craftalvl cres cube dagger def dex diff din dru druid dtm ed edam edef elt equipped eth exc false fbr fcr fhr filtlvl " +
  "fools fres frw gem gemlevel gemmed gemtype gfind gloves gold ground hammer height helm ias id ilvl inf inventory jav jewelry life " +
  "lres lvlreq mace maek mag mana mapid maptier maxdmg maxdur maxres maxsockets merc mfind mindmg misc nec necromancer nmag norm onehand " +
  "paladin polearm pres price qlvl qty quiver rare repair replife repquant reqdex reqlvl reqstr rerollalvl res rune rw scepter sellprice " +
  "set shield shop sin sock sockets sor sorceress spear staff stash str sup sword throwing tmace true twohand uni updex uplvl upstr wand " +
  "weapon width xbow zon"
).split(" ");
export const FORMULA_VARS = new Map<string, number>([...PLAIN_VARS.map((v) => [v, 0] as const), ...Object.entries(PARAM_VARS)]);

type Tok = { k: "num"; v: number; at: number } | { k: "id"; v: string; at: number } | { k: "op"; v: string; at: number } | { k: "(" | ")" | ","; at: number };

const F = Math.fround;

function lex(src: string): Tok[] {
  const s = src.toLowerCase();
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    const two = s.slice(i, i + 2);
    if (["==", "!=", ">=", "<="].includes(two)) {
      out.push({ k: "op", v: two, at: i });
      i += 2;
      continue;
    }
    if ("+-*/^<>!".includes(c)) {
      out.push({ k: "op", v: c, at: i });
      i++;
      continue;
    }
    if (c === "(" || c === ")" || c === ",") {
      out.push({ k: c, at: i });
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      // wcstof: digits, optional fraction, optional exponent.
      const m = s.slice(i).match(/^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/);
      if (!m) throw new FormulaError("LEXICAL_ERROR", `A lone "." isn't a number`, i);
      const v = Number(m[0]);
      if (!Number.isFinite(F(v)) || (v !== 0 && F(v) === 0)) throw new FormulaError("SYNTAX_ERROR", `${m[0]} is out of range for a 32-bit float`, i);
      out.push({ k: "num", v: F(v), at: i });
      i += m[0].length;
      continue;
    }
    if (/[a-z_]/.test(c)) {
      const m = s.slice(i).match(/^[a-z_]+/)!;
      out.push({ k: "id", v: m[0], at: i });
      i += m[0].length;
      continue;
    }
    const hint = c === "=" ? ' (use "==")' : c === "&" ? " (use and(…))" : c === "|" ? " (use or(…))" : c === "%" ? " (use mod(a,b))" : "";
    throw new FormulaError("LEXICAL_ERROR", `"${c}" isn't allowed in a formula${hint}`, i);
  }
  return out;
}

const FUNCS: Record<string, { min: number; max?: number }> = {
  if: { min: 3, max: 3 }, and: { min: 1 }, or: { min: 1 }, xor: { min: 1 }, exp: { min: 1, max: 1 }, ln: { min: 1, max: 1 },
  floor: { min: 1, max: 1 }, ceil: { min: 1, max: 1 }, round: { min: 1, max: 1 }, min: { min: 1 }, max: { min: 1 }, mod: { min: 2, max: 2 },
  average: { min: 1 }, sqrt: { min: 1, max: 1 }, pow: { min: 2, max: 2 }, count: { min: 1 }, countif: { min: 2 }, abs: { min: 1, max: 1 }, sign: { min: 1, max: 1 },
};
export const FORMULA_FUNCTION_NAMES = Object.keys(FUNCS).map((f) => f.toUpperCase());

// All comparisons share the lowest level (BH Formula.h:227-239); ^ is right-associative.
const PREC: Record<string, number> = { "==": 1, "!=": 1, ">": 1, "<": 1, ">=": 1, "<=": 1, "+": 2, "-": 2, "*": 3, "/": 3, "^": 4 };

export function parseFormula(src: string): FNode {
  const toks = lex(src);
  if (!toks.length) throw new FormulaError("SYNTAX_ERROR", "The formula is empty");
  let p = 0;
  const peek = () => toks[p];
  const fail = (msg: string, t?: Tok): never => {
    throw new FormulaError("SYNTAX_ERROR", msg, t?.at ?? src.length);
  };

  function primary(): FNode {
    const t = toks[p++];
    if (!t) return fail("The formula ends too early");
    if (t.k === "op" && (t.v === "-" || t.v === "+" || t.v === "!")) return { t: "un", op: t.v, a: primary() };
    if (t.k === "num") return { t: "num", v: t.v };
    if (t.k === "(") {
      if (peek()?.k === ")") fail("Empty parentheses", peek());
      const e = expr(1);
      if (peek()?.k !== ")") fail("Missing )", peek());
      p++;
      return e;
    }
    if (t.k === "id") {
      const fn = FUNCS[t.v];
      if (fn) {
        if (peek()?.k !== "(") fail(`${t.v.toUpperCase()} needs ( after it`, t);
        p++;
        const args: FNode[] = [];
        if (peek()?.k !== ")") {
          for (;;) {
            args.push(expr(1));
            if (peek()?.k === ",") {
              p++;
              if (peek()?.k === ")") fail("Trailing comma", peek());
              continue;
            }
            break;
          }
        }
        if (peek()?.k !== ")") fail(`Missing ) after ${t.v.toUpperCase()}(`, peek());
        p++;
        if (args.length < fn.min || (fn.max != null && args.length > fn.max)) {
          throw new FormulaError("ARG_COUNT_ERROR", `${t.v.toUpperCase()}() takes ${fn.max === fn.min ? fn.min : `${fn.min}+`} argument(s), got ${args.length}`, t.at);
        }
        return { t: "call", name: t.v.toUpperCase(), args };
      }
      const pc = FORMULA_VARS.get(t.v);
      if (pc == null) {
        const extra = t.v.startsWith("formula") ? " (formulas can't use other formulas)" : t.v === "island_" ? "" : "";
        fail(`Unknown name "${t.v.toUpperCase()}"${extra}`, t);
      }
      const params: number[] = [];
      for (let k = 0; k < pc!; k++) {
        if (k > 0) {
          if (peek()?.k !== ",") fail(`${t.v.toUpperCase()} needs ${pc} numbers`, peek());
          p++;
        }
        const n = toks[p++];
        if (!n || n.k !== "num" || !Number.isInteger(n.v) || n.v < 0 || n.v > 2147483647) fail(`${t.v.toUpperCase()} needs a whole number after it`, n ?? t);
        params.push((n as { v: number }).v);
      }
      return { t: "var", name: t.v.toUpperCase(), params };
    }
    return fail(`Unexpected ${t.k === "op" ? `"${t.v}"` : `"${t.k}"`}`, t);
  }

  function expr(min: number): FNode {
    let left = primary();
    for (;;) {
      const t = peek();
      if (!t || t.k !== "op" || PREC[t.v] == null || PREC[t.v] < min) break;
      p++;
      const right = expr(t.v === "^" ? PREC[t.v] : PREC[t.v] + 1);
      left = { t: "bin", op: t.v, a: left, b: right };
    }
    return left;
  }

  const e = expr(1);
  if (p < toks.length) fail(`Unexpected text after the formula`, toks[p]);
  return e;
}

/** Kept for callers that want a list of problems rather than an exception. */
export function checkFormula(src: string): string[] {
  try {
    parseFormula(src);
    return [];
  } catch (e) {
    return [(e as Error).message];
  }
}

const truthy = (x: number) => x !== 0; // NaN != 0, so NaN counts as true, like BH's IsTrue

export class FormulaRuntimeError extends Error {}

export function evalFormula(node: FNode, resolve: (name: string, params: number[]) => number): number {
  switch (node.t) {
    case "num":
      return node.v;
    case "var":
      return F(resolve(node.name, node.params));
    case "un": {
      const v = evalFormula(node.a, resolve);
      return node.op === "-" ? F(-v) : node.op === "!" ? (truthy(v) ? 0 : 1) : v;
    }
    case "bin": {
      const a = evalFormula(node.a, resolve);
      const b = evalFormula(node.b, resolve);
      switch (node.op) {
        case "+": return F(a + b);
        case "-": return F(a - b);
        case "*": return F(a * b);
        case "/": return F(a / b);
        case "^": return F(Math.pow(a, b));
        case "==": return +(a === b);
        case "!=": return +(a !== b);
        case ">": return +(a > b);
        case "<": return +(a < b);
        case ">=": return +(a >= b);
        case "<=": return +(a <= b);
      }
      return 0;
    }
    case "call": {
      const args = node.args;
      const ev = (n: FNode) => evalFormula(n, resolve);
      switch (node.name) {
        case "IF":
          return truthy(ev(args[0])) ? ev(args[1]) : ev(args[2]);
        case "AND":
          for (const a of args) if (!truthy(ev(a))) return 0;
          return 1;
        case "OR":
          for (const a of args) if (truthy(ev(a))) return 1;
          return 0;
      }
      const v = args.map(ev);
      switch (node.name) {
        case "XOR": return v.filter(truthy).length % 2;
        case "EXP": return F(Math.exp(v[0]));
        case "LN": return F(Math.log(v[0]));
        case "FLOOR": return F(Math.floor(v[0]));
        case "CEIL": return F(Math.ceil(v[0]));
        case "ROUND": return F(Math.sign(v[0]) * Math.round(Math.abs(v[0]))); // halves away from zero
        case "MIN": return v.reduce((m, x) => (Number.isNaN(x) ? m : Math.min(m, x)), 3.4028234663852886e38);
        case "MAX": return v.reduce((m, x) => (Number.isNaN(x) ? m : Math.max(m, x)), -3.4028234663852886e38);
        case "MOD": return F(v[0] % v[1]);
        case "AVERAGE": return F(v.reduce((s, x) => s + x, 0) / v.length);
        case "SQRT": return F(Math.sqrt(v[0]));
        case "POW": return F(Math.pow(v[0], v[1]));
        case "COUNT": return v.filter(truthy).length;
        case "COUNTIF": return v.slice(0, -1).filter((x) => x === v[v.length - 1]).length;
        case "ABS": return Math.abs(v[0]);
        case "SIGN": return v[0] > 0 ? 1 : v[0] < 0 ? -1 : 0;
      }
      return NaN;
    }
  }
}

/** Render like BH: %.2f on the float value, trailing zeros trimmed, f_err past ±2^31 or non-finite. */
export function renderFormulaValue(v: number, error = false): string {
  const f = F(v);
  if (error || !Number.isFinite(f) || Math.abs(f) > 2147483648) return "f_err";
  // Round half to even at 2 decimals on the exact float value (modern UCRT printf).
  const scaled = f * 100;
  let r = Math.round(scaled);
  if (Math.abs(scaled % 1) === 0.5 && r % 2 !== 0) r -= Math.sign(scaled);
  let s = (r / 100).toFixed(2);
  if (Object.is(f, -0) || (r === 0 && f < 0)) s = "-" + s.replace(/^-/, "");
  if (s.endsWith("00")) return s.slice(0, -3);
  if (s.endsWith("0")) return s.slice(0, -1);
  return s;
}

/** Find inline $f(...) islands like BH: lowercase "$f(", nested parens; unbalanced ones are skipped. */
export function findIslands(s: string): { start: number; end: number; body: string }[] {
  const out: { start: number; end: number; body: string }[] = [];
  let i = 0;
  while ((i = s.indexOf("$f(", i)) >= 0) {
    let depth = 0;
    let j = i + 2;
    for (; j < s.length; j++) {
      if (s[j] === "(") depth++;
      else if (s[j] === ")" && --depth === 0) break;
    }
    if (j >= s.length) {
      i += 3; // unbalanced: BH copies "$f(" through and keeps scanning
      continue;
    }
    out.push({ start: i, end: j + 1, body: s.slice(i + 3, j) });
    i = j + 1;
  }
  return out;
}

/** Try to compile; returns the node or the error. */
export function tryCompile(src: string): { node?: FNode; error?: FormulaError } {
  try {
    return { node: parseFormula(src) };
  } catch (e) {
    return { error: e instanceof FormulaError ? e : new FormulaError("SYNTAX_ERROR", String(e)) };
  }
}
