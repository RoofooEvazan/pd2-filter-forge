// Build a plausible test item from a rule's conditions, so every rule can show a live preview
// without the user setting anything up.
import type { Leaf, Node } from "./conditions";
import { DATA, ITEM_BY_CODE } from "./data";
import { makeItem, NAMED_STATS, type Quality, type TestItem } from "./item";

const GROUP_SAMPLE: Record<string, string> = {
  HELM: "uap", CHEST: "uar", SHIELD: "uit", GLOVES: "ulg", BOOTS: "uhb", BELT: "umc", CIRC: "ci3",
  ARMOR: "uar", WEAPON: "7cr", JEWELRY: "rin", CHARM: "cm3", QUIVER: "aqv", MISC: "r30",
  AXE: "7wa", MACE: "7fl", CLUB: "7sp", TMACE: "7fl", HAMMER: "7wh", SWORD: "7cr", DAGGER: "7di", THROWING: "7tk",
  JAV: "7ja", SPEAR: "7sr", POLEARM: "7vo", BOW: "6l7", XBOW: "6rx", STAFF: "6ws", WAND: "7bw", SCEPTER: "7ws",
  "1H": "7cr", "2H": "7gd", CLASS: "ci3",
  DRU: "dre", BAR: "ba5", DIN: "pae", NEC: "nef", SIN: "7wb", SOR: "obf", ZON: "amc",
};
const QUALITY_FLAG: Record<string, Quality> = { MAG: "magic", RARE: "rare", SET: "set", UNI: "unique", CRAFT: "crafted", SUP: "superior", INF: "inferior", NMAG: "normal" };
const TIER_SAMPLE: Record<string, string> = { NORM: "cap", EXC: "xap", ELT: "uap" };

const pick = (op: Leaf["op"], v = 0) => (op === ">" ? v + 1 : op === "<" ? Math.max(0, v - 1) : v);

function apply(leaf: Leaf, it: TestItem, hints: { code?: string; group?: string; tier?: string }) {
  switch (leaf.cls) {
    case "item":
      if (!hints.code && ITEM_BY_CODE.has(leaf.key.slice(0, 4))) hints.code = leaf.key.slice(0, 4);
      break;
    case "flag": {
      const c = leaf.kw!.code;
      if (QUALITY_FLAG[c]) it.quality = QUALITY_FLAG[c];
      else if (c === "ETH") it.ethereal = true;
      else if (c === "RW") {
        it.runeword = true;
        it.title = "Enigma";
        it.sockets = Math.max(it.sockets, 3);
      } else if (c === "GEMMED") it.gemmed = true;
      else if (c === "FOOLS") it.fools = true;
      else if (TIER_SAMPLE[c]) hints.tier = c;
      else if (GROUP_SAMPLE[c] && !hints.group) hints.group = c;
      break;
    }
    case "value": {
      const c = leaf.kw!.code;
      const n = pick(leaf.op, leaf.v);
      if (c === "SOCKETS" || c === "SOCK") it.sockets = n;
      else if (c === "RUNE" && n >= 1 && n <= 33) hints.code ??= `r${String(n).padStart(2, "0")}`;
      else if (c === "ILVL") it.ilvl = Math.max(1, Math.min(99, n));
      else if (c === "QTY") it.qty = n;
      else if (c === "GOLD") {
        hints.code ??= "gld";
        it.gold = Math.max(1, n);
      } else if (c === "GEMLEVEL" || c === "GEM") hints.code ??= ["gcv", "gfv", "gsv", "gzv", "gpv"][Math.max(0, Math.min(4, n - 1))];
      else if (c === "MAPTIER" && n > 0) hints.code ??= ({ 1: "t11", 2: "t12", 3: "t13", 4: "t42", 5: "t51" } as Record<number, string>)[n];
      else if (c === "PRICE") it.price = Math.max(1, n);
      else if (c === "PREFIX") it.prefixes = [n];
      else if (c === "SUFFIX") it.suffixes = [n];
      else if (NAMED_STATS[c] != null) it.stats = { ...it.stats, [NAMED_STATS[c]]: n };
      else if (c === "RES") it.stats = { ...it.stats, 39: n, 41: n, 43: n, 45: n };
      else if (c === "ED") it.stats = { ...it.stats, 16: n, 17: n };
      break;
    }
    case "param": {
      const n = pick(leaf.op, leaf.v);
      const [a, b] = leaf.params ?? [];
      const layer: Record<string, string> = { SK: `107,${a}`, OS: `97,${a}`, CLSK: `83,${a}`, TABSK: `188,${a}`, MULTI: `${a},${b}` };
      if (leaf.prefix === "STAT") it.stats = { ...it.stats, [a]: n };
      else if (leaf.prefix && layer[leaf.prefix]) it.multi = { ...it.multi, [layer[leaf.prefix]]: n };
      break;
    }
    case "add": {
      const n = pick(leaf.op, leaf.v);
      const parts = leaf.key.split("+");
      const each = Math.ceil(n / parts.length);
      for (const p of parts) {
        const m = p.match(/^STAT(\d+)$/);
        const id = m ? Number(m[1]) : NAMED_STATS[p];
        if (id != null) it.stats = { ...it.stats, [id]: each };
      }
      break;
    }
  }
}

function walk(n: Node | null, it: TestItem, hints: { code?: string; group?: string; tier?: string }) {
  if (!n) return;
  if (n.t === "leaf") apply(n.leaf, it, hints);
  else if (n.t === "and") n.items.forEach((c) => walk(c, it, hints));
  else if (n.t === "or") walk(n.items[0], it, hints);
  else if (n.t === "not") {
    // Honour the common "!ID" / "!ETH" so previews show unidentified / non-ethereal items.
    if (n.item.t === "leaf" && n.item.leaf.kw?.code === "ID") it.identified = false;
  }
}

export function sampleItem(tree: Node | null): TestItem {
  const it = makeItem("r30");
  const hints: { code?: string; group?: string; tier?: string } = {};
  walk(tree, it, hints);
  let code = hints.code;
  if (!code && hints.group) {
    code = GROUP_SAMPLE[hints.group];
    // Respect a tier flag by swapping to the matching tier of the same family.
    const fam = ITEM_BY_CODE.get(code)?.fam;
    if (fam && hints.tier) code = fam[{ NORM: 0, EXC: 1, ELT: 2 }[hints.tier as "NORM"]] ?? code;
  }
  if (!code && hints.tier) code = TIER_SAMPLE[hints.tier];
  if (!code) code = it.quality === "unique" || it.quality === "set" || it.quality === "rare" || it.quality === "magic" ? "uap" : "r30";
  it.code = code;
  const base = ITEM_BY_CODE.get(code);
  if (base?.stk && !it.qty) it.qty = 1;
  if (it.quality === "unique" && !it.title) it.title = DATA.uniques.find((u) => u.c === code)?.n;
  if (it.quality === "set" && !it.title) it.title = DATA.sets.find((u) => u.c === code)?.n;
  if (it.quality === "rare" && !it.title) it.title = "Doom Visage";
  if (it.quality === "magic" && !it.title && base) it.title = `Sturdy ${base.n} of the Fox`;
  return it;
}
