// Stress test, Simple mode: for every public launcher filter, start from a Blank filter and use only
// Simple mode choices to make every item Simple mode can target look the way the original shows it.
// Reports how much of each filter Simple mode can reproduce, and why the rest can't be.
//
//   FF_STRESS_DIR=S:/pd2-filter-forge-build/stress/filters FF_SHARD=0 FF_SHARDS=6 npx vitest run stress/simple.test.ts
import { describe, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { actions, getState } from "../src/state/store";
import { decodeFilter } from "../src/lib/platform";
import { blankFilter } from "../src/lib/templates";
import { makeDirective, parseFilter } from "../src/lib/document";
import { compileDoc, runFilter, type FilterResult } from "../src/lib/engine";
import { DEFAULT_CTX, defaultColor, defaultName, makeItem, type TestItem } from "../src/lib/item";
import { DATA, ITEM_BY_CODE } from "../src/lib/data";
import { ALL_GROUPS, applyChoice, hasQualities, itemGroup, type Group, type SimpleStyle } from "../src/lib/simple";
import { ICON_KINDS } from "../src/lib/output";

const DIR = process.env.FF_STRESS_DIR ?? "";
const SHARD = Number(process.env.FF_SHARD ?? 0);
const SHARDS = Number(process.env.FF_SHARDS ?? 1);
const REPORT = path.join(DIR || ".", "..", `simple-report-${SHARD}.json`);
const files = (DIR && fs.existsSync(DIR) ? fs.readdirSync(DIR, { recursive: true }).map(String).filter((f) => f.toLowerCase().endsWith(".filter")).sort() : []).filter((_, i) => i % SHARDS === SHARD);

/** Every target Simple mode offers: the catalog, plus uniques, sets and bases from "Find any item". */
function targets(): Group[] {
  const out = new Map<string, Group>(ALL_GROUPS);
  for (const u of DATA.uniques) if (ITEM_BY_CODE.has(u.c)) out.set(`uni.${u.c}`, itemGroup("unique", u.c));
  for (const s of DATA.sets) if (ITEM_BY_CODE.has(s.c)) out.set(`set.${s.c}`, itemGroup("set", s.c));
  for (const b of DATA.items) if (!b.c.startsWith("t") || b.cat !== "misc") out.set(`item.${b.c}`, itemGroup("base", b.c));
  return [...out.values()];
}
const TARGETS = targets();

type Look = { hidden: boolean; text: string; colors: string[]; desc: string; icon?: { size: string; hex: string }; sound?: number };
function look(r: FilterResult): Look {
  const runs = r.display.lines.flat();
  const fx = r.notify && !r.hidden ? r.notify.effects : undefined;
  const k = fx ? ICON_KINDS.find((x) => fx[x]) : undefined;
  return {
    hidden: r.hidden,
    text: r.display.lines.map((row) => row.map((x) => x.text).join("")).join("\n"),
    colors: [...new Set(runs.filter((x) => x.text.trim()).map((x) => x.color))],
    desc: r.display.desc.map((row) => row.map((x) => x.text).join("")).join("\n"),
    icon: k ? { size: k, hex: fx![k]! } : undefined,
    sound: fx?.sound,
  };
}
const key = (l: Look) => JSON.stringify(l);

/** What Simple choices would reproduce this look, and why not when they can't. */
function deriveStyle(item: TestItem, looks: Look[]): { style: SimpleStyle | null; why?: string } {
  const lv = looks.length - 1;
  const hiddenAt = looks.map((l) => l.hidden);
  const s: SimpleStyle = {};
  // Hiding: always (every level from 1), from a level upward, or not at all.
  const firstHidden = hiddenAt.findIndex((h, i) => i > 0 && h);
  if (firstHidden > 0) {
    if (!hiddenAt.slice(firstHidden).every(Boolean)) return { style: null, why: "hidden on some levels but shown again on stricter ones" };
    s.hide = firstHidden === 1 ? (lv === 1 ? "always" : 1) : firstHidden;
  }
  const shown = looks.find((l) => !l.hidden);
  if (!shown) return { style: s };
  const variants = new Set(looks.filter((l) => !l.hidden).map((l) => key({ ...l, hidden: false })));
  if (variants.size > 1) return { style: null, why: "looks different on different strictness levels" };
  if (shown.desc) return { style: null, why: "adds a description (tooltip text)" };
  if (shown.text.includes("\n")) return { style: null, why: "name has several lines" };
  if (shown.colors.length > 1) return { style: null, why: "name uses several colors" };
  const name = defaultName(item);
  const color = shown.colors[0];
  if (color && color !== defaultColor(item)) s.color = color;
  if (shown.text !== name) {
    const at = shown.text.indexOf(name);
    if (shown.text === `*** ${name} ***`) s.stars = true;
    else if (at >= 0) {
      // "ooo Name ooo": text before / after the name.
      if (at > 0) s.prefix = shown.text.slice(0, at);
      if (at + name.length < shown.text.length) s.suffix = shown.text.slice(at + name.length);
    } else s.rename = shown.text;
  }
  if (shown.icon) s.icon = shown.icon as SimpleStyle["icon"];
  if (shown.sound != null) {
    if (shown.sound < 4714 || shown.sound > 4729) return { style: null, why: "plays a sound outside Simple mode's 16 drop sounds" };
    s.sound = shown.sound;
  }
  return { style: s };
}

describe.skipIf(!files.length)("rebuild every launcher filter (Simple)", () => {
  const reports: unknown[] = [];
  it.each(files)("%s", (rel) => {
    const t0 = Date.now();
    const { text } = decodeFilter(new Uint8Array(fs.readFileSync(path.join(DIR, rel))));
    const orig = parseFilter(text);
    const A = compileDoc(orig);
    const levelNames = orig.lines.filter((l) => l.kind === "level" && !l.disabled).map((l) => l.value ?? "");
    const levels = [0, ...levelNames.map((_, i) => i + 1)];

    // 1. Blank filter, then "Edit levels": rename the first level and add the rest.
    actions.openText(blankFilter(path.basename(rel)), { name: rel, origin: "Stress test" }, true);
    const first = getState().doc!.lines.find((l) => l.kind === "level")!;
    if (levelNames.length) actions.updateLine(first.id, { value: levelNames[0] });
    for (const n of levelNames.slice(1)) {
      const last = [...getState().doc!.lines].reverse().find((l) => l.kind === "level")!;
      actions.insertAfter(last.id, [makeDirective("level", "", n)], false);
    }

    // 2. Read how the original shows each target, and turn it into Simple choices.
    const reasons: Record<string, number> = {};
    const planned: { g: Group; looks: Look[]; style: SimpleStyle | null }[] = [];
    for (const g of TARGETS) {
      const { code, ...patch } = g.sample;
      const item = makeItem(code, patch);
      const looks = levels.map((lv) => look(runFilter(A, item, { ...DEFAULT_CTX, filtlvl: lv })));
      let { style, why } = deriveStyle(item, looks);
      // A searched base ("Every Amulet, any quality") applies to every quality of that base, so it can
      // only reproduce the original when the original treats the qualities alike.
      if (style && g.id.startsWith("item.") && Object.keys(style).length) {
        const sig = (q: TestItem["quality"]) => levels.map((lv) => look(runFilter(A, makeItem(code, { ...patch, quality: q, identified: false }), { ...DEFAULT_CTX, filtlvl: lv })).hidden).join();
        const qs: TestItem["quality"][] = ["normal", "magic", "rare", ...(DATA.uniques.some((u) => u.c === code) ? (["unique"] as const) : []), ...(DATA.sets.some((u) => u.c === code) ? (["set"] as const) : [])];
        if (new Set(qs.map(sig)).size > 1) {
          if (hasQualities(code)) {
            // The item panel's "Only white & grey ones" switch.
            planned.push({ g: itemGroup("white", code), looks, style });
            continue;
          }
          style = null;
          why = "base item shown differently by quality (Simple's searched base items cover every quality)";
        }
      }
      if (why) reasons[why] = (reasons[why] ?? 0) + 1;
      planned.push({ g, looks, style });
    }
    // Apply the choices the way the item panel does: one item at a time.
    let lines = getState().doc!.lines;
    for (const p of planned) if (p.style && Object.keys(p.style).length) lines = applyChoice(lines, p.g.id, p.style);
    actions.setLines(lines);

    // 2b. Like a player checking the result: an item a broader choice changed by mistake gets
    // pinned back with an explicit color (Simple drops choices identical to the default).
    let pinned = 0;
    {
      const B0 = compileDoc(getState().doc!);
      let l2 = getState().doc!.lines;
      for (const p of planned) {
        if (!p.style) continue;
        const { code, ...patch } = p.g.sample;
        const item = makeItem(code, patch);
        const wrong = levels.some((lv, i) => key(look(runFilter(B0, item, { ...DEFAULT_CTX, filtlvl: lv }))) !== key(p.looks[i]));
        const shown = p.looks.find((x) => !x.hidden);
        if (wrong && shown?.colors[0] && !p.style.color) {
          p.style = { ...p.style, color: shown.colors[0] };
          l2 = applyChoice(l2, p.g.id, p.style);
          pinned++;
        }
      }
      if (pinned) actions.setLines(l2);
    }

    // 3. Compare item by item, level by level.
    const B = compileDoc(getState().doc!);
    let exact = 0;
    let expressible = 0;
    let expressibleExact = 0;
    const misses: { target: string; level: number; want: string; got: string }[] = [];
    for (const p of planned) {
      const { code, ...patch } = p.g.sample;
      const item = makeItem(code, patch);
      const ok = levels.every((lv, i) => {
        const got = look(runFilter(B, item, { ...DEFAULT_CTX, filtlvl: lv }));
        const same = key(got) === key(p.looks[i]);
        if (!same && p.style && misses.length < 30) misses.push({ target: p.g.id, level: lv, want: key(p.looks[i]).slice(0, 160), got: key(got).slice(0, 160) });
        return same;
      });
      if (ok) exact++;
      if (p.style) {
        expressible++;
        if (ok) expressibleExact++;
      }
    }
    reports.push({ file: rel, targets: planned.length, exact, expressible, expressibleExact, pinned, reasons, misses, choices: planned.filter((p) => p.style && Object.keys(p.style).length).length, ms: Date.now() - t0 });
    fs.writeFileSync(REPORT, JSON.stringify(reports, null, 1));
  }, 900000);
});
