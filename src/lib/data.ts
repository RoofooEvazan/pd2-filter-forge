// Typed access to the PD2 game data snapshot (src/data/pd2data.json, built by scripts/build-data.mjs).
import raw from "../data/pd2data.json";

export interface BaseItem {
  c: string;
  n: string;
  cat: "armor" | "weapon" | "misc";
  t: string;
  tc: string[];
  w: number;
  h: number;
  lr: number;
  ql: number;
  col?: string;
  tier?: "n" | "x" | "e";
  ms?: number;
  hand?: "1" | "2" | "12";
  dmg?: number[];
  spd?: number;
  rs?: number;
  rd?: number;
  def?: number[];
  blk?: number;
  stk?: number;
  fam?: string[];
  mlvl?: number;
}
export interface Named { n: string; c: string; lr: number; ql?: number; set?: string }
export interface Runeword { n: string; runes: string[]; types: string[] }
export interface StatInfo { id: number; key: string; d: string; wiki?: boolean }
export interface SkillInfo { id: number; n: string; cls: string; gray?: boolean }
export interface IdName { id: number; n: string }
export interface Affix { id: number; n: string; lvl: number; g: number; mods: string[]; it: string[] }

interface Data {
  meta: { statRecs: number; skillRecs: number; soundRecs: number; source: string; pd2dataModified: string; extracted: string; built: string };
  items: BaseItem[];
  uniques: Named[];
  sets: Named[];
  runewords: Runeword[];
  stats: StatInfo[];
  skills: SkillInfo[];
  zones: IdName[];
  corruptions: IdName[];
  prefixes: Affix[];
  suffixes: Affix[];
  sounds: [number, string][];
  types: { c: string; n: string; eq: string[] }[];
  palette: string[];
}

export const DATA = raw as unknown as Data;
export const ITEM_BY_CODE = new Map(DATA.items.map((i) => [i.c, i]));
export const STAT_BY_ID = new Map(DATA.stats.map((s) => [s.id, s]));
export const SKILL_BY_ID = new Map(DATA.skills.map((s) => [s.id, s]));
export const ZONE_BY_ID = new Map(DATA.zones.map((z) => [z.id, z]));
export const SOUND_BY_ID = new Map(DATA.sounds);
export const PALETTE = DATA.palette;

/** Match a filter code the way BH does: first 4 characters, compared to the item code. */
export function lookupCode(code: string): BaseItem | undefined {
  return ITEM_BY_CODE.get(code.slice(0, 4)) ?? ITEM_BY_CODE.get(code);
}

export function tierName(t?: string) {
  return t === "e" ? "Elite" : t === "x" ? "Exceptional" : t === "n" ? "Normal" : "";
}

export interface SearchHit {
  kind: "base" | "unique" | "set" | "runeword";
  code: string;
  name: string;
  detail: string;
  score: number;
}

function score(hay: string, q: string) {
  const h = hay.toLowerCase();
  if (h === q) return 100;
  if (h.startsWith(q)) return 80;
  const i = h.indexOf(" " + q);
  if (i >= 0) return 60;
  if (h.includes(q)) return 40;
  return 0;
}

/** Search bases, uniques, sets and runewords by name or code. */
export function searchItems(query: string, limit = 40): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: SearchHit[] = [];
  for (const i of DATA.items) {
    const s = Math.max(score(i.n, q), i.c === q ? 100 : i.c.startsWith(q) ? 50 : 0);
    if (s) hits.push({ kind: "base", code: i.c, name: i.n, detail: [tierName(i.tier), i.cat, i.c].filter(Boolean).join(" · "), score: s + 5 });
  }
  for (const u of DATA.uniques) {
    const s = score(u.n, q);
    if (s) hits.push({ kind: "unique", code: u.c, name: u.n, detail: `Unique ${ITEM_BY_CODE.get(u.c)?.n ?? u.c}`, score: s });
  }
  for (const u of DATA.sets) {
    const s = score(u.n, q);
    if (s) hits.push({ kind: "set", code: u.c, name: u.n, detail: `${u.set} · ${ITEM_BY_CODE.get(u.c)?.n ?? u.c}`, score: s });
  }
  for (const r of DATA.runewords) {
    const s = score(r.n, q);
    if (s) hits.push({ kind: "runeword", code: r.runes.join(" "), name: r.n, detail: r.runes.map((c) => ITEM_BY_CODE.get(c)?.n.replace(" Rune", "") ?? c).join(" + "), score: s });
  }
  return hits.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, limit);
}

/** Normal, exceptional and elite versions of a base, e.g. Cap / War Hat / Shako. */
export function tierFamily(code: string): string[] {
  return ITEM_BY_CODE.get(code)?.fam ?? [code];
}
