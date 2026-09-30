// Filter levels, aliases and formulas in one place.
import { UnidPanel } from "./UnidPanel";
import { useMemo, useState } from "react";
import { actions, getState, useStore } from "../state/store";
import { useAnalysis } from "../state/analysis";
import { makeDirective, type Line } from "../lib/document";
import { parseFormula, evalFormula, renderFormulaValue } from "../lib/formula";
import { resolveCode } from "../lib/conditions";
import { FORMULA_FUNCTIONS, MAX_FILTER_LEVELS } from "../lib/spec";
import { Icon } from "./icons";

export function DefinitionsView() {
  const a = useAnalysis();
  const levelLines = a.lines.filter((l) => l.kind === "level");
  const aliasLines = a.lines.filter((l) => l.kind === "alias");
  const formulaLines = a.lines.filter((l) => l.kind === "formula");

  const insertDef = (kind: "level" | "alias" | "formula", key: string, value: string) => {
    const same = a.lines.filter((l) => l.kind === kind);
    const anchor = same[same.length - 1] ?? a.lines.find((l) => l.kind === "level" || l.kind === "alias") ?? a.lines.find((l) => l.kind === "rule");
    const line = makeDirective(kind, key, value);
    if (anchor && same.length) actions.insertAfter(anchor.id, [line], false);
    else actions.insertAt(Math.max(0, anchor ? (a.indexOf.get(anchor.id) ?? 0) : 0), [line]);
  };

  return (
    <div className="page">
      <h2>Levels, Aliases, Formulas & Features</h2>
      <p className="lead">The building blocks your rules share. Changes here update every rule that uses them.</p>

      <div className="col" style={{ gap: 22, maxWidth: 1100 }}>
        <section className="block">
          <div className="block-head">
            <Icon name="eye" />
            <h3>Unidentified item names</h3>
          </div>
          <UnidPanel />
        </section>
        <section className="block">
          <div className="block-head">
            <Icon name="layers" />
            <h3>Filter levels ({levelLines.length}/{MAX_FILTER_LEVELS})</h3>
            <button className="btn sm" disabled={levelLines.length >= MAX_FILTER_LEVELS} onClick={() => insertDef("level", "", `Level ${levelLines.length + 1}`)}>
              <Icon name="plus" size={14} /> Add level
            </button>
          </div>
          <div className="help">
            Players choose one of these in-game (Options → PD2 Options → Filter Level). Level 0 "Show All Items" always exists. Rules check the chosen level with FILTLVL (e.g. FILTLVL&gt;2 = level 3 and up) and notifications with %TIER-n%. Order matters: reordering renumbers levels.
          </div>
          {levelLines.length === 0 && <div className="small muted">No custom levels: PD2 shows a single "Standard" level.</div>}
          {levelLines.map((l, i) => (
            <LevelRow key={l.id} l={l} n={i + 1} />
          ))}
        </section>

        <section className="block">
          <div className="block-head">
            <Icon name="link" />
            <h3>Aliases ({aliasLines.length})</h3>
            <button className="btn sm" onClick={() => insertDef("alias", "NEWALIAS", "(r30 OR r31 OR r32 OR r33)")}>
              <Icon name="plus" size={14} /> Add alias
            </button>
          </div>
          <div className="help">Find-and-replace shortcuts. Use the name in conditions (HIGHRUNES) or as %HIGHRUNES% in output. Tip: an alias set to TRUE or FALSE works as an on/off switch for groups of rules.</div>
          <AliasTable lines={aliasLines} />
        </section>

        <section className="block">
          <div className="block-head">
            <Icon name="spark" />
            <h3>Formulas ({formulaLines.length})</h3>
            <button className="btn sm" onClick={() => insertDef("formula", "TOTALRES", "FRES+CRES+LRES+PRES")}>
              <Icon name="plus" size={14} /> Add formula
            </button>
          </div>
          <div className="help">
            Calculations over item stats. Use FORMULANAME&gt;60 in conditions or %FORMULANAME% to print the number. Inline: $f(FRES+CRES)&gt;40. Functions: {FORMULA_FUNCTIONS.map((f) => f.name).join(", ")}.
          </div>
          {formulaLines.map((l) => (
            <FormulaRow key={l.id} l={l} />
          ))}
        </section>
      </div>
    </div>
  );
}

function LevelRow({ l, n }: { l: Line; n: number }) {
  return (
    <div className="row">
      <span className="badge accent" style={{ width: 34, justifyContent: "center" }}>
        {n}
      </span>
      <input className="input grow" value={l.value ?? ""} onChange={(e) => actions.updateLine(l.id, { value: e.target.value })} />
      <button className="btn sm icon ghost" title="Move up" onClick={() => moveAmongKind(l, -1)}>
        <Icon name="up" size={14} />
      </button>
      <button className="btn sm icon ghost" title="Move down" onClick={() => moveAmongKind(l, 1)}>
        <Icon name="down" size={14} />
      </button>
      <button className="btn sm icon ghost danger" title="Remove level (rules using FILTLVL keep their numbers)" onClick={() => actions.remove([l.id])}>
        <Icon name="trash" size={14} />
      </button>
    </div>
  );
}

function moveAmongKind(l: Line, d: number) {
  const lines = getState().doc!.lines;
  const same = lines.map((x, i) => [x, i] as const).filter(([x]) => x.kind === l.kind);
  const k = same.findIndex(([x]) => x.id === l.id);
  const other = same[k + d];
  if (!other) return;
  const next = [...lines];
  const i = same[k][1];
  const j = other[1];
  [next[i], next[j]] = [next[j], next[i]];
  actions.setLines(next);
}

function AliasTable({ lines }: { lines: Line[] }) {
  const a = useAnalysis();
  const [q, setQ] = useState("");
  const rows = lines.filter((l) => !q || `${l.key} ${l.value}`.toLowerCase().includes(q.toLowerCase()));
  const usage = useMemo(() => {
    const text = a.lines.filter((l) => l.kind === "rule" || l.kind === "alias").map((l) => `${l.key}\u0000${l.value}`).join("\n");
    const m = new Map<string, number>();
    for (const l of lines) {
      const name = (l.key ?? "").trim().split(/\s+/)[0];
      if (!name) continue;
      m.set(l.id, text.split(name).length - 2 + (text.split(`%${name.toUpperCase()}%`).length - 1));
    }
    return m;
  }, [a, lines]);
  return (
    <>
      {lines.length > 8 && <input className="input" placeholder="Filter aliases…" value={q} onChange={(e) => setQ(e.target.value)} />}
      <div style={{ maxHeight: 460, overflow: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 200 }}>Name</th>
              <th>Replaced with</th>
              <th style={{ width: 70 }}>Uses</th>
              <th style={{ width: 70 }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.id}>
                <td>
                  <input className="input mono" style={{ width: "100%" }} value={l.key ?? ""} onChange={(e) => actions.updateLine(l.id, { key: e.target.value })} />
                </td>
                <td>
                  <input className="input mono" style={{ width: "100%" }} value={l.value ?? ""} onChange={(e) => actions.updateLine(l.id, { value: e.target.value })} />
                </td>
                <td className="small muted">{Math.max(0, usage.get(l.id) ?? 0)}</td>
                <td>
                  <button className="btn sm icon ghost" title="Show in rules" onClick={() => actions.goTo(l.id)}>
                    <Icon name="right" size={14} />
                  </button>
                  <button className="btn sm icon ghost danger" title="Delete" onClick={() => actions.remove([l.id])}>
                    <Icon name="trash" size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function FormulaRow({ l }: { l: Line }) {
  const a = useAnalysis();
  const item = useStore((s) => s.testItem);
  const ctx = useStore((s) => s.ctx);
  let result: string;
  let bad = false;
  try {
    result = renderFormulaValue(evalFormula(parseFormula(l.value ?? ""), (n, p) => resolveCode(n, p, { item, ctx, defs: a.defs })));
  } catch (e) {
    result = (e as Error).message;
    bad = true;
  }
  return (
    <div className="row">
      <span className="mono small faint">FORMULA</span>
      <input className="input mono" style={{ width: 170 }} value={l.key ?? ""} onChange={(e) => actions.updateLine(l.id, { key: e.target.value.toUpperCase().replace(/[^A-Z_]/g, "") })} />
      <input className="input mono grow" value={l.value ?? ""} onChange={(e) => actions.updateLine(l.id, { value: e.target.value })} />
      <span className={`badge ${bad ? "err" : "ok"}`} title="Value for the current Test Lab item">
        {bad ? "error" : `= ${result}`}
      </span>
      {bad && <span className="small" style={{ color: "var(--err)" }}>{result}</span>}
      <button className="btn sm icon ghost danger" onClick={() => actions.remove([l.id])}>
        <Icon name="trash" size={14} />
      </button>
    </div>
  );
}
