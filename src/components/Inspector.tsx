// Right-hand panel: everything about the selected line, explained and editable.
import { useMemo, useState } from "react";
import { actions, useStore } from "../state/store";
import { useAnalysis } from "../state/analysis";
import { compileCondition } from "../lib/conditions";
import { describeOutput, describeTree } from "../lib/explain";
import { renderStandalone, splitOutput } from "../lib/output";
import { sampleItem } from "../lib/sample";
import { parseFormula, evalFormula, renderFormulaValue } from "../lib/formula";
import { resolveCode } from "../lib/conditions";
import { headerTitle, type Line } from "../lib/document";
import { runFilter } from "../lib/engine";
import { D2Label, MapIcons } from "./D2Label";
import { ConditionBuilder } from "./ConditionBuilder";
import { OutputEditor } from "./OutputEditor";
import { CodeField } from "./CodeField";
import { Icon } from "./icons";
import { duplicate } from "./RulesView";
import { qualityLabel } from "../lib/item";
import { lookupCode } from "../lib/data";

export function Inspector({ onNew }: { onNew: () => void }) {
  const a = useAnalysis();
  const selected = useStore((s) => s.selected);
  const liveLine = useStore((s) => (selected ? s.doc?.lines.find((l) => l.id === selected) : undefined));
  if (!liveLine) {
    return (
      <div className="insp">
        <div className="empty">
          <p>Select a rule to see what it does and edit it.</p>
          <button className="btn primary" onClick={onNew}>
            <Icon name="plus" size={16} /> New rule
          </button>
          <p className="small faint" style={{ marginTop: 18 }}>
            Tips: <span className="kbd">↑↓</span> move through rules · <span className="kbd">Alt ↑↓</span> reorder · <span className="kbd">Space</span> enable/disable ·{" "}
            <span className="kbd">Ctrl D</span> duplicate · <span className="kbd">Del</span> delete · <span className="kbd">Ctrl K</span> search everything
          </p>
        </div>
      </div>
    );
  }
  const index = a.indexOf.get(liveLine.id) ?? 0;
  return (
    <div className="insp" key={liveLine.id}>
      <LineHeader l={liveLine} index={index} />
      {liveLine.kind === "rule" ? <RuleInspector l={liveLine} /> : <OtherInspector l={liveLine} index={index} />}
    </div>
  );
}

function LineHeader({ l, index }: { l: Line; index: number }) {
  const kind = { rule: "Rule", alias: "Alias", formula: "Formula", level: "Filter level", comment: "Comment", blank: "Blank line", other: "Unrecognised line" }[l.kind];
  const toggleable = l.kind === "rule" || l.kind === "alias" || l.kind === "formula" || l.kind === "level";
  return (
    <div className="row">
      <b>{kind}</b>
      <span className="badge">line {index + 1}</span>
      {l.disabled && <span className="badge warn">disabled</span>}
      <span className="grow" />
      {toggleable && (
        <button className={`switch ${l.disabled ? "" : "on"}`} title={l.disabled ? "Enable" : "Disable (comment out)"} onClick={() => actions.updateLine(l.id, { disabled: !l.disabled })} />
      )}
      <button className="btn sm icon ghost" title="Move up (Alt+↑)" onClick={() => actions.move(l.id, -1)}>
        <Icon name="up" size={15} />
      </button>
      <button className="btn sm icon ghost" title="Move down (Alt+↓)" onClick={() => actions.move(l.id, 1)}>
        <Icon name="down" size={15} />
      </button>
      <button className="btn sm icon ghost" title="Duplicate (Ctrl+D)" onClick={() => duplicate(l.id)}>
        <Icon name="copy" size={15} />
      </button>
      <button className="btn sm icon ghost danger" title="Delete (Del)" onClick={() => actions.remove([l.id])}>
        <Icon name="trash" size={15} />
      </button>
    </div>
  );
}

function RuleInspector({ l }: { l: Line }) {
  const a = useAnalysis();
  const ctx = useStore((s) => s.ctx);
  const testItem = useStore((s) => s.testItem);
  const [mode, setMode] = useState<"visual" | "text">("visual");
  const [previewWith, setPreviewWith] = useState<"sample" | "test">("sample");
  const cond = l.key ?? "";
  const value = l.value ?? "";
  const compiled = useMemo(() => compileCondition(cond, a.defs), [cond, a.defs]);
  const sample = useMemo(() => sampleItem(compiled.tree), [compiled]);
  const item = previewWith === "test" ? testItem : sample;
  const env = { item, ctx, defs: a.defs };
  const r = useMemo(() => renderStandalone(value, env), [value, item, ctx, a.defs]); // eslint-disable-line react-hooks/exhaustive-deps
  const fx = useMemo(() => describeOutput(value), [value]);
  const issues = a.issuesById.get(l.id) ?? [];
  const levels = a.defs.levels.map((x) => x.name);
  const index = a.indexOf.get(l.id) ?? -1;

  // What actually happens to the preview item with the whole filter, to explain overrides.
  const whole = useMemo(() => runFilter(a.compiled, item, ctx), [a.compiled, item, ctx]);
  const decidedHere = whole.final === index || whole.matched.includes(index);

  return (
    <>
      <div className="block explain">
        <div className="block-head">
          <Icon name="info" size={16} />
          <h3>In plain words</h3>
        </div>
        <p>
          <b>When:</b> {compiled.error ? <span style={{ color: "var(--err)" }}>never (the conditions are broken)</span> : describeTree(compiled.tree)}
        </p>
        <p>
          <b>Then:</b> {fx.join(" · ")}
        </p>
      </div>

      {issues.length > 0 && (
        <div className="issues">
          {issues.map((i, k) => (
            <div key={k} className={`issue ${i.sev === "error" ? "err" : i.sev}`}>
              <Icon name={i.sev === "info" ? "info" : "problems"} size={15} />
              <div className="grow">
                {i.msg}
                {i.advice && <div className="small muted">{i.advice}</div>}
              </div>
              {i.fixCond && (
                <button className="btn sm" onClick={() => actions.updateLine(l.id, { key: i.fixCond })}>
                  {i.fixLabel ?? "Fix"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="block">
        <div className="block-head">
          <h3>Preview</h3>
          <div className="seg">
            <button className={previewWith === "sample" ? "on" : ""} onClick={() => setPreviewWith("sample")} title="An item built from this rule's conditions">
              Sample item
            </button>
            <button className={previewWith === "test" ? "on" : ""} onClick={() => setPreviewWith("test")} title="The item set up in the Test Lab">
              Test Lab item
            </button>
          </div>
        </div>
        <div className="preview-stage">
          <D2Label r={r} showDesc hiddenText="hidden on the ground" />
          <MapIcons fx={splitOutput(value).effects} size={1.2} />
        </div>
        <div className="row small muted wrap">
          <span>
            {qualityLabel(item.quality)} {lookupCode(item.code)?.n ?? item.code}
            {item.ethereal ? " · eth" : ""}
            {item.sockets ? ` · ${item.sockets} sockets` : ""} · ilvl {item.ilvl}
          </span>
          <span className="grow" />
          {!decidedHere && whole.final != null && (
            <button className="btn sm" onClick={() => actions.goTo(a.lines[whole.final!].id)} title="An earlier rule decides how this item looks">
              <Icon name="problems" size={13} /> Line {whole.final + 1} wins first
            </button>
          )}
          <button
            className="btn sm"
            onClick={() => {
              actions.replaceTestItem(sample);
              actions.setView("lab");
            }}
          >
            <Icon name="lab" size={13} /> Open in Test Lab
          </button>
        </div>
      </div>

      <div className="block">
        <div className="block-head">
          <h3>Which items</h3>
          <div className="seg">
            <button className={mode === "visual" ? "on" : ""} onClick={() => setMode("visual")}>
              Visual
            </button>
            <button className={mode === "text" ? "on" : ""} onClick={() => setMode("text")}>
              Text
            </button>
          </div>
        </div>
        {mode === "text" || compiled.error ? (
          <>
            <CodeField mode="cond" defs={a.defs} value={cond} onChange={(v) => actions.updateLine(l.id, { key: v })} placeholder="Empty = every item" />
            <div className="help">
              Separate conditions with spaces (AND). Use OR and parentheses for alternatives, ! to negate. Press <span className="kbd">Tab</span> to accept a suggestion.
            </div>
          </>
        ) : null}
        {mode === "visual" && <ConditionBuilder id={l.id} cond={cond} defs={a.defs} />}
      </div>

      <div className="block">
        <div className="block-head">
          <h3>How they look</h3>
        </div>
        <OutputEditor id={l.id} value={value} defs={a.defs} levels={levels} />
      </div>

      <div className="block">
        <div className="block-head">
          <h3>Note</h3>
        </div>
        <input className="input" placeholder="Optional comment saved at the end of the line" value={l.note ?? ""} onChange={(e) => actions.updateLine(l.id, { note: e.target.value || undefined })} />
        <details>
          <summary className="small muted" style={{ cursor: "pointer" }}>
            Raw line
          </summary>
          <div className="code-hl" style={{ marginTop: 6 }}>
            {l.raw}
          </div>
        </details>
      </div>
    </>
  );
}

function OtherInspector({ l, index }: { l: Line; index: number }) {
  const a = useAnalysis();
  const issues = a.issuesById.get(l.id) ?? [];
  const item = useStore((s) => s.testItem);
  const ctx = useStore((s) => s.ctx);
  const uses = useMemo(() => {
    if (l.kind !== "alias" && l.kind !== "formula") return [];
    const name = l.kind === "alias" ? (l.key ?? "").trim().split(/\s+/)[0] : `FORMULA${(l.key ?? "").trim().toUpperCase()}`;
    if (!name) return [];
    return a.lines.filter((x) => x.id !== l.id && (x.kind === "rule" || x.kind === "alias") && (`${x.key}`.includes(name) || `${x.value}`.toUpperCase().includes(`%${name.toUpperCase()}%`)));
  }, [a, l]);

  const formulaResult = useMemo(() => {
    if (l.kind !== "formula") return null;
    try {
      return renderFormulaValue(evalFormula(parseFormula(l.value ?? ""), (n, p) => resolveCode(n, p, { item, ctx, defs: a.defs })));
    } catch (e) {
      return `error: ${(e as Error).message}`;
    }
  }, [l, item, ctx, a.defs]);

  return (
    <>
      {issues.map((i, k) => (
        <div key={k} className={`issue ${i.sev === "error" ? "err" : i.sev}`}>
          <Icon name="problems" size={15} />
          <div>{i.msg}</div>
        </div>
      ))}
      {l.kind === "comment" && (
        <div className="block">
          <div className="field">
            <label>{headerTitle(a.lines, index) ? "Section header text" : "Comment text"}</label>
            <input className="input mono" value={l.text ?? ""} onChange={(e) => actions.updateLine(l.id, { text: e.target.value })} />
          </div>
          <div className="help">Comments start with // and are ignored by the game. Lines like // ==== NAME ==== become sections in the outline.</div>
        </div>
      )}
      {(l.kind === "alias" || l.kind === "formula" || l.kind === "level") && (
        <div className="block">
          {l.kind !== "level" && (
            <div className="field">
              <label>Name</label>
              <input className="input mono" value={l.key ?? ""} onChange={(e) => actions.updateLine(l.id, { key: e.target.value })} />
            </div>
          )}
          <div className="field">
            <label>{l.kind === "level" ? "Level name shown in-game" : l.kind === "alias" ? "Replaced with" : "Expression"}</label>
            {l.kind === "alias" ? (
              <CodeField mode={/%/.test(l.value ?? "") ? "out" : "cond"} defs={a.defs} value={l.value ?? ""} onChange={(v) => actions.updateLine(l.id, { value: v })} />
            ) : (
              <input className="input mono" value={l.value ?? ""} onChange={(e) => actions.updateLine(l.id, { value: e.target.value })} />
            )}
          </div>
          {l.kind === "alias" && <div className="help">Aliases are find-and-replace: every rule containing {l.key} gets it swapped for the text above when the filter loads. In output, write %{(l.key ?? "").toUpperCase()}%.</div>}
          {l.kind === "formula" && (
            <div className="help">
              Use as FORMULA{(l.key ?? "").toUpperCase()} in conditions or %FORMULA{(l.key ?? "").toUpperCase()}% in output. With the Test Lab item it equals <b>{formulaResult}</b>.
            </div>
          )}
          {l.kind === "level" && (
            <div className="help">
              This is filter level {a.defs.levels.findIndex((x) => x.id === l.id) + 1}. Rules use it via FILTLVL and %TIER-n%. Manage all levels in <a href="#" onClick={(e) => { e.preventDefault(); actions.setView("definitions"); }}>Levels, Aliases & Formulas</a>.
            </div>
          )}
        </div>
      )}
      {uses.length > 0 && (
        <div className="block">
          <div className="block-head">
            <h3>Used by {uses.length} line{uses.length === 1 ? "" : "s"}</h3>
          </div>
          {uses.slice(0, 40).map((u) => (
            <div key={u.id} className="trace-step" onClick={() => actions.goTo(u.id)}>
              <span className="lineno">{(a.indexOf.get(u.id) ?? 0) + 1}</span>
              <span className="ellipsis mono small">{u.raw.trim()}</span>
            </div>
          ))}
        </div>
      )}
      {l.kind === "other" && (
        <div className="block">
          <div className="field">
            <label>Line text</label>
            <input
              className="input mono"
              defaultValue={l.raw}
              onBlur={async (e) => {
                const { parseLine } = await import("../lib/document");
                const next = parseLine(e.target.value);
                actions.replaceLine(l.id, { ...next, id: l.id });
              }}
            />
          </div>
          <div className="help">PD2 ignores lines that aren't comments or Name[...]: ... directives.</div>
        </div>
      )}
      {l.kind === "blank" && <div className="empty small">Blank line (kept for spacing).</div>}
    </>
  );
}
