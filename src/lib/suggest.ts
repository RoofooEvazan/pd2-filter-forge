// "Did you mean…?" suggestions for unknown condition tokens and item codes.
import { COND_BY_CODE, OUT_BY_CODE } from "./spec";
import { DATA } from "./data";
import type { Definitions } from "./document";

/** Optimal string alignment distance (Levenshtein plus adjacent swaps), capped for speed. */
export function editDistance(a: string, b: string, cap = 4): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > cap) return cap + 1;
  }
  return d[a.length][b.length];
}

export interface Suggestion {
  text: string;
  why: string;
}

function best<T>(target: string, pool: Iterable<T>, key: (t: T) => string, maxDist: number, limit = 3): { t: T; d: number }[] {
  const out: { t: T; d: number }[] = [];
  for (const t of pool) {
    const k = key(t);
    const dist = editDistance(target, k, maxDist);
    if (dist <= maxDist) out.push({ t, d: dist });
  }
  return out.sort((x, y) => x.d - y.d).slice(0, limit);
}

/** Suggestions for an unrecognised uppercase-ish condition keyword. */
export function suggestKeyword(key: string, defs?: Definitions): Suggestion[] {
  const up = key.toUpperCase();
  const out: Suggestion[] = [];
  // Wrong case of a real keyword (e.g. "Eth", "uni" is an item code though).
  if (COND_BY_CODE.has(up) && up !== key) out.push({ text: up, why: `keywords are upper case (${COND_BY_CODE.get(up)!.label})` });
  const maxDist = key.length <= 4 ? 1 : 2;
  const kws = [...COND_BY_CODE.entries()].filter(([, k]) => k.kind !== "logic");
  for (const { t } of best(up, kws, ([c]) => c, maxDist)) if (!out.some((s) => s.text === t[0])) out.push({ text: t[0], why: t[1].label });
  if (defs) for (const { t } of best(key, defs.aliases.keys(), (a) => a, maxDist)) if (t !== key && !out.some((s) => s.text === t)) out.push({ text: t, why: "alias in this filter" });
  return out.filter((s) => s.text !== key).slice(0, 3);
}

/** Suggestions for an item code that doesn't exist. */
export function suggestItemCode(code: string, neighbours: string[] = []): Suggestion[] {
  const c = code.toLowerCase();
  const out: Suggestion[] = [];
  const items = DATA.items;
  // One character different: the usual typo (bux -> buc). Codes that continue the family of the
  // other codes in the same rule rank first ("aqv OR aq2" -> aqv2, not am2).
  const related = (x: string) => neighbours.some((n) => x.startsWith(n.slice(0, 3)) || n.startsWith(x.slice(0, 3)));
  const near = best(c, items, (i) => i.c, 1, 12).sort((x, y) => x.d - y.d || Number(related(y.t.c)) - Number(related(x.t.c)));
  for (const { t } of near.slice(0, 4)) out.push({ text: t.c, why: t.n });
  // A name typed instead of a code ("shako").
  const byName = items.find((i) => i.n.toLowerCase().replace(/[^a-z0-9]/g, "") === c.replace(/[^a-z0-9]/g, ""));
  if (byName && !out.some((s) => s.text === byName.c)) out.unshift({ text: byName.c, why: `${byName.n} (code for the name you typed)` });
  return out.slice(0, 4);
}

/** Suggestions for an unknown %KEYWORD% in output. */
export function suggestOutputKeyword(code: string, defs?: Definitions): Suggestion[] {
  const up = code.toUpperCase();
  // Two letters ("td", "ml") are almost always text next to a literal %, not a misspelt keyword.
  if (up.replace(/[^A-Z]/g, "").length < 3) return [];
  const pool = [...OUT_BY_CODE.keys()];
  const out: Suggestion[] = best(up, pool, (k) => k, up.length <= 4 ? 1 : 2).map(({ t }) => ({ text: `%${t}%`, why: OUT_BY_CODE.get(t)!.label }));
  if (defs) for (const { t } of best(up, [...defs.aliases.keys()], (a) => a.toUpperCase(), 2)) out.push({ text: `%${t.toUpperCase()}%`, why: "alias in this filter" });
  return out.slice(0, 3);
}
