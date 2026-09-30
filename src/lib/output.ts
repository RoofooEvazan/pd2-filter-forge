// Rule output, modelled on BH's BuildAction / ReplacementSpec (ItemDisplay.cpp). Two views:
//  * segmentOutput/splitOutput work on the text as written, for highlighting and the editor;
//  * buildAction/resolveOutput reproduce what the game does, for previews and the Test Lab.
// Reference: docs/PD2-Filter-Engine-Reference.md §9–§10.
import { COLOR_CSS, OUT_BY_CODE, type OutKeyword } from "./spec";
import { DATA, lookupCode } from "./data";
import type { Definitions } from "./document";
import { expandAliases } from "./document";
import { findIslands, renderFormulaValue, tryCompile, type FNode } from "./formula";
import { defaultColor, defaultName, gemInfo, has, paramValue, runeNumber, valueOf, type TestItem, type ViewContext } from "./item";
import { formulaValue, resolveCode, type EvalEnv } from "./conditions";
import { evalFormula, FormulaRuntimeError } from "./formula";

export type SegKind = "text" | "color" | "value" | "stat" | "notify" | "special" | "alias" | "formula" | "island" | "brace" | "unknown";

export interface Seg {
  kind: SegKind;
  raw: string;
  code?: string;
  param?: string;
  kw?: OutKeyword;
  inDesc?: boolean;
  /** Notification/continue keyword that PD2 will actually use (first of its kind). */
  used?: boolean;
}

/** Keywords BH's ReplacementMap knows (the only %X% that print a value). */
export const OUTPUT_VALUE_KEYS = new Set(
  (
    "NAME BASENAME SOCKETS RUNENUM RUNENAME GEMLEVEL GEMTYPE ILVL ALVL CRAFTALVL REROLLALVL LVLREQ WPNSPD RANGE CODE LBRACE RBRACE PERCENT " +
    "BUYPRICE SELLPRICE PRICE QTY RES ED CS CL NL REQSTR REQDEX REQLVL BASEMINONEH BASEMAXONEH BASEMINTWOH BASEMAXTWOH BASEMINTHROW " +
    "BASEMAXTHROW BASEMINKICK BASEMAXKICK BASEMINSMITE BASEMAXSMITE BASEBLOCK ALLATTRIB MAXRES UPSTR UPDEX UPLVL MAXSOCKETS MINDMG MAXDMG " +
    "EDEF EDAM DEF FRES CRES LRES PRES IAS FCR FHR FBR LIFE MANA ARPER MFIND GFIND STR DEX FRW AR DTM MAEK REPLIFE REPQUANT REPAIR"
  ).split(" ")
);
const OUTPUT_PARAM_KEYS: Record<string, number> = { STAT: 1, SK: 1, OS: 1, CLSK: 1, TABSK: 1, CHARSTAT: 1, MULTI: 2 };
export const COLOR_KEYS = new Set(["WHITE", "RED", "GREEN", "BLUE", "GOLD", "GRAY", "BLACK", "TAN", "ORANGE", "YELLOW", "PURPLE", "DARK_GREEN", "CORAL", "SAGE", "TEAL", "LIGHT_GRAY", "FULL_TRANS", "THREE_FOURTHS_TRANS", "HALF_TRANS", "QUARTER_TRANS"]);
/** Legacy %MAP% palette (ItemDisplay.cpp:14-34). */
const MAP_COLOR: Record<string, string> = {
  WHITE: "20", RED: "0A", GREEN: "84", BLUE: "97", GOLD: "0D", GRAY: "D0", BLACK: "00", TAN: "5A", ORANGE: "60", YELLOW: "0C", PURPLE: "9B",
  DARK_GREEN: "76", CORAL: "66", SAGE: "82", TEAL: "CB", LIGHT_GRAY: "D6", FULL_TRANS: "CB", THREE_FOURTHS_TRANS: "CB", HALF_TRANS: "CB", QUARTER_TRANS: "CB",
};
const NOTIFY_SYNTAX: Record<string, RegExp> = {
  BORDER: /^[0-9A-Fa-f]{1,4}$/, MAP: /^[0-9A-Fa-f]{1,4}$/, DOT: /^[0-9A-Fa-f]{1,4}$/, PX: /^[0-9A-Fa-f]{1,4}$/, LINE: /^[0-9A-Fa-f]{1,4}$/,
  NOTIFY: /^[0-9A-Fa-f]{1,4}$/, TIER: /^[0-9]$/, SOUNDID: /^[0-9]{1,4}$/,
};

/** Classify the inside of a %...% as PD2 reads it (after its uppercase pass). */
export function classifyKeyword(inner: string, defs?: Definitions): Omit<Seg, "raw" | "inDesc"> {
  const code = inner.toUpperCase();
  const n = code.match(/^(BORDER|MAP|DOT|PX|LINE|NOTIFY|SOUNDID|TIER)-(.+)$/);
  if (n) {
    if (NOTIFY_SYNTAX[n[1]].test(n[2])) return { kind: "notify", code: n[1], param: n[2], kw: OUT_BY_CODE.get(n[1]) };
    return { kind: "unknown", code };
  }
  if (code === "MAP") return { kind: "notify", code: "MAP", kw: OUT_BY_CODE.get("MAP") };
  if (code === "CONTINUE") return { kind: "special", code, kw: OUT_BY_CODE.get(code) };
  if (COLOR_KEYS.has(code)) return { kind: "color", code, kw: OUT_BY_CODE.get(code) };
  if (["NL", "CL", "CS", "LBRACE", "RBRACE", "PERCENT"].includes(code)) return { kind: "special", code, kw: OUT_BY_CODE.get(code) };
  if (OUTPUT_VALUE_KEYS.has(code)) return { kind: "value", code, kw: OUT_BY_CODE.get(code) };
  const pm = code.match(/^([A-Z_]+?)(\d{1,9})(?:,(\d{1,9}))?$/);
  if (pm && OUTPUT_PARAM_KEYS[pm[1]] === (pm[3] != null ? 2 : 1)) return { kind: "stat", code: pm[1], param: pm[3] != null ? `${pm[2]},${pm[3]}` : pm[2] };
  if (code.startsWith("FORMULA") && /^[A-Z_]+$/.test(code)) return { kind: "formula", code: code.slice(7) };
  if (defs) for (const a of defs.aliases.keys()) if (a.toUpperCase() === code) return { kind: "alias", code };
  return { kind: "unknown", code };
}

/** Description span the way BH's ParseDescription finds it: first "{" to first "}". */
export function descSpan(out: string): { open: number; close: number } | null {
  const open = out.indexOf("{");
  const close = out.indexOf("}");
  return open >= 0 && close >= 0 && open < close ? { open, close } : null;
}

/** Split output text into segments for highlighting and editing. */
export function segmentOutput(out: string, defs?: Definitions): Seg[] {
  const segs: Seg[] = [];
  const span = descSpan(out);
  const inDescAt = (i: number) => !!span && i > span.open && i < span.close;
  let text = "";
  let textStart = 0;
  const flush = () => {
    if (text) segs.push({ kind: "text", raw: text, inDesc: inDescAt(textStart) });
    text = "";
  };
  const islands = findIslands(out);
  let i = 0;
  while (i < out.length) {
    const isl = islands.find((x) => x.start === i);
    if (isl) {
      flush();
      segs.push({ kind: "island", raw: out.slice(isl.start, isl.end), code: isl.body, inDesc: inDescAt(i) });
      i = isl.end;
      textStart = i;
      continue;
    }
    if (span && (i === span.open || i === span.close)) {
      flush();
      segs.push({ kind: "brace", raw: out[i], inDesc: i === span.close });
      i++;
      textStart = i;
      continue;
    }
    if (out[i] === "%") {
      const j = out.indexOf("%", i + 1);
      const inner = j > i ? out.slice(i + 1, j) : "";
      if (j > i && /^[A-Za-z0-9_,-]+$/.test(inner)) {
        flush();
        segs.push({ raw: out.slice(i, j + 1), inDesc: inDescAt(i), ...classifyKeyword(inner, defs) });
        i = j + 1;
        textStart = i;
        continue;
      }
    }
    if (!text) textStart = i;
    text += out[i];
    i++;
  }
  flush();
  markUsed(segs);
  return segs;
}

/** Which notification / continue keywords PD2 actually uses: the first of each kind. */
function markUsed(segs: Seg[]) {
  const seen = new Set<string>();
  for (const s of segs) {
    if (s.kind === "notify") {
      // SOUNDID and the legacy %MAP% are parsed after the description is cut out.
      if ((s.code === "SOUNDID" || (s.code === "MAP" && s.param == null)) && s.inDesc) continue;
      const key = s.param == null ? "MAP_LEGACY" : s.code!;
      if (!seen.has(key)) {
        seen.add(key);
        s.used = true;
      }
    } else if (s.kind === "special" && s.code === "CONTINUE" && !s.inDesc && !seen.has("CONTINUE")) {
      seen.add("CONTINUE");
      s.used = true;
    }
  }
}

// ------------------------------------------------------------------ structured effects (editor)

export interface Effects {
  border?: string;
  map?: string;
  dot?: string;
  px?: string;
  line?: string;
  sound?: number;
  tier?: number;
  notify?: string;
  cont: boolean;
}
export const ICON_KINDS = ["border", "map", "dot", "px", "line"] as const;
export type IconKind = (typeof ICON_KINDS)[number];

export interface OutputParts {
  name: string;
  desc: string | null;
  effects: Effects;
}

/** Pull the keywords PD2 uses out of the output so they can be edited as fields. */
export function splitOutput(out: string): OutputParts {
  const effects: Effects = { cont: false };
  let name = "";
  let desc: string | null = null;
  for (const s of segmentOutput(out)) {
    if (s.used && s.kind === "notify" && s.param != null) {
      const k = s.code!.toLowerCase();
      if (k === "soundid") effects.sound = Number(s.param);
      else if (k === "tier") effects.tier = Number(s.param);
      else if (k === "notify") effects.notify = s.param.toUpperCase();
      else (effects as any)[k] = s.param.toUpperCase();
      continue;
    }
    if (s.used && s.kind === "special" && s.code === "CONTINUE") {
      effects.cont = true;
      continue;
    }
    if (s.kind === "brace") {
      if (s.raw === "{") desc = desc ?? "";
      continue;
    }
    if (s.inDesc) desc = (desc ?? "") + s.raw;
    else name += s.raw;
  }
  return { name, desc, effects };
}

export function composeOutput(p: OutputParts): string {
  const e = p.effects;
  let s = p.name;
  if (p.desc != null) s += `{${p.desc}}`;
  for (const k of ICON_KINDS) if (e[k]) s += `%${k.toUpperCase()}-${e[k]}%`;
  if (e.sound != null && !Number.isNaN(e.sound)) s += `%SOUNDID-${e.sound}%`;
  if (e.tier != null && !Number.isNaN(e.tier)) s += `%TIER-${e.tier}%`;
  if (e.notify) s += `%NOTIFY-${e.notify}%`;
  if (e.cont) s += "%CONTINUE%";
  return s;
}

export function hasNotification(e: Effects) {
  return ICON_KINDS.some((k) => e[k]) || (e.sound != null && e.sound > 0 && e.sound < DATA.meta.soundRecs);
}

// ------------------------------------------------------------------ BuildAction (what the game does)

export interface Action {
  name: string;
  desc: string | null;
  effects: Effects;
  /** Is this a MapRuleList rule (icon, line or valid sound)? */
  isMap: boolean;
  islands: Map<string, FNode>;
}

const actionCache = new WeakMap<Definitions, Map<string, Action>>();

/** Uppercase %tokens% with a lowercase letter, but only where the opening % has even parity. */
function uppercasePass(s: string): string {
  const re = /^(?:(?:%[^%]*%)|[^%])*%((?:\w|-)*?[a-z]+?(?:\w|-)*?)%/;
  let out = s;
  for (let guard = 0; guard < 500; guard++) {
    const m = out.match(re);
    if (!m) break;
    const start = m[0].length - m[1].length - 1;
    out = out.slice(0, start) + m[1].toUpperCase() + out.slice(start + m[1].length);
  }
  return out;
}

export function buildAction(outRaw: string, defs: Definitions): Action {
  let cache = actionCache.get(defs);
  if (!cache) actionCache.set(defs, (cache = new Map()));
  const hit = cache.get(outRaw);
  if (hit) return hit;

  let s = expandAliases(outRaw, defs.aliases, "out");
  // Inline formulas: compiled ones become %ISLAND_x%; failed ones stay as literal text.
  const islands = new Map<string, FNode>();
  let n = 0;
  for (const isl of findIslands(s).reverse()) {
    const c = tryCompile(isl.body);
    if (c.node) {
      const name = `ISLAND_${String.fromCharCode(65 + (n++ % 26))}${n > 26 ? n : ""}`;
      islands.set(name, c.node);
      s = s.slice(0, isl.start) + `%${name}%` + s.slice(isl.end);
    }
  }
  s = uppercasePass(s);
  const effects: Effects = { cont: false };
  const take = (re: RegExp, on: (m: RegExpMatchArray) => void, area: "all" | "name" = "all") => {
    const m = s.match(re);
    if (!m || m.index == null) return;
    if (area === "name") {
      const span = descSpan(s);
      if (span && m.index > span.open && m.index < span.close) return;
    }
    on(m);
    s = s.slice(0, m.index) + s.slice(m.index + m[0].length);
  };
  for (const k of ["BORDER", "MAP", "DOT", "PX", "LINE", "NOTIFY"] as const) {
    take(new RegExp(`%${k}-([a-f0-9]{1,4})%`, "i"), (m) => {
      const v = m[1].toUpperCase();
      if (v === "BEEF") return; // BH's UNDEFINED_COLOR
      if (k === "NOTIFY") effects.notify = v;
      else (effects as any)[k.toLowerCase()] = v;
    });
  }
  take(/%TIER-([0-9])%/i, (m) => (effects.tier = Number(m[1])));
  let desc: string | null = null;
  const span = descSpan(s);
  if (span) {
    desc = s.slice(span.open + 1, span.close);
    s = s.slice(0, span.open) + s.slice(span.close + 1);
  }
  take(/%SOUNDID-([0-9]{1,4})%/i, (m) => {
    const id = Number(m[1]);
    effects.sound = id < DATA.meta.soundRecs ? id : 0;
  });
  // Legacy %MAP%: color = the color keyword whose first occurrence comes last before %MAP%.
  const mapAt = s.indexOf("%MAP%");
  if (mapAt >= 0) {
    let best = "WHITE";
    let bestPos = -1;
    for (const c of Object.keys(MAP_COLOR)) {
      const p = s.indexOf(`%${c}%`);
      if (p >= 0 && p < mapAt && p >= bestPos) {
        best = c;
        bestPos = p;
      }
    }
    s = s.slice(0, mapAt) + s.slice(mapAt + 5);
    effects.map = MAP_COLOR[best];
    if (!effects.border) effects.border = effects.map;
  }
  const ci = s.indexOf("%CONTINUE%");
  if (ci >= 0) {
    effects.cont = true;
    s = s.slice(0, ci) + s.slice(ci + 10);
  }
  const isMap = ICON_KINDS.some((k) => effects[k]) || (effects.sound != null && effects.sound !== 0);
  const a: Action = { name: s, desc, effects, isMap, islands };
  if (cache.size > 50000) cache.clear();
  cache.set(outRaw, a);
  return a;
}

// ------------------------------------------------------------------ rendering

/** A styled run of text. `color` is a color keyword (WHITE, GOLD...). */
export interface Run {
  text: string;
  color: string;
}
export interface Rendered {
  /** Lines top-to-bottom as they appear in game (%NL% stacks upward). */
  lines: Run[][];
  desc: Run[][];
  hidden: boolean;
  displayLength: number;
  internalLength: number;
  truncated?: boolean;
}

// Internal markers: colors, and BH's deferred %CL% (\r) and %CS% (\b).
const MARK = "\u0001";
const mark = (c: string) => `${MARK}${c}${MARK}`;
const CL = "\r";
const CS = "\b";

const GEM_LEVELS = ["", "Chipped", "Flawed", "Normal", "Flawless", "Perfect"];
const GEM_TYPES = ["", "Amethyst", "Diamond", "Emerald", "Ruby", "Sapphire", "Topaz", "Skull"];
const SHOP_LIKE = new Set(["SHOP"]);
const STAFFMOD_TYPES = ["wand", "staf", "scep", "orb", "ashd", "head", "phlm", "pelt", "h2h", "amaz", "circ"];

export function defaultNameMarked(it: TestItem): string {
  const base = lookupCode(it.code);
  // Runes and some PD2 items carry their color inside the name string itself.
  return (base?.col ? mark(base.col) : "") + defaultName(it);
}

/** Whether %NL% / %CL% work in this item's name (ItemDisplay.cpp:1567-1595). */
function newlineMode(it: TestItem, ctx: ViewContext): "all" | "first" | "none" {
  const magicPlus = !["inferior", "normal", "superior"].includes(it.quality);
  if ((it.identified && (magicPlus || it.runeword)) || SHOP_LIKE.has(ctx.location)) return "all";
  const base = lookupCode(it.code);
  if (!magicPlus && (it.quality === "superior" || STAFFMOD_TYPES.some((t) => has(base, t)))) return "first";
  return "none";
}

/** Resolve one part (name or description) of an Action into a marked string. */
export function resolveOutput(action: Action, part: "name" | "desc", prev: { name: string; desc: string }, env: EvalEnv, nlUsed = { n: 0 }): string {
  const { item, ctx } = env;
  const src = part === "name" ? action.name : action.desc ?? "";
  const nlMode = part === "desc" ? "all" : newlineMode(item, ctx);
  let s = "";
  let i = 0;
  while (i < src.length) {
    if (src[i] !== "%") {
      s += src[i++];
      continue;
    }
    const j = src.indexOf("%", i + 1);
    if (j < 0) {
      s += src.slice(i);
      break;
    }
    const inner = src.slice(i + 1, j);
    const r = replaceKeyword(inner, action, part, prev, env, nlMode, nlUsed);
    if (r == null) {
      // Unknown: BH emits "%NAME" literally and restarts at the closing %.
      s += src.slice(i, j);
      i = j;
      continue;
    }
    s += r;
    i = j + 1;
  }
  return s;
}

function replaceKeyword(inner: string, action: Action, part: "name" | "desc", prev: { name: string; desc: string }, env: EvalEnv, nlMode: string, nlUsed: { n: number }): string | null {
  const m = inner.match(/^([A-Z_]+)(\d{1,9})?(?:,(\d{1,9}))?$/);
  if (!m) return null;
  const [, name, p1, p2] = m;
  const params = [p1, p2].filter((x) => x != null).map(Number);
  const { item, ctx } = env;
  if (COLOR_KEYS.has(name) && !params.length) return name.endsWith("_TRANS") ? "" : mark(name);
  if (name === "NL" || name === "CL") {
    const ch = name === "NL" ? "\n" : CL;
    if (nlMode === "all") return ch;
    if (nlMode === "first" && nlUsed.n++ === 0) return ch;
    return "";
  }
  if (name === "CS") return CS;
  if (name === "LBRACE") return "{";
  if (name === "RBRACE") return "}";
  if (name === "PERCENT") return "%";
  if (name.startsWith("ISLAND_")) {
    const node = action.islands.get(inner);
    if (!node) return null;
    try {
      return renderFormulaValue(evalFormula(node, (n, p) => resolveCode(n, p, env)));
    } catch (e) {
      if (e instanceof FormulaRuntimeError) return "f_err";
      throw e;
    }
  }
  if (name.startsWith("FORMULA") && !params.length) {
    const r = formulaValue(name, env);
    return r ? renderFormulaValue(r.v, r.error) : null;
  }
  if (OUTPUT_PARAM_KEYS[name] != null) {
    if (OUTPUT_PARAM_KEYS[name] !== params.length) return null;
    return String(paramValue(name, params, item, ctx));
  }
  if (params.length || !OUTPUT_VALUE_KEYS.has(name)) return null;
  return valueText(name, item, ctx, part === "name" ? prev.name : prev.desc);
}

function valueText(code: string, it: TestItem, ctx: ViewContext, prevName: string): string {
  const base = lookupCode(it.code);
  switch (code) {
    case "NAME":
      return prevName;
    case "BASENAME":
      return base?.n ?? it.code;
    case "CODE":
      return it.code;
    case "RUNENAME":
      return base && runeNumber(it.code) ? (base.col ? mark(base.col) : "") + base.n.split(" ")[0] : "";
    case "RUNENUM":
      return String(runeNumber(it.code));
    case "GEMLEVEL":
      return GEM_LEVELS[gemInfo(base).level] ?? "";
    case "GEMTYPE":
      return GEM_TYPES[gemInfo(base).type] ?? "";
    case "RES": {
      const r = [39, 41, 43, 45].map((id) => it.stats[id] ?? 0);
      return String(r.every((x) => x !== 0) ? Math.min(...r) : 0);
    }
  }
  const v = valueOf(code, it, ctx);
  return v == null ? "" : String(v);
}

/** Resolve BH's deferred %CL% / %CS% and the name length limit (TrimItemText). */
export function finalize(marked: string, limitVisible: number | null): { s: string; truncated: boolean } {
  let out = "";
  let visible = 0;
  let truncated = false;
  const parts = marked.split(MARK);
  // Flatten to a char stream with color markers kept intact.
  const stream: string[] = [];
  parts.forEach((p, i) => {
    if (i % 2 === 1) stream.push(mark(p));
    else for (const ch of p) stream.push(ch);
  });
  const lastChar = () => {
    for (let k = out.length - 1; k >= 0; k--) if (out[k] !== MARK) return out[k];
    return "";
  };
  for (let k = 0; k < stream.length; k++) {
    let c = stream[k];
    const next = stream[k + 1];
    if (c === CL) {
      if (out === "" || lastChar() === "\n" || next == null || next === "\n" || next === CL) continue;
      c = "\n";
    } else if (c === CS) {
      const prevC = out.length ? out[out.length - 1] : "";
      if (!prevC || /\s/.test(prevC) || next == null || /^\s$/.test(next)) continue;
      c = " ";
    }
    if (c.length === 1) {
      if (limitVisible != null && visible >= limitVisible) {
        truncated = true;
        break;
      }
      visible++;
    }
    out += c;
  }
  return { s: out, truncated };
}

/** Turn a marked string into styled lines, top-to-bottom. */
export function toLines(marked: string, baseColor: string): Run[][] {
  const lines: Run[][] = [[]];
  let color = baseColor;
  const parts = marked.split(MARK);
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) {
      color = parts[i];
      continue;
    }
    const chunks = parts[i].split("\n");
    chunks.forEach((chunk, ci) => {
      if (ci > 0) lines.push([]);
      if (chunk) lines[lines.length - 1].push({ text: chunk, color });
    });
  }
  // Each %NL% starts a line above the previous one.
  return lines.reverse();
}

export function measure(marked: string) {
  const parts = marked.split(MARK);
  let text = 0;
  let colors = 0;
  parts.forEach((p, i) => {
    if (i % 2 === 1) colors++;
    else text += p.length; // BH counts "\n" as a visible character
  });
  return { displayLength: text, internalLength: text + colors * 3 };
}

/** BH hides the label only when the final text is exactly empty (color codes count as text). */
export function isBlank(marked: string) {
  return marked === "";
}

export function cssColor(code: string | undefined) {
  return (code && COLOR_CSS[code]) || COLOR_CSS.WHITE;
}

export function nameLimit(ctx: ViewContext) {
  return ctx.location === "SHOP" ? 512 : 56;
}

/** Render a single rule's output for an item (no filter chain), for previews. */
export function renderStandalone(out: string, env: EvalEnv): Rendered {
  const action = buildAction(out, env.defs);
  const prev = { name: defaultNameMarked(env.item), desc: "" };
  const raw = resolveOutput(action, "name", prev, env);
  const { s: name, truncated } = finalize(raw, nameLimit(env.ctx));
  const desc = action.desc != null ? finalize(resolveOutput(action, "desc", prev, env), null).s : "";
  return {
    lines: toLines(name, defaultColor(env.item)),
    desc: desc ? toLines(desc, "BLUE") : [],
    hidden: isBlank(name),
    truncated,
    ...measure(name),
  };
}

