// A test item plus the viewing context, and every value the filter language can ask about it.
import { ITEM_BY_CODE, lookupCode, type BaseItem } from "./data";

export type Quality = "inferior" | "normal" | "superior" | "magic" | "set" | "rare" | "unique" | "crafted";
export const QUALITIES: Quality[] = ["inferior", "normal", "superior", "magic", "rare", "set", "unique", "crafted"];
export type Location = "GROUND" | "SHOP" | "EQUIPPED" | "MERC" | "INVENTORY" | "STASH" | "CUBE";
export const LOCATIONS: Location[] = ["GROUND", "SHOP", "INVENTORY", "STASH", "CUBE", "EQUIPPED", "MERC"];

export interface TestItem {
  code: string;
  quality: Quality;
  /** Display name for uniques, sets, runewords and rares. */
  title?: string;
  identified: boolean;
  ethereal: boolean;
  runeword: boolean;
  sockets: number;
  gemmed: boolean;
  ilvl: number;
  qty: number;
  gold: number;
  price: number;
  /** Stat values keyed by ItemStatCost id, in the numbers players see (life 50, not 12800). */
  stats: Record<number, number>;
  /** "layer" stats: key `${stat},${layer}`. Skills live here: 107 = single skill, 97 = oskill, 204 = charges, 83 = class, 188 = tab. */
  multi: Record<string, number>;
  prefixes: number[];
  suffixes: number[];
  automod: number;
  fools: boolean;
}

export interface ViewContext {
  clvl: number;
  cls: number; // 0 ama .. 6 sin
  diff: number;
  filtlvl: number;
  mapid: number;
  location: Location;
  /** Stat totals for CHARSTAT, keyed by stat id. */
  charstats: Record<number, number>;
}

export const DEFAULT_CTX: ViewContext = { clvl: 85, cls: 1, diff: 2, filtlvl: 1, mapid: 108, location: "GROUND", charstats: {} };

export function makeItem(code: string, patch: Partial<TestItem> = {}): TestItem {
  const base = ITEM_BY_CODE.get(code);
  return {
    code,
    quality: "normal",
    identified: true,
    ethereal: false,
    runeword: false,
    sockets: 0,
    gemmed: false,
    ilvl: 85,
    qty: base?.stk ? Math.min(base.stk, 1) : 0,
    gold: 0,
    price: 1,
    stats: {},
    multi: {},
    prefixes: [],
    suffixes: [],
    automod: 0,
    fools: false,
    ...patch,
  };
}

// ---- stat ids behind the named attribute codes
export const NAMED_STATS: Record<string, number> = {
  STR: 0, DEX: 2, LIFE: 7, MANA: 9, EDEF: 16, EDAM: 17, MINDMG: 21, MAXDMG: 22, AR: 19, DEF: 31,
  FRES: 39, LRES: 41, CRES: 43, PRES: 45, REPLIFE: 74, MAXDUR: 75, GFIND: 79, MFIND: 80, IAS: 93, FRW: 96,
  FHR: 99, FBR: 102, FCR: 105, DTM: 114, ARPER: 119, ALLSK: 127, MAEK: 138, SOCKETS: 194, SOCK: 194,
  REPAIR: 252, REPQUANT: 253,
};

export function statValue(it: TestItem, id: number): number {
  if (id === 194) return it.sockets;
  return it.stats[id] ?? 0;
}

/** The value STATn compares against. BH scales life/mana targets by 256, so these read like the tooltip. */
export function rawStat(it: TestItem, id: number): number {
  return statValue(it, id);
}

export function has(base: BaseItem | undefined, ...types: string[]) {
  return !!base && types.some((t) => base.tc.includes(t));
}

const GEM_TYPES: Record<string, number> = { gema: 1, gemd: 2, geme: 3, gemr: 4, gems: 5, gemt: 6, gemz: 7 };
const GEM_LETTER: Record<string, number> = { a: 1, d: 2, e: 3, r: 4, s: 5, t: 6, z: 7 };

export function gemInfo(base: BaseItem | undefined): { level: number; type: number } {
  if (!base) return { level: 0, type: 0 };
  // PD2's stacked flawless/perfect gems use types gg3x / gg4x.
  const stacked = base.tc.map((t) => t.match(/^gg([34])([a-z])$/)).find(Boolean);
  if (stacked) return { level: Number(stacked[1]) + 1, type: GEM_LETTER[stacked[2]] ?? 0 };
  const type = base.tc.map((t) => GEM_TYPES[t]).find(Boolean) ?? 0;
  if (!type) return { level: 0, type: 0 };
  const n = base.n;
  const level = n.startsWith("Chipped") ? 1 : n.startsWith("Flawed") ? 2 : n.startsWith("Flawless") ? 4 : n.startsWith("Perfect") ? 5 : 3;
  return { level, type };
}

export function runeNumber(code: string): number {
  const m = code.match(/^r(\d\d)s?$/);
  return m ? Number(m[1]) : 0;
}

/** Map tier as BH reports it: 0 for PvP arenas, 1-5 for maps, -1 for everything else. */
export function mapTier(base: BaseItem | undefined): number {
  // Tier comes from the primary item type (t1m..t5m), not from the code's digits.
  if (!base) return -1;
  const m = base.t.match(/^t(\d)m$/);
  if (m) return Number(m[1]);
  return base.t === "pvpd" || base.t === "pvpm" ? 0 : -1;
}

/** BH's GetAffixLevel: item level, base quality level and the base's "magic lvl". */
export function affixLevel(ilvl: number, qlvl: number, mlvl = 0): number {
  let i = Math.min(ilvl, 99);
  if (qlvl > i) i = qlvl;
  if (mlvl > 0) return Math.min(i + mlvl, 99);
  return i < 99 - Math.floor(qlvl / 2) ? i - Math.floor(qlvl / 2) : 2 * i - 99;
}

export function craftAlvl(it: TestItem, ctx: ViewContext): number {
  const base = lookupCode(it.code);
  const ilvl = Math.floor(ctx.clvl / 2) + Math.floor(it.ilvl / 2);
  return affixLevel(ilvl, base?.ql ?? 1, base?.mlvl);
}

/** BH's ComputeRerollAffixLevel: 0 for maps, corrupted items and anything not magic/rare. */
export function rerollAlvl(it: TestItem, ctx: ViewContext): number {
  const base = lookupCode(it.code);
  if (mapTier(base) >= 0 || statValue(it, 360) > 0) return 0;
  if (it.quality === "rare") return affixLevel((Math.floor(0.4 * it.ilvl) + Math.floor(0.4 * ctx.clvl)) & 0xff, base?.ql ?? 1, base?.mlvl);
  if (it.quality === "magic") return affixLevel(it.ilvl, base?.ql ?? 1, base?.mlvl);
  return 0;
}

/** Resolve a value condition / output value code for an item. Returns undefined when unknown. */
export function valueOf(code: string, it: TestItem, ctx: ViewContext): number | undefined {
  const base = lookupCode(it.code);
  const named = NAMED_STATS[code];
  if (typeof named === "number" && code !== "MINDMG" && code !== "MAXDMG") return statValue(it, named);
  switch (code) {
    case "ED":
      return base?.cat === "armor" ? statValue(it, 16) : statValue(it, 17);
    case "RES":
      return Math.min(statValue(it, 39), statValue(it, 41), statValue(it, 43), statValue(it, 45));
    case "ILVL":
      return it.ilvl;
    case "ALVL":
      return affixLevel(it.ilvl, base?.ql ?? 1, base?.mlvl);
    case "CRAFTALVL":
      return craftAlvl(it, ctx);
    case "REROLLALVL":
      return rerollAlvl(it, ctx);
    case "MINDMG":
      return Math.max(statValue(it, 21), statValue(it, 23), statValue(it, 159));
    case "MAXDMG":
      return Math.max(statValue(it, 22), statValue(it, 24), statValue(it, 160));
    case "QLVL":
      return base?.ql ?? 0;
    case "LVLREQ":
    case "REQLVL":
      return base?.lr ?? 0;
    case "REQSTR":
      return base?.rs ?? 0;
    case "REQDEX":
      return base?.rd ?? 0;
    case "UPLVL":
    case "UPSTR":
    case "UPDEX":
      return 0;
    case "QTY":
      return it.qty;
    case "GOLD":
      return it.code === "gld" ? it.gold : 0;
    case "PRICE":
    case "SELLPRICE":
    case "BUYPRICE":
      return it.price;
    case "RUNE":
      return runeNumber(it.code);
    case "GEMLEVEL":
    case "GEM":
      return gemInfo(base).level;
    case "GEMTYPE":
      return gemInfo(base).type;
    case "MAXSOCKETS":
      return base?.ms ?? 0;
    case "WIDTH":
      return base?.w ?? 0;
    case "HEIGHT":
      return base?.h ?? 0;
    case "AREA":
      return (base?.w ?? 0) * (base?.h ?? 0);
    case "CLVL":
      return ctx.clvl;
    case "DIFF":
      return ctx.diff;
    case "FILTLVL":
      return ctx.filtlvl;
    case "MAPID":
      return ctx.mapid;
    case "MAPTIER":
      return mapTier(base);
    case "BASEMINONEH":
      return base?.dmg?.[0] ?? 0;
    case "BASEMAXONEH":
      return base?.dmg?.[1] ?? 0;
    case "BASEMINTWOH":
      return base?.dmg?.[2] ?? 0;
    case "BASEMAXTWOH":
      return base?.dmg?.[3] ?? 0;
    case "BASEMINTHROW":
      return base?.dmg?.[4] ?? 0;
    case "BASEMAXTHROW":
      return base?.dmg?.[5] ?? 0;
    case "BASEMINKICK":
    case "BASEMAXKICK":
    case "BASEMINSMITE":
    case "BASEMAXSMITE":
      return 0;
    case "BASEBLOCK":
      return base?.blk ?? 0;
    case "MAXRES":
      return Math.min(statValue(it, 40), statValue(it, 42), statValue(it, 44), statValue(it, 46));
    case "ALLATTRIB":
      return Math.min(statValue(it, 0), statValue(it, 1), statValue(it, 2), statValue(it, 3));
    case "WPNSPD":
      return base?.spd ?? 0;
    case "RANGE":
      return 0;
    case "AUTOMOD":
      // wAutoPrefix minus BH's offset: negative when the item has no automod.
      return it.automod || -1;
    case "GOODSK":
    case "GOODTBSK":
      return 0;
  }
  return undefined;
}

/** Evaluate a parameterised code (STAT60, SK54, MULTI107,20, CLSK2, CHARSTAT15 ...). */
export function paramValue(prefix: string, params: number[], it: TestItem, ctx: ViewContext): number {
  const [a, b] = params;
  switch (prefix) {
    case "STAT":
      return rawStat(it, a);
    case "CHARSTAT":
      return ctx.charstats[a] ?? 0;
    case "MULTI":
      return it.multi[`${a},${b ?? 0}`] ?? 0;
    case "SK":
      return it.multi[`107,${a}`] ?? 0;
    case "OS":
      return it.multi[`97,${a}`] ?? 0;
    case "CHSK": {
      // Charges are keyed by (skill*64 + level); CHSKn is the highest charge level of skill n.
      let best = 0;
      for (const k of Object.keys(it.multi)) {
        const [s, layer] = k.split(",").map(Number);
        if (s === 204 && Math.floor(layer / 64) === a) best = Math.max(best, layer % 64);
      }
      return best;
    }
    case "CLSK":
      return it.multi[`83,${a}`] ?? 0;
    case "TABSK":
      return it.multi[`188,${a}`] ?? 0;
  }
  return 0;
}

/** Default in-game color for an item's name. */
export function defaultColor(it: TestItem): string {
  const base = lookupCode(it.code);
  if (base?.col) return base.col;
  if (it.runeword) return "GOLD";
  switch (it.quality) {
    case "magic":
      return "BLUE";
    case "rare":
      return "YELLOW";
    case "set":
      return "GREEN";
    case "unique":
      return "GOLD";
    case "crafted":
      return "ORANGE";
  }
  if (it.ethereal || it.sockets > 0) return "GRAY";
  return "WHITE";
}

/** The name the game would show before any filter rule touches it. */
export function defaultName(it: TestItem): string {
  const base = lookupCode(it.code);
  const bn = base?.n ?? it.code;
  if (it.code === "gld") return `${it.gold} Gold`;
  if (!it.identified && (it.quality === "unique" || it.quality === "set" || it.quality === "rare" || it.quality === "crafted")) return bn;
  if (it.runeword && it.title) return it.title;
  switch (it.quality) {
    case "inferior":
      return `Low Quality ${bn}`;
    case "superior":
      return `Superior ${bn}`;
    case "magic":
      return it.identified ? it.title || bn : bn;
    case "rare":
    case "crafted":
    case "unique":
    case "set":
      return it.title || bn;
  }
  return bn;
}

export function qualityLabel(q: Quality) {
  return q[0].toUpperCase() + q.slice(1);
}
