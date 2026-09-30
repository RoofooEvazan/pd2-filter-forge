// Real names for unidentified uniques and sets. When a base has exactly one possible unique (or set
// item), the name shows before identifying ("Harlequin Crest" instead of "Shako"). When it has several,
// the name stays and the tooltip lists what it could be.
//
// The rules continue, so the filter's own rules below still style these items: %NAME% there is the
// real name. They live in their own block at the very top (see blockAnchor in simple.ts).
import { makeBlank, makeComment, makeRule, type Line } from "./document";
import { DATA, ITEM_BY_CODE } from "./data";
import { UNID_BLURB, UNID_HEADER, UNID_TAG, blockAnchor, blockMask, isUnidLine } from "./simple";

export interface UnidOptions {
  uniques: boolean;
  sets: boolean;
  /** For bases with several possibilities, add "Could be: …" to the tooltip. */
  possibilities: boolean;
  /** Keep the base type after the name: "Harlequin Crest (Shako)". */
  withBase: boolean;
}

export const DEFAULT_UNID: UnidOptions = { uniques: true, sets: true, possibilities: true, withBase: false };

/** Possible names per base code, without duplicates (PD2 has several "Rainbow Facet" rows). */
function namesByCode(rows: { n: string; c: string }[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const r of rows) {
    const list = m.get(r.c) ?? m.set(r.c, []).get(r.c)!;
    if (!list.includes(r.n)) list.push(r.n);
  }
  return m;
}
export const UNIQUE_NAMES = namesByCode(DATA.uniques);
export const SET_NAMES = namesByCode(DATA.sets);

const plain = (s: string) => s.replace(/\/\//g, "/").replace(/%/g, "%PERCENT%").replace(/\{/g, "%LBRACE%").replace(/\}/g, "%RBRACE%");

/** "Could be: A, B, C" split over short lines so the tooltip stays narrow. */
function couldBe(names: string[]): string {
  const shown = names.slice(0, 8);
  const more = names.length - shown.length;
  const rows: string[] = [];
  for (let i = 0; i < shown.length; i += 3) rows.push(shown.slice(i, i + 3).map(plain).join(", "));
  if (more > 0) rows.push(`and ${more} more`);
  return `%GRAY%Could be: ${rows.join("%CL%")}`;
}

function rulesFor(names: Map<string, string[]>, flag: "UNI" | "SET", o: UnidOptions): Line[] {
  const out: Line[] = [];
  for (const [code, list] of names) {
    const base = ITEM_BY_CODE.get(code);
    if (!base) continue;
    const cond = `${code} ${flag} !ID`;
    if (list.length === 1) {
      const name = plain(list[0]) + (o.withBase ? ` (${plain(base.n)})` : "");
      out.push(makeRule(cond, `${name}%CONTINUE%`, `${UNID_TAG}${flag.toLowerCase()}`));
    } else if (o.possibilities) {
      // Inside braces %NAME% is the description so far; the list goes on a line above it.
      out.push(makeRule(cond, `%NAME%{%NAME%%CL%${couldBe(list)}}%CONTINUE%`, `${UNID_TAG}${flag.toLowerCase()}`));
    }
  }
  return out;
}

export function readUnid(lines: Line[]): UnidOptions | null {
  for (const l of lines) {
    if (l.kind === "comment" && l.text?.startsWith(`${UNID_TAG}options `)) {
      try {
        return { ...DEFAULT_UNID, ...JSON.parse(l.text.slice(`${UNID_TAG}options `.length)) };
      } catch {
        return { ...DEFAULT_UNID };
      }
    }
  }
  return null;
}

/** Write (or with null, remove) the block. */
export function writeUnid(lines: Line[], o: UnidOptions | null): Line[] {
  const mask = blockMask(lines, isUnidLine);
  const first = mask.indexOf(true);
  const kept = lines.filter((_, i) => !mask[i]);
  if (!o || (!o.uniques && !o.sets)) return kept;
  const at = first >= 0 ? lines.slice(0, first).filter((_, i) => !mask[i]).length : blockAnchor(kept, 0);
  const block: Line[] = [makeComment(UNID_HEADER), makeComment(UNID_BLURB), makeComment(`${UNID_TAG}options ${JSON.stringify(o)}`)];
  if (o.uniques) block.push(...rulesFor(UNIQUE_NAMES, "UNI", o));
  if (o.sets) block.push(...rulesFor(SET_NAMES, "SET", o));
  block.push(makeBlank());
  return [...kept.slice(0, at), ...block, ...kept.slice(at)];
}

export function unidStats() {
  const count = (m: Map<string, string[]>) => ({ single: [...m.values()].filter((v) => v.length === 1).length, multi: [...m.values()].filter((v) => v.length > 1).length });
  return { uniques: count(UNIQUE_NAMES), sets: count(SET_NAMES) };
}
