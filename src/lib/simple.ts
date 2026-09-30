// Simple mode: the filter as a catalog of item groups with visual styles.
//
// Choices are stored as ordinary rules in a clearly marked block near the top of the filter, so
// they win over the rest of the file. Each block rule carries a trailing "//@ff <id> {json}" note
// with the choice itself, which lets Simple mode read its own work back and Advanced mode show it.
import { makeBlank, makeComment, makeRule, type Line } from "./document";
import { composeOutput } from "./output";
import { ITEM_BY_CODE, DATA } from "./data";
import type { TestItem } from "./item";

export interface Group {
  id: string;
  label: string;
  cond: string;
  /** Item used for previews. */
  sample: Partial<TestItem> & { code: string };
  hint?: string;
}
export interface Category {
  id: string;
  label: string;
  blurb: string;
  groups: Group[];
}

export interface SimpleStyle {
  /** "always" hides everywhere; a number hides from that filter level upward. */
  hide?: "always" | number;
  color?: string;
  stars?: boolean;
  rename?: string;
  icon?: { size: "px" | "dot" | "map" | "border"; hex: string };
  sound?: number;
  /** Text alert only up to this filter level. */
  tier?: number;
  /** Id of a mystery banner this item hides behind while it's on the ground. */
  mystery?: string;
}

const g = (id: string, label: string, cond: string, sample: Group["sample"], hint?: string): Group => ({ id, label, cond, sample, hint });
const item = (code: string, patch: Partial<TestItem> = {}) => ({ code, ...patch });
const one = (id: string, code: string, patch: Partial<TestItem> = {}, label?: string) => g(id, label ?? ITEM_BY_CODE.get(code)?.n ?? code, code, item(code, patch));

const RUNES = Array.from({ length: 33 }, (_, i) => {
  const code = `r${String(i + 1).padStart(2, "0")}`;
  const label = `${ITEM_BY_CODE.get(code)?.n.replace(" Rune", "")} (#${i + 1})`;
  // Runes usually drop as the stackable code (r30s), so match both.
  return ITEM_BY_CODE.has(`${code}s`) ? g(`rune.${code}`, label, `(${code} OR ${code}s)`, item(code)) : one(`rune.${code}`, code, {}, label);
}).reverse();

export const CATALOG: Category[] = [
  { id: "runes", label: "Runes", blurb: "Every rune from Zod down to El.", groups: RUNES },
  {
    id: "currency",
    label: "Currency & crafting",
    blurb: "PD2's orbs, cubes, shards and crafting materials.",
    groups: [
      one("cur.imma", "imma"), one("cur.imrn", "imrn"), one("cur.imra", "imra"), one("cur.rera", "rera"), one("cur.scou", "scou"),
      one("cur.upma", "upma"), one("cur.upmp", "upmp"), one("cur.fort", "fort"), one("cur.scrb", "scrb"), one("cur.lbox", "lbox"),
      one("cur.lpp", "lpp"), one("cur.rkey", "rkey"), one("cur.wss", "wss"), one("cur.cwss", "cwss"), one("cur.iwss", "iwss"),
      one("cur.jewf", "jewf", { qty: 5 }),
      g("cur.infused", "Infused orbs", "(irma OR irrn OR irra OR rrra OR urma)", item("irma")),
      g("cur.infusion", "Craft infusions", "(crfb OR crfc OR crfs OR crfh OR crfv OR crfu OR crfp)", item("crfc")),
    ],
  },
  {
    id: "ubers",
    label: "Ubers & pinnacle",
    blurb: "Keys, organs, essences and boss summoning items.",
    groups: [
      g("uber.keys", "Keys of Terror/Hate/Destruction", "(pk1 OR pk2 OR pk3)", item("pk1")),
      g("uber.organs", "Uber organs", "(dhn OR bey OR mbr)", item("dhn")),
      g("uber.ess", "Essences", "(tes OR ceh OR bet OR fed)", item("tes")),
      one("uber.toa", "toa"),
      one("uber.std", "std"),
      one("uber.ubtm", "ubtm"),
      g("uber.dclone", "Diablo Clone items", "(dcma OR dcbl OR dcho OR dcso)", item("dcma")),
      g("uber.rathma", "Rathma items", "(rtma OR rtmo OR rtmv OR rtmf)", item("rtma")),
      g("uber.ancients", "Ancients items", "(uba OR ubaa OR ubab OR ubac)", item("uba")),
      g("uber.lucion", "Lucion items", "(luca OR lucb OR lucc OR lucd)", item("luca")),
      g("uber.lilith", "Lilith items", "(llmr OR lsvl)", item("llmr")),
      g("uber.horadric", "Horadric Navigator & Almanac", "(rtp OR rid)", item("rtp")),
      g("uber.ears", "Corrupted hero ears", "(ivea OR ivez OR iveb OR ived OR iven OR ivep OR ives)", item("ivea")),
    ],
  },
  {
    id: "maps",
    label: "Maps",
    blurb: "PD2 endgame maps by tier.",
    groups: [
      g("map.t5", "Unique maps", "MAPTIER=5", item("t51")),
      g("map.t4", "Dungeon maps", "MAPTIER=4", item("t42")),
      g("map.t3", "Tier 3 maps", "MAPTIER=3", item("t13")),
      g("map.t2", "Tier 2 maps", "MAPTIER=2", item("t12")),
      g("map.t1", "Tier 1 maps", "MAPTIER=1", item("t11")),
      one("map.ashes", "cm2f"),
    ],
  },
  {
    id: "uniques",
    label: "Uniques",
    blurb: "Unique items, before and after identifying.",
    groups: [
      g("uni.ring", "Unique rings", "UNI rin", item("rin", { quality: "unique", identified: false })),
      g("uni.amu", "Unique amulets", "UNI amu", item("amu", { quality: "unique", identified: false })),
      g("uni.charm", "Unique charms", "UNI CHARM", item("cm3", { quality: "unique", title: "Gheed's Fortune" })),
      g("uni.jewel", "Unique jewels", "UNI jew", item("jew", { quality: "unique", title: "Rainbow Facet" })),
      g("uni.elite", "Elite unique gear", "UNI ELT (ARMOR OR WEAPON)", item("uap", { quality: "unique", identified: false })),
      g("uni.exc", "Exceptional unique gear", "UNI EXC (ARMOR OR WEAPON)", item("xap", { quality: "unique", identified: false })),
      g("uni.norm", "Normal unique gear", "UNI NORM (ARMOR OR WEAPON)", item("cap", { quality: "unique", identified: false })),
    ],
  },
  {
    id: "sets",
    label: "Set items",
    blurb: "Green set items.",
    groups: [
      g("set.jewelry", "Set rings & amulets", "SET JEWELRY", item("amu", { quality: "set", identified: false })),
      g("set.elite", "Elite set gear", "SET ELT", item("uar", { quality: "set", identified: false })),
      g("set.other", "Other set gear", "SET", item("lrg", { quality: "set", identified: false })),
    ],
  },
  {
    id: "charms",
    label: "Charms & jewels",
    blurb: "Magic and rare charms and jewels.",
    groups: [
      g("chm.gc", "Magic grand charms", "MAG cm3", item("cm3", { quality: "magic", title: "Grand Charm" })),
      g("chm.lc", "Magic large charms", "MAG cm2", item("cm2", { quality: "magic", title: "Large Charm" })),
      g("chm.sc", "Magic small charms", "MAG cm1", item("cm1", { quality: "magic", title: "Small Charm" })),
      g("jwl.rare", "Rare jewels", "RARE jew", item("jew", { quality: "rare", title: "Rare Jewel" })),
      g("jwl.magic", "Magic jewels", "MAG jew", item("jew", { quality: "magic", title: "Magic Jewel" })),
    ],
  },
  {
    id: "rares",
    label: "Rare items",
    blurb: "Yellow items, grouped by what's usually worth a look.",
    groups: [
      g("rare.ring", "Rare rings", "RARE rin", item("rin", { quality: "rare", identified: false })),
      g("rare.amu", "Rare amulets", "RARE amu", item("amu", { quality: "rare", identified: false })),
      g("rare.circ", "Rare circlets", "RARE CIRC", item("ci3", { quality: "rare", identified: false })),
      g("rare.acc", "Rare gloves, boots & belts", "RARE (GLOVES OR BOOTS OR BELT)", item("uhb", { quality: "rare", identified: false })),
      g("rare.elite", "Other elite rares", "RARE ELT (ARMOR OR WEAPON)", item("uar", { quality: "rare", identified: false })),
      g("rare.other", "Other rares", "RARE (ARMOR OR WEAPON)", item("xtb", { quality: "rare", identified: false })),
    ],
  },
  {
    id: "magic",
    label: "Magic items",
    blurb: "Blue gear, rings and amulets.",
    groups: [
      g("mag.jewelry", "Magic rings & amulets", "MAG JEWELRY", item("rin", { quality: "magic", identified: false })),
      g("mag.circ", "Magic circlets", "MAG CIRC", item("ci3", { quality: "magic", identified: false })),
      g("mag.class", "Magic class items", "MAG CLASS", item("obf", { quality: "magic", identified: false })),
      g("mag.other", "Other magic gear", "MAG (ARMOR OR WEAPON)", item("xtb", { quality: "magic", identified: false })),
    ],
  },
  {
    id: "bases",
    label: "Runeword bases",
    blurb: "White and grey gear to put runes in.",
    groups: [
      g("base.eth", "Ethereal elite bases", "NMAG !INF ETH ELT (ARMOR OR WEAPON)", item("7gd", { ethereal: true, sockets: 5 })),
      g("base.sock", "Elite bases with sockets", "NMAG !INF ELT SOCKETS>0 (ARMOR OR WEAPON)", item("7cr", { sockets: 5 })),
      g("base.sup", "Superior elite bases", "SUP ELT (ARMOR OR WEAPON)", item("uit", { quality: "superior" })),
      g("base.elite", "Other elite bases", "NMAG !INF ELT (ARMOR OR WEAPON)", item("uap")),
      g("base.exc", "Exceptional bases", "NMAG !INF EXC (ARMOR OR WEAPON)", item("xap")),
      g("base.norm", "Normal-tier bases", "NMAG !INF NORM (ARMOR OR WEAPON)", item("cap")),
      g("base.inf", "Low quality (crude, cracked…)", "INF", item("lbt", { quality: "inferior" })),
    ],
  },
  {
    id: "gems",
    label: "Gems",
    blurb: "Gems and skulls by quality.",
    groups: [
      g("gem.5", "Perfect gems", "GEMLEVEL=5", item("gpw")),
      g("gem.4", "Flawless gems", "GEMLEVEL=4", item("glr")),
      g("gem.3", "Normal gems", "GEMLEVEL=3", item("gsv")),
      g("gem.2", "Flawed gems", "GEMLEVEL=2", item("gfv")),
      g("gem.1", "Chipped gems", "GEMLEVEL=1", item("gcv")),
    ],
  },
  {
    id: "potions",
    label: "Potions & scrolls",
    blurb: "Consumables you may want to hide later on.",
    groups: [
      one("pot.rvl", "rvl"), one("pot.rvs", "rvs"),
      g("pot.hp5", "Super healing & mana", "(hp5 OR mp5)", item("hp5")),
      g("pot.hp4", "Greater healing & mana", "(hp4 OR mp4)", item("hp4")),
      g("pot.hp3", "Healing & mana", "(hp3 OR mp3)", item("hp3")),
      g("pot.low", "Minor & light potions", "(hp1 OR hp2 OR mp1 OR mp2)", item("hp1")),
      g("pot.misc", "Antidote, stamina & thawing", "(yps OR vps OR wms)", item("yps")),
      one("pot.tsc", "tsc"), one("pot.isc", "isc"),
      g("pot.ammo", "Arrows & bolts", "(aqv OR cqv) NMAG", item("aqv", { qty: 250 })),
    ],
  },
  {
    id: "gold",
    label: "Gold & keys",
    blurb: "Gold piles by size, and keys.",
    groups: [
      g("gold.big", "Large gold piles (5000+)", "GOLD>4999", item("gld", { gold: 8000 })),
      g("gold.mid", "Medium gold piles (500–4999)", "GOLD~500-4999", item("gld", { gold: 1500 })),
      g("gold.small", "Small gold piles (under 500)", "GOLD<500", item("gld", { gold: 120 })),
      one("key.key", "key", { qty: 5 }),
    ],
  },
];

export const ALL_GROUPS = new Map<string, Group>(CATALOG.flatMap((c) => c.groups.map((x) => [x.id, x] as const)));

/** A group for one specific item picked by search (base, unique or set). */
export function itemGroup(kind: "base" | "unique" | "set", code: string): Group {
  const base = ITEM_BY_CODE.get(code);
  const bn = base?.n ?? code;
  if (kind === "unique") {
    const names = DATA.uniques.filter((u) => u.c === code).map((u) => u.n);
    return g(`uni.${code}`, names.length === 1 ? names[0] : `Unique ${bn}`, `${code} UNI`, item(code, { quality: "unique", title: names[0] }), `Unique ${bn}: ${names.join(", ")}`);
  }
  if (kind === "set") {
    const names = DATA.sets.filter((u) => u.c === code).map((u) => u.n);
    return g(`set.${code}`, names.length === 1 ? names[0] : `Set ${bn}`, `${code} SET`, item(code, { quality: "set", title: names[0] }), `Set ${bn}: ${names.join(", ")}`);
  }
  return g(`item.${code}`, bn, code, item(code, base?.stk ? { qty: 1 } : {}), `Every ${bn}, any quality`);
}

/** Resolve a stored id back to a group, including search-made ones. */
export function groupFor(id: string): Group | undefined {
  const known = ALL_GROUPS.get(id);
  if (known) return known;
  const [kind, code] = id.split(".");
  if (!ITEM_BY_CODE.has(code)) return undefined;
  if (kind === "item") return itemGroup("base", code);
  if (kind === "uni") return itemGroup("unique", code);
  if (kind === "set") return itemGroup("set", code);
  return undefined;
}

// ------------------------------------------------------------------ friendly choices

export const TEXT_COLORS = [
  { code: "WHITE", label: "White" },
  { code: "GRAY", label: "Gray" },
  { code: "LIGHT_GRAY", label: "Light gray" },
  { code: "RED", label: "Red" },
  { code: "CORAL", label: "Coral" },
  { code: "ORANGE", label: "Orange" },
  { code: "GOLD", label: "Gold" },
  { code: "YELLOW", label: "Yellow" },
  { code: "TAN", label: "Tan" },
  { code: "GREEN", label: "Green" },
  { code: "SAGE", label: "Lime" },
  { code: "DARK_GREEN", label: "Dark green" },
  { code: "TEAL", label: "Teal" },
  { code: "BLUE", label: "Blue" },
  { code: "PURPLE", label: "Purple" },
];
export const ICON_COLORS = [
  { hex: "20", label: "White" },
  { hex: "62", label: "Red" },
  { hex: "60", label: "Orange" },
  { hex: "0C", label: "Gold" },
  { hex: "A8", label: "Yellow" },
  { hex: "84", label: "Green" },
  { hex: "A0", label: "Teal" },
  { hex: "9D", label: "Light blue" },
  { hex: "97", label: "Blue" },
  { hex: "9B", label: "Purple" },
  { hex: "66", label: "Pink" },
  { hex: "D0", label: "Gray" },
];
export const ICON_SIZES: { size: NonNullable<SimpleStyle["icon"]>["size"]; label: string }[] = [
  { size: "px", label: "Tiny" },
  { size: "dot", label: "Small" },
  { size: "map", label: "Medium" },
  { size: "border", label: "Large" },
];
export const SOUNDS = Array.from({ length: 16 }, (_, i) => ({ id: 4714 + i, label: `Sound ${i + 1}`, file: `tink${String(i + 1).padStart(2, "0")}.wav` }));

// ------------------------------------------------------------------ mystery drops
//
// A mystery hides what dropped behind a banner of your own ("ººº  L i t t l e  B a s t a r d  ººº"),
// with its own icon and sound. The real name shows once the item is picked up (or dropped in town,
// or identified, depending on the mystery's settings).

export interface Mystery {
  id: string;
  name: string;
  /** Banner words, each in its own color. */
  words: { text: string; color: string }[];
  /** "L i t t l e" instead of "Little". */
  spaced: boolean;
  /** Decoration drawn on both sides, repeated `decoCount` times. */
  deco: string;
  decoCount: number;
  decoColor: string;
  /** Spaces between the decoration and the words. */
  gap: number;
  icon?: { size: "px" | "dot" | "map" | "border"; hex: string };
  sound?: number;
  /** Show the real name when it drops in a town. */
  revealInTown: boolean;
  /** Uniques, sets, rares and magic items stay a mystery only until identified. */
  untilId: boolean;
}

export const TOWN_MAPS = [1, 40, 75, 103, 109];
export const DECORATIONS = ["º", "*", "~", "=", "-", "+", "#", "?", "!", "$", "o", "x"];

export const MYSTERY_PRESETS: (Omit<Mystery, "id"> & { blurb: string })[] = [
  {
    name: "Little Bastard",
    blurb: "Low-key mystery for mid runes and lesser loot.",
    words: [{ text: "Little", color: "PURPLE" }, { text: "Bastard", color: "RED" }],
    spaced: true, deco: "º", decoCount: 9, decoColor: "RED", gap: 4,
    icon: { size: "dot", hex: "60" }, sound: 4714, revealInTown: true, untilId: true,
  },
  {
    name: "Lucky Bastard",
    blurb: "Bigger banner for high runes and chase items.",
    words: [{ text: "Lucky", color: "PURPLE" }, { text: "Bastard", color: "RED" }],
    spaced: true, deco: "º", decoCount: 12, decoColor: "RED", gap: 4,
    icon: { size: "border", hex: "0D" }, sound: 4722, revealInTown: true, untilId: true,
  },
  {
    name: "Holy Moly",
    blurb: "The loudest one: for the drops you'd scream about.",
    words: [{ text: "Holy", color: "GREEN" }, { text: "Moly", color: "GREEN" }],
    spaced: true, deco: "º", decoCount: 12, decoColor: "RED", gap: 4,
    icon: { size: "border", hex: "84" }, sound: 4729, revealInTown: true, untilId: true,
  },
  {
    name: "Mystery Box",
    blurb: "Short and sweet, gold question marks.",
    words: [{ text: "Mystery Box", color: "GOLD" }],
    spaced: false, deco: "?", decoCount: 3, decoColor: "ORANGE", gap: 1,
    icon: { size: "map", hex: "0C" }, sound: 4718, revealInTown: true, untilId: true,
  },
  {
    name: "Jackpot",
    blurb: "Casino style, for your currency.",
    words: [{ text: "JACKPOT", color: "YELLOW" }],
    spaced: true, deco: "$", decoCount: 5, decoColor: "GREEN", gap: 3,
    icon: { size: "map", hex: "A8" }, sound: 4725, revealInTown: true, untilId: true,
  },
];

const spaceOut = (w: string) => [...w].join(" ");
const wordText = (m: Mystery, w: string) => (m.spaced ? w.split(/\s+/).map(spaceOut).join("  ") : w);

/** The banner as it appears, without colors (for length checks and plain previews). */
export function mysteryText(m: Mystery): string {
  const deco = m.deco.repeat(Math.max(0, m.decoCount));
  const gap = " ".repeat(m.deco && m.decoCount ? Math.max(0, m.gap) : 0);
  const words = m.words.filter((w) => w.text.trim()).map((w) => wordText(m, w.text.trim())).join(m.spaced ? "  " : " ");
  return `${deco}${gap}${words}${gap}${deco}`;
}

/** The %KEYWORD% output for the banner. */
export function mysteryOutput(m: Mystery): string {
  const deco = m.deco.repeat(Math.max(0, m.decoCount));
  const gap = " ".repeat(m.deco && m.decoCount ? Math.max(0, m.gap) : 0);
  const words = m.words
    .filter((w) => w.text.trim())
    .map((w) => `%${w.color}%${plainText(wordText(m, w.text.trim()))}`)
    .join(m.spaced ? "  " : " ");
  const d = deco ? `%${m.decoColor}%${plainText(deco)}` : "";
  const name = `${d}${gap}${words}${gap}${d}`;
  return composeOutput({ name, desc: null, effects: { cont: false, ...(m.icon ? { [m.icon.size]: m.icon.hex } : {}), ...(m.sound != null ? { sound: m.sound } : {}) } });
}

const IDENTIFIABLE = new Set(["magic", "rare", "set", "unique", "crafted"]);

/** Conditions for a group while it's a mystery: on the ground, optionally not in town / not identified. */
export function mysteryCond(m: Mystery, group: Group): string {
  const parts = [group.cond, "GROUND"];
  if (m.untilId && group.sample.quality && IDENTIFIABLE.has(group.sample.quality)) parts.push("!ID");
  if (m.revealInTown) parts.push(`!(${TOWN_MAPS.map((n) => `MAPID=${n}`).join(" OR ")})`);
  return parts.join(" ");
}

export function newMysteryId(existing: Mystery[]): string {
  let n = existing.length + 1;
  while (existing.some((m) => m.id === `m${n}`)) n++;
  return `m${n}`;
}

// ------------------------------------------------------------------ reading & writing the block

const TAG = "@ff ";
const MTAG = "@ffm ";
const HEADER = "=================== SIMPLE MODE CHOICES ===================";
const BLURB = " Made in Simple mode with PD2 Filter Forge. These come first, so they win.";
/** Shop hunting keeps its own block, which must stay above this one (see shop.ts). */
export const SHOP_TAG = "@ffs ";
export const SHOP_HEADER = "=================== SHOP HUNTING ===================";
export const SHOP_BLURB = " Made in Shop hunting with PD2 Filter Forge. Only applies to items in a vendor's window.";

function isManagedLine(l: Line) {
  return (
    (l.kind === "rule" && !!l.note?.startsWith(TAG)) ||
    (l.kind === "comment" && (l.text === HEADER || l.text === BLURB || !!l.text?.startsWith(MTAG)))
  );
}

export function isShopLine(l: Line) {
  return (l.kind === "rule" && !!l.note?.startsWith(SHOP_TAG)) || (l.kind === "comment" && (l.text === SHOP_HEADER || l.text === SHOP_BLURB || !!l.text?.startsWith(SHOP_TAG)));
}

/** Managed lines, plus the blank line the block ends with. */
export function blockMask(lines: Line[], is: (l: Line) => boolean): boolean[] {
  const mask = lines.map(is);
  for (let i = 1; i < lines.length; i++) if (mask[i - 1] && !mask[i] && lines[i].kind === "blank" && (lines[i - 1].kind === "rule" || lines[i - 1].kind === "comment")) mask[i] = true;
  return mask;
}

export function isManaged(l: Line) {
  return isManagedLine(l) || isShopLine(l);
}

export function readChoices(lines: Line[]): Map<string, SimpleStyle> {
  const out = new Map<string, SimpleStyle>();
  for (const l of lines) {
    if (l.kind !== "rule" || !l.note?.startsWith(TAG)) continue;
    const body = l.note.slice(TAG.length).trim();
    const sp = body.indexOf(" ");
    if (sp < 0) continue;
    try {
      out.set(body.slice(0, sp), JSON.parse(body.slice(sp + 1)));
    } catch {
      /* hand-edited note: ignore */
    }
  }
  return out;
}

export function readMysteries(lines: Line[]): Mystery[] {
  const out: Mystery[] = [];
  for (const l of lines) {
    if (l.kind !== "comment" || !l.text?.startsWith(MTAG)) continue;
    const body = l.text.slice(MTAG.length).trim();
    const sp = body.indexOf(" ");
    if (sp < 0) continue;
    try {
      out.push({ ...JSON.parse(body.slice(sp + 1)), id: body.slice(0, sp) });
    } catch {
      /* hand-edited: ignore */
    }
  }
  return out;
}

function plainText(s: string) {
  // Keep typed names literal: no keywords, braces or comment markers.
  return s.replace(/\/\//g, "/").replace(/%/g, "%PERCENT%").replace(/\{/g, "%LBRACE%").replace(/\}/g, "%RBRACE%");
}

export function isEmptyStyle(s: SimpleStyle) {
  return s.hide == null && !s.color && !s.stars && !s.rename && !s.icon && s.sound == null && s.tier == null && !s.mystery;
}

/** Whether the choice changes the item's text (and so replaces the filter's own look). */
export function changesLook(s: SimpleStyle) {
  return !!(s.color || s.stars || s.rename);
}

function rulesFor(id: string, group: Group, s: SimpleStyle, withJson: boolean): Line[] {
  const note = withJson ? `${TAG}${id} ${JSON.stringify(s)}` : `${TAG}${id}`;
  const out: Line[] = [];
  const noteFor = () => (out.length ? `${TAG}${id}` : note);
  if (s.hide === "always") return [makeRule(group.cond, "", note)];
  if (typeof s.hide === "number") out.push(makeRule(`${group.cond} FILTLVL>${Math.max(0, s.hide - 1)}`, "", noteFor()));
  const effects = { cont: false, ...(s.icon ? { [s.icon.size]: s.icon.hex } : {}), ...(s.sound != null ? { sound: s.sound } : {}), ...(s.tier != null && (s.icon || s.sound != null) ? { tier: s.tier } : {}) };
  const alerts = !!(s.icon || s.sound != null);
  if (changesLook(s)) {
    const c = s.color ? `%${s.color}%` : "";
    // Runes and some PD2 items carry their color inside %NAME%, which would override ours;
    // %BASENAME% is the same text without the built-in color.
    const builtInColor = !!ITEM_BY_CODE.get(group.sample.code)?.col;
    const nm = s.rename ? plainText(s.rename) : s.color && builtInColor ? "%BASENAME%" : "%NAME%";
    const name = s.stars ? `${c}*** ${c}${nm} ${c}***` : `${c}${nm}`;
    out.push(makeRule(group.cond, composeOutput({ name, desc: null, effects }), noteFor()));
  } else if (alerts) {
    // Only an alert: keep the filter's own look by continuing to its rules.
    out.push(makeRule(group.cond, composeOutput({ name: "%NAME%", desc: null, effects: { ...effects, cont: true } }), noteFor()));
  }
  return out;
}

/** Rewrite the Simple mode block from a full set of choices and mysteries. */
function writeBlock(lines: Line[], choices: Map<string, SimpleStyle>, mysteries: Mystery[]): Line[] {
  const mask = blockMask(lines, isManagedLine);
  const firstManaged = mask.indexOf(true);
  const kept = lines.filter((_, i) => !mask[i]);
  let at: number;
  if (firstManaged >= 0) {
    at = lines.slice(0, firstManaged).filter((_, i) => !mask[i]).length;
  } else {
    // Below the shop block when there is one (shop rules must win in vendor windows), else before the first rule.
    const shop = blockMask(kept, isShopLine);
    const lastShop = shop.lastIndexOf(true);
    const firstRule = kept.findIndex((l) => l.kind === "rule");
    at = lastShop >= 0 ? lastShop + 1 : firstRule >= 0 ? firstRule : kept.length;
  }
  const known = new Set(mysteries.map((m) => m.id));
  for (const [cid, s] of choices) {
    if (s.mystery && !known.has(s.mystery)) {
      const { mystery: _drop, ...rest } = s;
      if (isEmptyStyle(rest)) choices.delete(cid);
      else choices.set(cid, rest);
    }
  }
  if (choices.size === 0 && mysteries.length === 0) return kept;

  // Search-made single items first (most specific), then the catalog order.
  const order = [...choices.keys()].sort((a, b) => rank(a) - rank(b));
  const block: Line[] = [makeComment(HEADER), makeComment(BLURB)];
  for (const m of mysteries) block.push(makeComment(`${MTAG}${m.id} ${JSON.stringify({ ...m, id: undefined })}`));
  // Mystery banners come before everything else in the block, so they win on the ground.
  const jsonWritten = new Set<string>();
  for (const m of mysteries)
    for (const cid of order) {
      const s = choices.get(cid)!;
      const grp = groupFor(cid);
      if (s.mystery !== m.id || !grp) continue;
      block.push(makeRule(mysteryCond(m, grp), mysteryOutput(m), `${TAG}${cid} ${JSON.stringify(s)}`));
      jsonWritten.add(cid);
    }
  for (const cid of order) {
    const grp = groupFor(cid);
    if (grp) block.push(...rulesFor(cid, grp, choices.get(cid)!, !jsonWritten.has(cid)));
  }
  block.push(makeBlank());
  return [...kept.slice(0, at), ...block, ...kept.slice(at)];
}

/** Rewrite the Simple mode block with one choice changed (null removes it). */
export function applyChoice(lines: Line[], id: string, style: SimpleStyle | null): Line[] {
  const choices = readChoices(lines);
  if (style && !isEmptyStyle(style)) choices.set(id, style);
  else choices.delete(id);
  return writeBlock(lines, choices, readMysteries(lines));
}

/** Add or update a mystery. */
export function saveMystery(lines: Line[], m: Mystery): Line[] {
  const all = readMysteries(lines);
  const i = all.findIndex((x) => x.id === m.id);
  if (i >= 0) all[i] = m;
  else all.push(m);
  return writeBlock(lines, readChoices(lines), all);
}

/** Delete a mystery; items that used it go back to showing normally. */
export function deleteMystery(lines: Line[], id: string): Line[] {
  return writeBlock(lines, readChoices(lines), readMysteries(lines).filter((m) => m.id !== id));
}

const CATALOG_ORDER = new Map([...ALL_GROUPS.keys()].map((k, i) => [k, i]));
function rank(id: string) {
  return CATALOG_ORDER.get(id) ?? -1;
}
