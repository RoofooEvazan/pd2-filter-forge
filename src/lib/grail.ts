// Holy grail (Season 14 Compendium). Uniques and set items you haven't found yet get a tag after
// their name (and optionally a drop alert); ones you've found are hidden, except the items your
// filter shows specifically: the rule that decides how they look names their base, or they're a
// Simple mode choice.
//
// Built on BH's ANYDISCOVERED / ALLDISCOVERED. An unidentified item asks about every unique/set it
// could be, so "!ALLDISCOVERED" marks a possible new find and "ALLDISCOVERED" means nothing new.
// The block sits below the unidentified-names and shop blocks and above the Simple choices.
//
// Game versions before Season 14 don't know these words and silently drop them. Both rules are
// written so that leaves a lone "!", which makes PD2 skip the rule: "UNI !ALLDISCOVERED" and
// "UNI !(!ALLDISCOVERED)" (= ALLDISCOVERED). A plain "UNI ALLDISCOVERED" would hide every unique.
import { makeBlank, makeComment, makeRule, type Line } from "./document";
import { DATA, ITEM_BY_CODE } from "./data";
import { compileDoc, runFilter } from "./engine";
import { DEFAULT_CTX, makeItem, type GrailState } from "./item";
import { composeOutput, type Effects } from "./output";
import { GRAIL_BLURB, GRAIL_HEADER, GRAIL_TAG, blockAnchor, blockMask, isGrailLine, isManaged } from "./simple";

export interface GrailOptions {
  uniques: boolean;
  sets: boolean;
  /** Tag items that could be a new find. */
  mark: boolean;
  /** Text after the name, e.g. " [NEW]". */
  markText: string;
  markColor: string;
  /** Unidentified items: tag when any possibility is still missing, or only when none is found yet. */
  unid: "any" | "none";
  /** Drop alert for possible new finds. It replaces the filter's own alert for those items. */
  icon?: { size: "px" | "dot" | "map" | "border"; hex: string };
  sound?: number;
  /** Hide found items: never, always, or from this filter level upward. */
  hide: "off" | "always" | number;
  /** Items to keep showing after they're found, besides the ones the filter shows specifically ("uni.uap"). */
  keepExtra: string[];
  /** Items the filter shows specifically but that should be hidden once found anyway. */
  hideAnyway: string[];
}

export const DEFAULT_GRAIL: GrailOptions = { uniques: true, sets: true, mark: true, markText: " [NEW]", markColor: "PURPLE", unid: "any", hide: "always", keepExtra: [], hideAnyway: [] };

type Q = "uni" | "set";
const FLAG: Record<Q, string> = { uni: "UNI", set: "SET" };

/** Base codes that have a unique / set version, with the names they could be. */
function namesByCode(rows: { n: string; c: string }[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const r of rows) {
    if (!ITEM_BY_CODE.has(r.c)) continue;
    const list = m.get(r.c) ?? m.set(r.c, []).get(r.c)!;
    if (!list.includes(r.n)) list.push(r.n);
  }
  return m;
}
export const GRAIL_BASES: Record<Q, Map<string, string[]>> = { uni: namesByCode(DATA.uniques), set: namesByCode(DATA.sets) };

const plain = (s: string) => s.replace(/\/\//g, "/").replace(/%/g, "%PERCENT%").replace(/\{/g, "%LBRACE%").replace(/\}/g, "%RBRACE%");
const wordRe = (code: string) => new RegExp(`(^|[\\s(!])${code}(?=$|[\\s)!])`);

/**
 * Items the filter shows specifically: once found, they still show. Checked on the filter without
 * this block, for each base in both identified and unidentified form.
 */
export function specificKeeps(lines: Line[]): string[] {
  const rest = lines.filter((l) => !isGrailLine(l));
  const c = compileDoc({ lines: rest, eol: "\n" });
  const out: string[] = [];
  for (const q of ["uni", "set"] as const) {
    for (const code of GRAIL_BASES[q].keys()) {
      const specific = [false, true].some((identified) => {
        const r = runFilter(c, makeItem(code, { quality: q === "uni" ? "unique" : "set", identified, discovered: "all", owned: "all" }), { ...DEFAULT_CTX, filtlvl: 1, location: "GROUND" });
        if (r.hidden || r.final == null) return false;
        const line = rest[r.final];
        // A Simple mode choice is always specific; otherwise the deciding rule has to name the base.
        if (line?.note?.startsWith("@ff ")) return true;
        return !!line && !isManaged(line) && wordRe(code).test(line.key ?? "");
      });
      if (specific) out.push(`${q}.${code}`);
    }
  }
  return out;
}

/** What stays shown after it's found. */
export function keepList(lines: Line[], o: GrailOptions): string[] {
  const set = new Set(specificKeeps(lines).filter((k) => !o.hideAnyway.includes(k)));
  for (const k of o.keepExtra) set.add(k);
  return [...set].sort();
}

function rulesFor(q: Q, o: GrailOptions, keep: string[]): Line[] {
  const out: Line[] = [];
  const flag = FLAG[q];
  if (o.mark) {
    const effects: Effects = { cont: true, ...(o.icon ? { [o.icon.size]: o.icon.hex } : {}), ...(o.sound != null ? { sound: o.sound } : {}) };
    // After the name, so the filter's own rules below can still color the name itself.
    const name = `%NAME%${o.markText ? `%${o.markColor}%${plain(o.markText)}` : ""}`;
    out.push(makeRule(`${flag} ${o.unid === "any" ? "!ALLDISCOVERED" : "!ANYDISCOVERED"}`, composeOutput({ name, desc: null, effects }), `${GRAIL_TAG}${q} new`));
  }
  if (o.hide !== "off") {
    const codes = keep.filter((k) => k.startsWith(`${q}.`)).map((k) => k.slice(q.length + 1));
    const level = typeof o.hide === "number" ? ` FILTLVL>${Math.max(0, o.hide - 1)}` : "";
    const except = codes.length ? ` !(${codes.join(" OR ")})` : "";
    out.push(makeRule(`${flag} !(!ALLDISCOVERED)${level}${except}`, "", `${GRAIL_TAG}${q} found`));
  }
  return out;
}

export function readGrail(lines: Line[]): GrailOptions | null {
  for (const l of lines) {
    if (l.kind === "comment" && l.text?.startsWith(`${GRAIL_TAG}options `)) {
      try {
        return { ...DEFAULT_GRAIL, ...JSON.parse(l.text.slice(`${GRAIL_TAG}options `.length)) };
      } catch {
        return { ...DEFAULT_GRAIL };
      }
    }
  }
  return null;
}

/** The keep list as written in the file (to tell when the filter has changed since). */
export function writtenKeeps(lines: Line[]): string[] {
  const out: string[] = [];
  for (const l of lines) {
    const m = l.kind === "rule" && l.note?.match(/^@ffg (uni|set) found/);
    if (!m) continue;
    const ex = (l.key ?? "").match(/!\(([^)]*)\)\s*$/);
    if (ex) for (const c of ex[1].split(/\s+OR\s+/)) if (/^[a-z0-9]{3,4}$/.test(c.trim())) out.push(`${m[1]}.${c.trim()}`);
  }
  return out.sort();
}

/** Write (or with null, remove) the block. */
export function writeGrail(lines: Line[], o: GrailOptions | null): Line[] {
  const mask = blockMask(lines, isGrailLine);
  const first = mask.indexOf(true);
  const kept = lines.filter((_, i) => !mask[i]);
  if (!o || (!o.uniques && !o.sets) || (!o.mark && o.hide === "off")) return kept;
  const at = first >= 0 ? lines.slice(0, first).filter((_, i) => !mask[i]).length : blockAnchor(kept, 2);
  const keep = o.hide !== "off" ? keepList(kept, o) : [];
  const block: Line[] = [makeComment(GRAIL_HEADER), makeComment(GRAIL_BLURB), makeComment(`${GRAIL_TAG}options ${JSON.stringify(o)}`)];
  if (o.uniques) block.push(...rulesFor("uni", o, keep));
  if (o.sets) block.push(...rulesFor("set", o, keep));
  block.push(makeBlank());
  return [...kept.slice(0, at), ...block, ...kept.slice(at)];
}

/** Rewrite the block (if there is one) so its keep list follows the rest of the filter. */
export function refreshGrail(lines: Line[]): Line[] {
  const o = readGrail(lines);
  return o ? writeGrail(lines, o) : lines;
}

export function grailStats() {
  return { uniques: GRAIL_BASES.uni.size, sets: GRAIL_BASES.set.size, uniqueItems: new Set(DATA.uniques.map((u) => u.n)).size, setItems: new Set(DATA.sets.map((u) => u.n)).size };
}

export const GRAIL_STATES: { v: GrailState; label: string }[] = [
  { v: "none", label: "Not found" },
  { v: "some", label: "Some possibilities found" },
  { v: "all", label: "Found" },
];
