// Stress test: rebuild every public launcher filter with Filter Forge's own editing paths and check
// the result matches the original — byte for byte, rule by rule through the visual editors, and item
// by item in the game simulation.
//
//   FF_STRESS_DIR=S:/pd2-filter-forge-build/stress/filters npx vitest run stress/rebuild.test.ts
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { actions, getState } from "../src/state/store";
import { decodeFilter, encodeFilter } from "../src/lib/platform";
import { blankFilter } from "../src/lib/templates";
import { collectDefinitions, makeBlank, makeComment, makeDirective, makeRule, parseFilter, serializeFilter, type Line } from "../src/lib/document";
import { compileCondition, evalTree, parseCondition, serializeTree } from "../src/lib/conditions";
import { buildAction, composeOutput, splitOutput } from "../src/lib/output";
import { compileDoc, runFilter, type FilterResult } from "../src/lib/engine";
import { DEFAULT_CTX, makeItem, type TestItem, type ViewContext } from "../src/lib/item";
import { sampleItem } from "../src/lib/sample";
import { ALL_GROUPS } from "../src/lib/simple";

const DIR = process.env.FF_STRESS_DIR ?? "";
const SHARD = Number(process.env.FF_SHARD ?? 0);
const SHARDS = Number(process.env.FF_SHARDS ?? 1);
const REPORT = path.join(DIR || ".", "..", `advanced-report-${SHARD}.json`);

interface FileReport {
  file: string;
  lines: number;
  rules: number;
  sourceExact: boolean;
  structuredExactLines: number;
  structuredDiffs: { line: number; before: string; after: string }[];
  structuredBytesEqual: boolean;
  builderChecked: number;
  builderDiffs: { line: number; cond: string; rebuilt: string; item: string }[];
  builderUnsupported: number;
  outputChecked: number;
  outputDiffs: { line: number; value: string; rebuilt: string }[];
  behaviourChecked: number;
  behaviourDiffs: { item: string; level: number; before: string; after: string }[];
  ms: number;
  stages: Record<string, number>;
}

const files = (DIR && fs.existsSync(DIR) ? fs.readdirSync(DIR, { recursive: true }).map(String).filter((f) => f.toLowerCase().endsWith(".filter")).sort() : []).filter((_, i) => i % SHARDS === SHARD);

/** Build the filter line by line the way the editor does it, starting from a Blank filter. */
function rebuildStructured(orig: Line[], name: string) {
  actions.openText(blankFilter(name), { name, origin: "Stress test" }, true);
  actions.setLines([]); // "Select all → delete"
  for (const l of orig) {
    const at = getState().doc!.lines.length;
    let line: Line;
    switch (l.kind) {
      case "blank":
        line = makeBlank();
        break;
      case "comment":
        line = makeComment(l.text ?? "");
        break;
      case "level":
      case "alias":
      case "formula":
        // Levels, Aliases & Formulas page: add, then type the name and value.
        line = makeDirective(l.kind, "", "");
        break;
      case "rule":
        // New rule → "Start blank", then the inspector's condition and output fields.
        line = makeRule("", "");
        break;
      default:
        // Lines the editor can't create on its own (unknown directives) go in through Source text.
        line = parseFilter(l.raw).lines[0];
    }
    actions.insertAt(at, [line]);
    if (l.kind === "rule" || l.kind === "alias" || l.kind === "formula" || l.kind === "level") {
      actions.updateLine(line.id, { key: l.key, value: l.value, ...(l.note != null ? { note: l.note } : {}), ...(l.indent ? { indent: l.indent } : {}), ...(l.disabled ? { disabled: true } : {}) });
    }
  }
  return getState().doc!.lines;
}

function describe2(r: FilterResult) {
  const runs = (rows: { text: string; color?: string }[][]) => rows.map((row) => row.map((x) => `${x.color ?? ""}:${x.text}`).join("")).join("|");
  const fx = r.notify?.effects;
  return `${r.hidden ? "HIDDEN" : runs(r.display.lines)}{${runs(r.display.desc)}}${fx ? JSON.stringify({ ...fx, cont: undefined }) : ""}`;
}

function itemLabel(it: TestItem) {
  return `${it.code} ${it.quality}${it.ethereal ? " eth" : ""}${it.identified ? "" : " unid"}${it.sockets ? ` ${it.sockets}os` : ""}`;
}

describe.skipIf(!files.length)("rebuild every launcher filter (Advanced)", () => {
  const reports: FileReport[] = [];

  it.each(files)("%s", (rel) => {
    const t0 = Date.now();
    const bytes = new Uint8Array(fs.readFileSync(path.join(DIR, rel)));
    const { text, valid } = decodeFilter(bytes);
    const doc = parseFilter(text);
    const enc = valid ? "utf8" : "ansi";
    const bom = doc.bom ? new Uint8Array([0xef, 0xbb, 0xbf]) : new Uint8Array();
    const save = (lines: Line[]) => {
      const body = encodeFilter(serializeFilter({ ...doc, lines }), enc);
      const out = new Uint8Array(bom.length + body.length);
      out.set(bom);
      out.set(body, bom.length);
      return out;
    };
    const same = (a: Uint8Array) => a.length === bytes.length && a.every((b, i) => b === bytes[i]);
    const rep: FileReport = {
      file: rel, lines: doc.lines.length, rules: doc.lines.filter((l) => l.kind === "rule").length,
      sourceExact: false, structuredExactLines: 0, structuredDiffs: [], structuredBytesEqual: false,
      builderChecked: 0, builderDiffs: [], builderUnsupported: 0, outputChecked: 0, outputDiffs: [], behaviourChecked: 0, behaviourDiffs: [], ms: 0, stages: {},
    };

    // A. Source text: paste the file into "Edit as text" and save.
    rep.sourceExact = same(save(parseFilter(text).lines));

    let tick = Date.now();
    const lap = (k: string) => { rep.stages[k] = Date.now() - tick; tick = Date.now(); };
    lap("A");
    // B. Structured rebuild through the editor.
    const rebuilt = rebuildStructured(doc.lines, path.basename(rel));
    expect(rebuilt.length).toBe(doc.lines.length);
    rebuilt.forEach((l, i) => {
      const a = doc.lines[i].raw;
      const b = l.dirty ? (serializeFilter({ ...doc, lines: [l] }).slice(0, -doc.eol.length)) : l.raw;
      if (a === b) rep.structuredExactLines++;
      else if (rep.structuredDiffs.length < 25) rep.structuredDiffs.push({ line: i + 1, before: a.slice(0, 200), after: b.slice(0, 200) });
    });
    rep.structuredBytesEqual = same(save(rebuilt));
    lap("B");

    // C. Visual condition builder and output editor round trips, judged by PD2's own reading.
    const defs = collectDefinitions(doc.lines);
    const ctx: ViewContext = { ...DEFAULT_CTX };
    const samples: TestItem[] = [];
    doc.lines.forEach((l, i) => {
      if (l.kind !== "rule" || l.disabled) return;
      const cond = l.key ?? "";
      const parsed = parseCondition(cond, defs);
      const orig = compileCondition(cond, defs);
      let sample: TestItem | null = null;
      try {
        sample = sampleItem(parsed.tree);
      } catch {
        sample = null;
      }
      if (sample && samples.length < 1500) samples.push(sample);
      if (parsed.error) rep.builderUnsupported++;
      else {
        const rebuiltCond = serializeTree(parsed.tree);
        if (rebuiltCond !== cond) {
          rep.builderChecked++;
          const again = compileCondition(rebuiltCond, defs);
          const probe = [sample, ...samples.slice(-12)].filter(Boolean) as TestItem[];
          for (const it of probe) {
            const env = { item: it, ctx, defs };
            const x = !orig.error && !orig.bh.never ? evalTree(orig.tree, env) : false;
            const y = !again.error && !again.bh.never ? evalTree(again.tree, env) : false;
            if (x !== y) {
              if (rep.builderDiffs.length < 25) rep.builderDiffs.push({ line: i + 1, cond, rebuilt: rebuiltCond, item: itemLabel(it) });
              break;
            }
          }
        }
      }
      const value = l.value ?? "";
      const composed = composeOutput(splitOutput(value));
      if (composed !== value) {
        rep.outputChecked++;
        const a = buildAction(value, defs);
        const b = buildAction(composed, defs);
        if (JSON.stringify([a.name, a.desc, a.effects]) !== JSON.stringify([b.name, b.desc, b.effects]) && rep.outputDiffs.length < 25)
          rep.outputDiffs.push({ line: i + 1, value, rebuilt: composed });
      }
    });

    lap("C");
    // D. Whole-filter behaviour: the original and the rebuilt filter must show items the same way.
    const groupSamples = [...ALL_GROUPS.values()].map((g) => {
      const { code, ...patch } = g.sample;
      return makeItem(code, patch);
    });
    const items = [...groupSamples, ...samples.filter((_, k) => k % Math.max(1, Math.ceil(samples.length / 300)) === 0)];
    const A = compileDoc(doc);
    const B = compileDoc({ ...doc, lines: rebuilt });
    const levels = [0, Math.max(1, Math.floor(defs.levels.length / 2)), defs.levels.length].filter((v, k, a) => a.indexOf(v) === k);
    for (const it of items)
      for (const lv of levels) {
        const c = { ...ctx, filtlvl: lv };
        const a = describe2(runFilter(A, it, c));
        const b = describe2(runFilter(B, it, c));
        rep.behaviourChecked++;
        if (a !== b && rep.behaviourDiffs.length < 25) rep.behaviourDiffs.push({ item: itemLabel(it), level: lv, before: a.slice(0, 200), after: b.slice(0, 200) });
      }

    lap("D");
    rep.ms = Date.now() - t0;
    reports.push(rep);
    fs.writeFileSync(REPORT, JSON.stringify(reports, null, 1));
  }, 600000);
});
