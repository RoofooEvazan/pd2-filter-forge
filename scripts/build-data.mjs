// Builds src/data/pd2data.json from the live PD2 game tables plus the PD2 wiki filter page.
//
//   node scripts/build-data.mjs [--tables DIR]
//
// DIR must hold <Table>.json files shaped {columns:[...], rows:[[...]]} and a strings.json one
// level up (the format pd2-planner's tools/extract.py writes from pd2data.mpq). The wiki text and
// the minimap palette live in scripts/source/ so the build is reproducible offline.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const argi = process.argv.indexOf("--tables");
// Default: a pd2-planner checkout next to this repo (its tools/extract.py writes the tables).
const TABLES = argi > 0 ? process.argv[argi + 1] : fileURLToPath(new URL("../../pd2-planner/public/data/current/tables", import.meta.url));
const SRC = path.join(ROOT, "scripts", "source");

const readTable = (name) => {
  const j = JSON.parse(fs.readFileSync(path.join(TABLES, name + ".json"), "utf8"));
  return j.rows.map((r) => Object.fromEntries(j.columns.map((c, i) => [c, r[i]])));
};
const strings = JSON.parse(fs.readFileSync(path.join(TABLES, "..", "strings.json"), "utf8"));
const manifest = JSON.parse(fs.readFileSync(path.join(TABLES, "..", "manifest.json"), "utf8"));
const wiki = fs.readFileSync(path.join(SRC, "wiki_item_filtering.txt"), "utf8");
const palette = JSON.parse(fs.readFileSync(path.join(SRC, "palette.json"), "utf8"));

// D2 color escape is 0xFF 'c' <digit>; the extracted strings carry it double-encoded as "Ã¿c".
const COLOR_CODES = { 0: "WHITE", 1: "RED", 2: "GREEN", 3: "BLUE", 4: "GOLD", 5: "GRAY", 6: "BLACK", 7: "TAN", 8: "ORANGE", 9: "YELLOW", ":": "DARK_GREEN", ";": "PURPLE", "/": "WHITE" };
function cleanName(raw) {
  if (raw == null) return { name: "", color: undefined };
  let s = String(raw).replace(/Ã¿c/g, "\u00ffc");
  const lines = s.split("\n");
  s = lines[lines.length - 1]; // D2 builds multi-line strings bottom-up; the last line is the title
  let color;
  const m = s.match(/^\u00ffc(.)/);
  if (m) color = COLOR_CODES[m[1]];
  s = s.replace(/\u00ffc./g, "").trim();
  return { name: s, color };
}
const str = (key, fallback) => (key && strings[key] != null ? cleanName(strings[key]) : { name: fallback ?? key ?? "", color: undefined });
const num = (v) => (v === "" || v == null ? 0 : Number(v));

// ---- item types: resolve every type to the full set of types it counts as
const itemTypes = readTable("ItemTypes").filter((t) => t.Code);
const typeByCode = Object.fromEntries(itemTypes.map((t) => [t.Code, t]));
const chainCache = {};
function chain(code) {
  if (!code || !typeByCode[code]) return [];
  if (chainCache[code]) return chainCache[code];
  const t = typeByCode[code];
  const out = new Set([code]);
  for (const e of [t.Equiv1, t.Equiv2]) for (const c of chain(e)) out.add(c);
  return (chainCache[code] = [...out]);
}

// ---- base items
const items = [];
const seen = new Set();
function addItems(rows, cat) {
  for (const r of rows) {
    const code = r.code;
    if (!code || seen.has(code) || r.name === "Expansion") continue;
    seen.add(code);
    const { name, color } = str(r.namestr, r.name);
    const tc = [...new Set([...chain(r.type), ...chain(r.type2)])];
    // BH: ELT if code == ultracode, EXC if code == ubercode, otherwise NORM, for every table
    // including Misc (Item.cpp:307-318, 428-439, 516-527).
    const tier = r.ultracode === code ? "e" : r.ubercode === code ? "x" : "n";
    const it = {
      c: code,
      n: name || r.name,
      cat,
      t: r.type,
      tc,
      w: num(r.invwidth),
      h: num(r.invheight),
      lr: num(r.levelreq),
      ql: num(r.level),
    };
    if (color) it.col = color;
    it.tier = tier;
    if (r.normcode && r.ubercode && r.ultracode) it.fam = [r.normcode, r.ubercode, r.ultracode];
    // Weapons/armor "magic lvl" adds to the affix level (GetAffixLevel).
    if (num(r["magic lvl"])) it.mlvl = num(r["magic lvl"]);
    if (num(r.gemsockets)) it.ms = num(r.gemsockets);
    if (cat === "weapon") {
      it.hand = num(r["2handed"]) ? (num(r["1or2handed"]) ? "12" : "2") : "1";
      it.dmg = [num(r.mindam), num(r.maxdam), num(r["2handmindam"]), num(r["2handmaxdam"]), num(r.minmisdam), num(r.maxmisdam)];
      it.spd = num(r.speed);
      it.rs = num(r.reqstr);
      it.rd = num(r.reqdex);
    }
    if (cat === "armor") {
      it.def = [num(r.minac), num(r.maxac)];
      it.rs = num(r.reqstr);
      if (num(r.block)) it.blk = num(r.block);
    }
    if (num(r.stackable)) it.stk = num(r.maxstack);
    items.push(it);
  }
}
addItems(readTable("Armor"), "armor");
addItems(readTable("Weapons"), "weapon");
addItems(readTable("Misc"), "misc");

// ---- uniques / sets / runewords (used for name search and test items)
const uniques = readTable("UniqueItems")
  .filter((u) => u.code && u.index && num(u.enabled) !== 0 && seen.has(u.code))
  .map((u) => ({ n: str(u.index, u.index).name, c: u.code, lr: num(u["lvl req"]), ql: num(u.lvl) }));
const sets = readTable("SetItems")
  .filter((s) => s.item && s.index && seen.has(s.item))
  .map((s) => ({ n: str(s.index, s.index).name, set: str(s.set, s.set).name, c: s.item, lr: num(s["lvl req"]) }));
const runewords = readTable("Runes")
  .filter((r) => num(r.complete) === 1)
  .map((r) => ({
    n: str(r.Name, r["Rune Name"]).name || r["Rune Name"],
    runes: [r.Rune1, r.Rune2, r.Rune3, r.Rune4, r.Rune5, r.Rune6].filter(Boolean),
    types: [r.itype1, r.itype2, r.itype3, r.itype4, r.itype5, r.itype6].filter(Boolean),
  }));

// ---- stats: ItemStatCost ids + wiki descriptions (the wiki wording matches what players see)
const stats = {};
for (const s of readTable("ItemStatCost")) {
  if (s.ID === "" || s.ID == null) continue;
  const pos = s.descstrpos ? str(s.descstrpos).name : "";
  stats[s.ID] = { id: num(s.ID), key: s.Stat, d: pos || s.Stat };
}
const stripWiki = (t) =>
  t
    .replace(/<!--.*?-->/g, "")
    .replace(/<span[^>]*>|<\/span>/g, "")
    .replace(/<\/?code>|<br\s*\/?>/g, " ")
    .replace(/'''?|''/g, "")
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, "$1")
    .replace(/style="[^"]*"\s*\|/g, "")
    .replace(/\s+/g, " ")
    .trim();
for (const m of wiki.matchAll(/^\|\s*(?:style="[^"]*"\s*\|\s*)?(?:<span[^>]*>)?STAT(\d+)(?:<\/span>)?\s*\|\|\s*(.+)$/gm)) {
  const id = Number(m[1]);
  const d = stripWiki(m[2]);
  if (!stats[id]) stats[id] = { id, key: "", d };
  else stats[id].d = d;
  stats[id].wiki = true;
}

// ---- skills (SKn) grouped by class, straight from the wiki tables
const skills = [];
{
  let cls = "";
  const start = wiki.indexOf("===== Individual Skills =====");
  const end = wiki.indexOf("=== Value Condition IDs ===");
  for (const line of wiki.slice(start, end).split("\n")) {
    const h = line.match(/^======\s*(.+?)\s*======/);
    if (h) cls = h[1];
    const m = line.match(/^\|\s*(?:<span[^>]*>)?SK(\d+)(?:<\/span>)?\s*\|\|\s*(.+)$/);
    if (m) skills.push({ id: Number(m[1]), n: stripWiki(m[2]), cls, gray: /^\|\s*<span/.test(line) });
  }
}

// ---- MAPID zones and corruption ids
function idTable(fromHeading, toHeading) {
  const a = wiki.indexOf(fromHeading);
  const b = toHeading ? wiki.indexOf(toHeading, a) : wiki.length;
  const out = [];
  for (const m of wiki.slice(a, b).matchAll(/^\|\s*(\d+)\s*\|\|\s*(.+)$/gm)) out.push({ id: Number(m[1]), n: stripWiki(m[2]) });
  return out;
}
const zones = idTable("==== MAPID IDs ====", "==== SUFFIX, PREFIX");
const corruptions = idTable("==== STAT360 IDs ====", "== Formulas ==");

// ---- magic affixes. Per the wiki: ids count from 1 and skip the classic/expansion divider row.
function affixes(table) {
  const out = [];
  let id = 0;
  for (const r of readTable(table)) {
    if (!r.Name || r.Name === "Expansion") continue;
    id++;
    if (num(r.spawnable) !== 1) continue;
    const mods = [1, 2, 3].map((i) => r[`mod${i}code`]).filter(Boolean);
    out.push({ id, n: str(r.Name, r.Name).name, lvl: num(r.level), g: num(r.group), mods, it: [r.itype1, r.itype2, r.itype3, r.itype4, r.itype5, r.itype6, r.itype7].filter(Boolean) });
  }
  return out;
}

// ---- sounds: keep non-looping entries, the only ones %SOUNDID-n% can play
const sounds = readTable("Sounds")
  .filter((s) => s.Sound && num(s.Loop) === 0)
  .map((s) => [num(s.Index), s.Sound]);

const types = itemTypes.map((t) => ({ c: t.Code, n: t.ItemType, eq: [t.Equiv1, t.Equiv2].filter(Boolean) }));

const out = {
  meta: {
    // Record counts BH reads at runtime as STAT_MAX / SKILL_MAX (range checks for STATn, SKn...).
    statRecs: readTable("ItemStatCost").length,
    skillRecs: readTable("Skills").length,
    // SOUNDID values at or above this become 0 (no sound, and the rule isn't a notification rule).
    soundRecs: readTable("Sounds").length,
    source: manifest.source,
    pd2dataModified: manifest.mtime,
    extracted: manifest.extracted,
    built: new Date().toISOString(),
  },
  items,
  uniques,
  sets,
  runewords,
  stats: Object.values(stats).sort((a, b) => a.id - b.id),
  skills,
  zones,
  corruptions,
  prefixes: affixes("MagicPrefix"),
  suffixes: affixes("MagicSuffix"),
  sounds,
  types,
  palette,
};
const dest = path.join(ROOT, "src", "data", "pd2data.json");
fs.writeFileSync(dest, JSON.stringify(out));
console.log(
  `wrote ${path.relative(ROOT, dest)}: ${items.length} items, ${uniques.length} uniques, ${sets.length} set items, ` +
    `${runewords.length} runewords, ${out.stats.length} stats, ${skills.length} skills, ${zones.length} zones, ` +
    `${out.prefixes.length}/${out.suffixes.length} affixes, ${sounds.length} sounds (${(fs.statSync(dest).size / 1024) | 0} KB)`
);
