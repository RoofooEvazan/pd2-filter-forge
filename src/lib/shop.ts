// Shop hunting: what to look for in vendor windows, and how to make it jump out of the tooltip.
//
// Targets live in their own block at the top of the filter (above the Simple mode block, so they
// win in shops). Each rule carries "//@ffs <id> {json}" so the editor can read its work back.
import { makeBlank, makeComment, makeRule, type Line } from "./document";
import { composeOutput } from "./output";
import { CLASS_NAMES, TAB_NAMES } from "./spec";
import { ITEM_BY_CODE, SKILL_BY_ID } from "./data";
import { makeItem, type Quality, type TestItem } from "./item";
import { SHOP_BLURB, SHOP_HEADER, SHOP_TAG, blockAnchor, blockMask, isShopLine } from "./simple";

export type ShopQuality = "white" | "superior" | "magic" | "rare";

export type ShopNeed =
  | { k: "tab"; tab: number; min: number }
  | { k: "class"; cls: number; min: number }
  | { k: "skill"; skill: number; min: number }
  | { k: "stat"; stat: string; min: number }
  | { k: "sockets"; min: number; max: number };

export type ShopStyle = "spotlight" | "tag" | "readout" | "alarm" | "quiet";

export interface ShopLook {
  style: ShopStyle;
  /** Color of the item name. */
  color: string;
  /** Color of the markers, tag and value line. */
  accent: string;
  /** Text for the "tag" style, e.g. BUY. */
  tag: string;
  /** Add a line with the values you're hunting for (+3 Lightning, 20 FCR…). */
  values: boolean;
  /** Optional note shown in the tooltip, e.g. "Hydra orb!" */
  note: string;
  /** Recolor the price line (a trailing color keyword). */
  price?: string;
}

export interface ShopTarget {
  id: string;
  name: string;
  on: boolean;
  items: string;
  qualities: ShopQuality[];
  needs: ShopNeed[];
  look: ShopLook;
}

export interface ShopOptions {
  /** Gray out every other item in vendor windows so targets stand out. */
  dimOthers: boolean;
}

// ------------------------------------------------------------------ vocabulary

export const SHOP_ITEMS: { id: string; label: string; cond: string }[] = [
  { id: "any", label: "Anything", cond: "" },
  { id: "weapon", label: "Weapons", cond: "WEAPON" },
  { id: "armor", label: "Armor", cond: "ARMOR" },
  { id: "class", label: "Class items", cond: "CLASS" },
  { id: "circ", label: "Circlets", cond: "CIRC" },
  { id: "jewelry", label: "Rings & amulets", cond: "JEWELRY" },
  { id: "helm", label: "Helms", cond: "HELM" },
  { id: "chest", label: "Body armor", cond: "CHEST" },
  { id: "shield", label: "Shields", cond: "SHIELD" },
  { id: "gloves", label: "Gloves", cond: "GLOVES" },
  { id: "boots", label: "Boots", cond: "BOOTS" },
  { id: "belt", label: "Belts", cond: "BELT" },
  { id: "caster", label: "Staves, wands, orbs & scepters", cond: "(STAFF OR WAND OR SCEPTER OR SOR)" },
  { id: "jav", label: "Javelins & spears", cond: "(JAV OR SPEAR OR ZON)" },
  { id: "bow", label: "Bows & crossbows", cond: "(BOW OR XBOW)" },
  { id: "melee", label: "Melee weapons", cond: "WEAPON !BOW !XBOW !JAV !THROWING !STAFF !WAND !SOR" },
];

export const SHOP_QUALITIES: { id: ShopQuality; label: string; cond: string }[] = [
  { id: "white", label: "White / grey", cond: "NMAG !SUP" },
  { id: "superior", label: "Superior", cond: "SUP" },
  { id: "magic", label: "Magic", cond: "MAG" },
  { id: "rare", label: "Rare", cond: "RARE" },
];

/** Stats you can require. `cond` is the condition code, `out` prints the value (omitted when PD2 prints it scaled). */
export const SHOP_STATS: { id: string; label: string; short: string; cond: string; out?: string }[] = [
  { id: "FCR", label: "Faster cast rate", short: "FCR", cond: "STAT105", out: "%STAT105%" },
  { id: "IAS", label: "Increased attack speed", short: "IAS", cond: "STAT93", out: "%STAT93%" },
  { id: "FRW", label: "Faster run/walk", short: "FRW", cond: "STAT96", out: "%STAT96%" },
  { id: "FHR", label: "Faster hit recovery", short: "FHR", cond: "STAT99", out: "%STAT99%" },
  { id: "ED", label: "Enhanced damage / defense %", short: "ED", cond: "ED", out: "%ED%" },
  { id: "RES", label: "All resistances", short: "res", cond: "RES", out: "%RES%" },
  { id: "MF", label: "Magic find", short: "MF", cond: "STAT80", out: "%STAT80%" },
  { id: "ALLSK", label: "+ all skills", short: "all skills", cond: "STAT127", out: "%STAT127%" },
  { id: "STR", label: "Strength", short: "Str", cond: "STAT0", out: "%STAT0%" },
  { id: "DEX", label: "Dexterity", short: "Dex", cond: "STAT2", out: "%STAT2%" },
  { id: "LIFE", label: "Life", short: "Life", cond: "LIFE" },
  { id: "MANA", label: "Mana", short: "Mana", cond: "MANA" },
];
export const STAT_BY_ID = new Map(SHOP_STATS.map((s) => [s.id, s]));

export function classTabs(cls: number): number[] {
  return [cls * 8, cls * 8 + 1, cls * 8 + 2];
}
export const tabShort = (tab: number) => TAB_NAMES[tab]?.split(": ")[1] ?? `Tab ${tab}`;

export const SHOP_COLORS = ["WHITE", "GRAY", "RED", "ORANGE", "GOLD", "YELLOW", "TAN", "GREEN", "SAGE", "TEAL", "BLUE", "PURPLE"];

export const SHOP_STYLES: { id: ShopStyle; label: string; blurb: string }[] = [
  { id: "spotlight", label: "Spotlight", blurb: ">>> Name <<< in two colors" },
  { id: "tag", label: "Price tag", blurb: "[BUY] in front of the name" },
  { id: "readout", label: "Stat readout", blurb: "Name, with the stats you want on a line above" },
  { id: "alarm", label: "Alarm", blurb: "!!! Name !!! for the rare finds" },
  { id: "quiet", label: "Just color", blurb: "Only recolors the name" },
];

// ------------------------------------------------------------------ building rules

export function needCond(n: ShopNeed): string {
  switch (n.k) {
    case "tab":
      return `TABSK${n.tab}>${n.min - 1}`;
    case "class":
      return `CLSK${n.cls}>${n.min - 1}`;
    case "skill":
      return `SK${n.skill}>${n.min - 1}`;
    case "stat":
      return `${STAT_BY_ID.get(n.stat)?.cond ?? n.stat}>${n.min - 1}`;
    case "sockets":
      return n.max < 6 ? `SOCK~${n.min}-${n.max}` : `SOCK>${n.min - 1}`;
  }
}

export function needLabel(n: ShopNeed): string {
  switch (n.k) {
    case "tab":
      return `+${n.min} ${tabShort(n.tab)} skills`;
    case "class":
      return `+${n.min} ${CLASS_NAMES[n.cls]} skills`;
    case "skill":
      return `+${n.min} ${SKILL_BY_ID.get(n.skill)?.n ?? `skill ${n.skill}`}`;
    case "stat":
      return `${n.min}+ ${STAT_BY_ID.get(n.stat)?.short ?? n.stat}`;
    case "sockets":
      return n.max < 6 && n.max !== n.min ? `${n.min}–${n.max} sockets` : n.max === n.min ? `${n.min} sockets` : `${n.min}+ sockets`;
  }
}

/** The value line for the readout: "+%TABSK9% Lightning · %STAT105% FCR". */
function valueLine(t: ShopTarget): string {
  const parts = t.needs.flatMap((n) => {
    switch (n.k) {
      case "tab":
        return [`+%TABSK${n.tab}% ${tabShort(n.tab)}`];
      case "class":
        return [`+%CLSK${n.cls}% ${CLASS_NAMES[n.cls]}`];
      case "skill":
        return [`+%SK${n.skill}% ${SKILL_BY_ID.get(n.skill)?.n ?? ""}`];
      case "stat": {
        const s = STAT_BY_ID.get(n.stat);
        return s?.out ? [`${s.out} ${s.short}`] : [s?.short ?? n.stat];
      }
      case "sockets":
        return ["%SOCKETS% os"];
    }
  });
  return parts.join(" · ");
}

const plain = (s: string) => s.replace(/\/\//g, "/").replace(/%/g, "%PERCENT%").replace(/\{/g, "%LBRACE%").replace(/\}/g, "%RBRACE%");

export function targetCond(t: ShopTarget): string {
  const parts = ["SHOP"];
  const items = SHOP_ITEMS.find((x) => x.id === t.items)?.cond;
  if (items) parts.push(items);
  const qs = SHOP_QUALITIES.filter((q) => t.qualities.includes(q.id)).map((q) => q.cond);
  if (qs.length === 1) parts.push(qs[0]);
  else if (qs.length > 1) parts.push(`(${qs.map((c) => (c.includes(" ") ? `(${c})` : c)).join(" OR ")})`);
  parts.push(...t.needs.map(needCond));
  return parts.join(" ");
}

export function targetOutput(t: ShopTarget): string {
  const L = t.look;
  const c = `%${L.color}%`;
  const a = `%${L.accent}%`;
  let name: string;
  switch (L.style) {
    case "spotlight":
      name = `${a}>>> ${c}%NAME% ${a}<<<`;
      break;
    case "tag":
      name = `${a}[${plain(L.tag || "BUY")}] ${c}%NAME%`;
      break;
    case "alarm":
      name = `${a}!!! ${c}%NAME% ${a}!!!`;
      break;
    case "readout":
    case "quiet":
      name = `${c}%NAME%`;
      break;
  }
  // Lines stack upward, so the value line written after %NL% sits above the name.
  const values = (L.style === "readout" || L.values) && t.needs.length ? `%NL%${a}${valueLine(t)}` : "";
  // Inside braces %NAME% is the item's existing description; the note goes on a line above it.
  const desc = L.note.trim() ? `%NAME%%CL%${a}${plain(L.note.trim())}` : null;
  return composeOutput({ name: name + values, desc, effects: { cont: false } }) + (L.price ? `%${L.price}%` : "");
}

// ------------------------------------------------------------------ templates

let seq = 0;
const tid = () => `t${Date.now().toString(36)}${(seq++).toString(36)}`;

const look = (style: ShopStyle, color: string, accent: string, extra: Partial<ShopLook> = {}): ShopLook => ({ style, color, accent, tag: "BUY", values: false, note: "", ...extra });

export interface ShopTemplate {
  key: string;
  name: string;
  blurb: string;
  make: () => ShopTarget;
}

/** Suggestions for the chosen class, each with its own loud, contrasting look. */
export function shopTemplates(cls: number): ShopTemplate[] {
  const tabs = classTabs(cls);
  const cn = CLASS_NAMES[cls];
  const t = (key: string, name: string, blurb: string, body: Omit<ShopTarget, "id" | "name" | "on">): ShopTemplate => ({ key, name, blurb, make: () => ({ id: tid(), name, on: true, ...body }) });
  return [
    ...tabs.map((tab, i) =>
      t(`tab${tab}`, `+3 ${tabShort(tab)}`, `Any ${cn} item with +3 to ${tabShort(tab)} skills.`, {
        items: "any",
        qualities: [],
        needs: [{ k: "tab", tab, min: 3 }],
        look: look("readout", "WHITE", ["ORANGE", "TEAL", "PURPLE"][i], { values: true }),
      })
    ),
    t(`class${cls}`, `+2 ${cn} skills`, `Circlets, amulets and class items with +2 to all ${cn} skills.`, {
      items: "any",
      qualities: [],
      needs: [{ k: "class", cls, min: 2 }],
      look: look("spotlight", "GOLD", "RED", { values: true }),
    }),
    t(`caster${cls}`, "Caster weapon: +2 tree & 20 FCR", `A +2 ${tabShort(tabs[0])} weapon that also casts faster.`, {
      items: "weapon",
      qualities: ["magic"],
      needs: [{ k: "tab", tab: tabs[0], min: 2 }, { k: "stat", stat: "FCR", min: 20 }],
      look: look("alarm", "YELLOW", "RED", { values: true, note: "Caster upgrade" }),
    }),
    t("circ", "Circlet: +2 skills & run speed", "The classic shopped circlet.", {
      items: "circ",
      qualities: ["magic"],
      needs: [{ k: "class", cls, min: 2 }, { k: "stat", stat: "FRW", min: 10 }],
      look: look("tag", "WHITE", "GREEN", { tag: "BUY", values: true }),
    }),
    t("bases", "Runeword base: 4+ sockets", "White or grey bases with 4 or more sockets.", {
      items: "any",
      qualities: ["white", "superior"],
      needs: [{ k: "sockets", min: 4, max: 6 }],
      look: look("tag", "GRAY", "TEAL", { tag: "BASE", values: true }),
    }),
    t("boots", "Boots: 20+ FRW", "Fast boots for the early game.", {
      items: "boots",
      qualities: ["magic", "rare"],
      needs: [{ k: "stat", stat: "FRW", min: 20 }],
      look: look("spotlight", "SAGE", "GREEN", { values: true }),
    }),
    t("sup", "Superior armor: 15% ED", "Superior body armor worth upgrading or socketing.", {
      items: "chest",
      qualities: ["superior"],
      needs: [{ k: "stat", stat: "ED", min: 15 }],
      look: look("readout", "TAN", "GOLD", { values: true }),
    }),
    t("allsk", "+1 to all skills", "Anything with + all skills.", {
      items: "any",
      qualities: [],
      needs: [{ k: "stat", stat: "ALLSK", min: 1 }],
      look: look("alarm", "PURPLE", "ORANGE", { values: true }),
    }),
  ];
}

export function blankTarget(cls: number): ShopTarget {
  return { id: tid(), name: "New target", on: true, items: "any", qualities: [], needs: [{ k: "tab", tab: classTabs(cls)[0], min: 3 }], look: look("spotlight", "WHITE", "ORANGE", { values: true }) };
}

// ------------------------------------------------------------------ reading & writing the block

const OPTS = `${SHOP_TAG}options `;

export function readShop(lines: Line[]): { targets: ShopTarget[]; options: ShopOptions } {
  const targets: ShopTarget[] = [];
  let options: ShopOptions = { dimOthers: false };
  for (const l of lines) {
    if (l.kind === "comment" && l.text?.startsWith(OPTS)) {
      try {
        options = { ...options, ...JSON.parse(l.text.slice(OPTS.length)) };
      } catch {
        /* ignore */
      }
      continue;
    }
    const OFF = `${SHOP_TAG}off `;
    const body =
      l.kind === "rule" && l.note?.startsWith(SHOP_TAG) ? l.note.slice(SHOP_TAG.length).trim() : l.kind === "comment" && l.text?.startsWith(OFF) ? l.text.slice(OFF.length).trim() : undefined;
    if (!body) continue;
    const sp = body.indexOf(" ");
    if (sp < 0) continue;
    try {
      targets.push({ ...JSON.parse(body.slice(sp + 1)), id: body.slice(0, sp) });
    } catch {
      /* ignore */
    }
  }
  return { targets, options };
}

/** More specific targets are written (and so checked) first: a circlet target beats "+2 skills on anything". */
export function specificity(t: ShopTarget): number {
  return t.needs.length * 2 + (t.items !== "any" ? 1 : 0) + (t.qualities.length ? 1 : 0);
}

export function writeShop(lines: Line[], targets: ShopTarget[], options: ShopOptions): Line[] {
  const mask = blockMask(lines, isShopLine);
  const first = mask.indexOf(true);
  const kept = lines.filter((_, i) => !mask[i]);
  let at: number;
  if (first >= 0) at = lines.slice(0, first).filter((_, i) => !mask[i]).length;
  else {
    // Above the Simple mode block and every other rule (below unidentified names).
    at = blockAnchor(kept, 1);
  }
  if (!targets.length && !options.dimOthers) return kept;
  const block: Line[] = [makeComment(SHOP_HEADER), makeComment(SHOP_BLURB), makeComment(`${OPTS}${JSON.stringify(options)}`)];
  for (const t of [...targets].sort((x, y) => specificity(y) - specificity(x))) {
    const json = JSON.stringify({ ...t, id: undefined });
    // A switched-off target is kept as a comment so its settings survive.
    if (t.on) block.push(makeRule(targetCond(t), targetOutput(t), `${SHOP_TAG}${t.id} ${json}`));
    else block.push(makeComment(`${SHOP_TAG}off ${t.id} ${json}`));
  }
  if (options.dimOthers) block.push(makeRule("SHOP", "%GRAY%%NAME%", `${SHOP_TAG}dim`));
  block.push(makeBlank());
  return [...kept.slice(0, at), ...block, ...kept.slice(at)];
}

/** The target a shop rule line belongs to. */
export function targetIdOf(l: Line | undefined): string | undefined {
  const m = l?.kind === "rule" ? l.note?.match(/^@ffs (\S+) /) : null;
  return m?.[1];
}

// ------------------------------------------------------------------ vendor preview stock

export interface StockItem {
  item: TestItem;
  /** The mod lines the game prints under the name. */
  mods: string[];
  /** Grid position in the 10×10 vendor tab. */
  x: number;
  y: number;
  /** Which target this sample was made for, if any. */
  forTarget?: string;
}

const CLASS_WEAPON = ["am5", "ob1", "wnd", "scp", "9fl", "sst", "ktr"];
const CLASS_ITEM = ["am5", "ob1", "ne1", "pa1", "ba1", "dr1", "ktr"];
const KIND_SAMPLE: Record<string, string> = {
  weapon: "", armor: "xtp", circ: "ci0", jewelry: "amu", helm: "xhm", chest: "xtp", shield: "xit",
  gloves: "xvg", boots: "xmb", belt: "zvb", jav: "9ja", bow: "8lb", melee: "9fl",
};
const CASTER = ["sst", "ob1", "wnd", "scp", "sst", "sst", "sst"];
const Q: Record<ShopQuality, Quality> = { white: "normal", superior: "superior", magic: "magic", rare: "rare" };
const STAT_IDS: Record<string, number[]> = { FCR: [105], IAS: [93], FRW: [96], FHR: [99], MF: [80], ALLSK: [127], STR: [0], DEX: [2], LIFE: [7], MANA: [9], RES: [39, 41, 43, 45] };

/** A shop item that satisfies a target, for previews. */
export function sampleForTarget(t: ShopTarget, cls: number): TestItem {
  const skillish = t.needs.some((n) => n.k === "tab" || n.k === "class" || n.k === "skill");
  const code =
    t.items === "any"
      ? t.needs.some((n) => n.k === "sockets") ? "7p7" : skillish ? CLASS_ITEM[cls] : "xtp"
      : t.items === "weapon" ? CLASS_WEAPON[cls]
      : t.items === "class" ? CLASS_ITEM[cls]
      : t.items === "caster" ? CASTER[cls]
      : KIND_SAMPLE[t.items] || "xtp";
  const quality = t.qualities.length ? Q[t.qualities[0]] : t.needs.some((n) => n.k === "sockets") ? "normal" : "magic";
  const it = makeItem(code, { quality, identified: true, price: 4000 + ((code.charCodeAt(0) * 977) % 30000) });
  for (const n of t.needs) {
    if (n.k === "tab") it.multi[`188,${n.tab}`] = n.min;
    else if (n.k === "class") it.multi[`83,${n.cls}`] = n.min;
    else if (n.k === "skill") it.multi[`107,${n.skill}`] = n.min;
    else if (n.k === "sockets") it.sockets = Math.min(n.min, ITEM_BY_CODE.get(code)?.ms ?? 6);
    else if (n.stat === "ED") it.stats[ITEM_BY_CODE.get(code)?.cat === "armor" ? 16 : 17] = n.min;
    else for (const id of STAT_IDS[n.stat] ?? []) it.stats[id] = n.min;
  }
  return it;
}

const STAT_TEXT: Record<number, (v: number) => string> = {
  127: (v) => `+${v} to All Skills`,
  105: (v) => `+${v}% Faster Cast Rate`,
  93: (v) => `+${v}% Increased Attack Speed`,
  96: (v) => `+${v}% Faster Run/Walk`,
  99: (v) => `+${v}% Faster Hit Recovery`,
  17: (v) => `+${v}% Enhanced Damage`,
  16: (v) => `+${v}% Enhanced Defense`,
  80: (v) => `${v}% Better Chance of Getting Magic Items`,
  0: (v) => `+${v} to Strength`,
  2: (v) => `+${v} to Dexterity`,
  7: (v) => `+${v} to Life`,
  9: (v) => `+${v} to Mana`,
  39: (v) => `Fire Resist +${v}%`,
  41: (v) => `Lightning Resist +${v}%`,
  43: (v) => `Cold Resist +${v}%`,
  45: (v) => `Poison Resist +${v}%`,
};

/** The mod lines a tooltip shows, in the game's wording. */
export function modLines(it: TestItem): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(it.multi)) {
    const [s, p] = k.split(",").map(Number);
    if (!v) continue;
    if (s === 83) out.push(`+${v} to ${CLASS_NAMES[p]} Skill Levels`);
    else if (s === 188) out.push(`+${v} to ${tabShort(p)} Skills (${CLASS_NAMES[Math.floor(p / 8)]} Only)`);
    else if (s === 107) out.push(`+${v} to ${SKILL_BY_ID.get(p)?.n ?? `skill ${p}`}`);
  }
  const res = [39, 41, 43, 45].map((id) => it.stats[id] ?? 0);
  const allRes = res.every((v) => v > 0 && v === res[0]);
  for (const [k, v] of Object.entries(it.stats)) {
    const id = Number(k);
    if (!v || (allRes && [39, 41, 43, 45].includes(id))) continue;
    const f = STAT_TEXT[id];
    if (f) out.push(f(v));
  }
  if (allRes) out.push(`All Resistances +${res[0]}`);
  if (it.sockets) out.push(`Socketed (${it.sockets})`);
  return out;
}

const FILLER: [string, Partial<TestItem>][] = [
  ["lsd", { quality: "magic", stats: { 2: 3 } }],
  ["hla", { quality: "normal" }],
  ["cap", { quality: "magic", stats: { 7: 12 } }],
  ["buc", { quality: "superior", stats: { 16: 8 } }],
  ["lbt", { quality: "magic", stats: { 96: 10 } }],
  ["vgl", { quality: "magic", stats: { 0: 4 } }],
  ["lbl", { quality: "normal" }],
  ["scm", { quality: "magic", stats: { 17: 22 } }],
  ["wnd", { quality: "magic", multi: { "107,70": 1 } }],
  ["ob3", { quality: "magic", multi: { "188,9": 1 }, stats: { 9: 15 } }],
  ["rng", { quality: "normal", sockets: 2 }],
  ["jav", { quality: "magic", multi: { "188,2": 1 } }],
  ["ci1", { quality: "magic", multi: { "83,1": 1 } }],
  ["kit", { quality: "normal", sockets: 3 }],
  ["sst", { quality: "magic", stats: { 105: 10 } }],
];

/** A vendor tab for the preview: one matching sample per target plus ordinary stock. */
export function vendorStock(targets: ShopTarget[], cls: number): StockItem[] {
  const want = [
    ...targets.filter((t) => t.on).map((t) => ({ item: sampleForTarget(t, cls), forTarget: t.id })),
    ...FILLER.filter(([c]) => ITEM_BY_CODE.has(c)).map(([c, p], i) => ({ item: makeItem(c, { identified: true, price: 800 + i * 613, ...p, stats: { ...(p.stats ?? {}) }, multi: { ...(p.multi ?? {}) } }), forTarget: undefined })),
  ];
  const W = 10;
  const H = 10;
  const used: boolean[][] = Array.from({ length: H }, () => Array(W).fill(false));
  const out: StockItem[] = [];
  for (const w of want) {
    const b = ITEM_BY_CODE.get(w.item.code);
    const iw = b?.w ?? 1;
    const ih = b?.h ?? 1;
    let placed = false;
    // The game fills columns top to bottom, left to right.
    for (let x = 0; x + iw <= W && !placed; x++)
      for (let y = 0; y + ih <= H && !placed; y++) {
        let free = true;
        for (let dx = 0; dx < iw && free; dx++) for (let dy = 0; dy < ih && free; dy++) if (used[y + dy][x + dx]) free = false;
        if (!free) continue;
        for (let dx = 0; dx < iw; dx++) for (let dy = 0; dy < ih; dy++) used[y + dy][x + dx] = true;
        out.push({ item: w.item, mods: modLines(w.item), x, y, forTarget: w.forTarget });
        placed = true;
      }
  }
  return out;
}
