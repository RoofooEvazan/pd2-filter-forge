// The main editor: sections outline | rule list | inspector.
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { actions, getState, useStore } from "../state/store";
import { useAnalysis, useTestResult, type Analysis } from "../state/analysis";
import { headingAt, makeBlank, makeComment, editLine, newId, type Line } from "../lib/document";
import { tokenize, type Tok } from "../lib/conditions";
import { renderStandalone, splitOutput, type Rendered } from "../lib/output";
import { sampleItem } from "../lib/sample";
import { DATA } from "../lib/data";
import { describeTree } from "../lib/explain";
import { D2Label, MapIcons } from "./D2Label";
import { Icon } from "./icons";
import { Inspector } from "./Inspector";
import { NewRuleDialog } from "./NewRuleDialog";

type Filter = "all" | "problems" | "notify" | "hides" | "disabled" | "test";

export function RulesView() {
  const [newRule, setNewRule] = useState(false);
  return (
    <div className="rules">
      <Outline />
      <RuleList onNew={() => setNewRule(true)} />
      <div className="pane">
        <Inspector onNew={() => setNewRule(true)} />
      </div>
      {newRule && <NewRuleDialog onClose={() => setNewRule(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------- outline

function Outline() {
  const a = useAnalysis();
  const selected = useStore((s) => s.selected);
  const [q, setQ] = useState("");
  const selIndex = selected ? a.indexOf.get(selected) ?? -1 : -1;
  const current = a.sections.find((s) => selIndex >= Math.max(0, s.start) && selIndex < s.end);
  const secs = q ? a.sections.filter((s) => s.title.toLowerCase().includes(q.toLowerCase())) : a.sections;
  return (
    <div className="pane">
      <div className="pane-head">
        <Icon name="layers" size={16} />
        <b className="grow">Sections</b>
        <span className="badge">{a.compiled.rules.length} rules</span>
      </div>
      <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--line)" }}>
        <input className="input" style={{ width: "100%" }} placeholder="Filter sections…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="pane-body">
        {secs.map((s) => {
          const errs = a.issues.filter((i) => i.sev === "error" && i.line >= Math.max(0, s.start) && i.line < s.end).length;
          return (
            <div
              key={s.id}
              className={`outline-item ${current === s ? "on" : ""}`}
              style={s.depth ? { paddingLeft: 26, fontSize: "0.9em", color: "var(--muted)" } : { fontWeight: 600 }}
              onClick={() => {
                const first = a.lines.slice(Math.max(0, s.start), s.end).find((l) => l.kind === "rule") ?? a.lines[Math.max(0, s.start)];
                if (first) actions.select(first.id, true);
              }}
              title={s.title}
            >
              <span className="title">{s.title}</span>
              {errs > 0 && <span className="badge err">{errs}</span>}
              <span className="small faint">{s.rules}</span>
            </div>
          );
        })}
        {secs.length === 0 && <div className="empty small">No sections. Add comment headers like // ==== RUNES ==== to organise your filter.</div>}
      </div>
      <div style={{ padding: 10, borderTop: "1px solid var(--line)" }}>
        <button
          className="btn sm"
          style={{ width: "100%", justifyContent: "center" }}
          onClick={() => {
            const title = window.prompt("Section name", "NEW SECTION");
            if (!title) return;
            const bar = "==========================================================";
            const lines = [makeBlank(), makeComment(bar), makeComment(` ${title.toUpperCase()}`), makeComment(bar)];
            actions.insertAfter(getState().selected, lines);
          }}
        >
          <Icon name="plus" size={14} /> Add section after selection
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- previews

const previewCache = new Map<string, Rendered>();
function rulePreview(a: Analysis, l: Line): Rendered | null {
  const key = `${l.key}\u0000${l.value}`;
  const hit = previewCache.get(key);
  if (hit) return hit;
  const cr = a.ruleById.get(l.id);
  if (!cr && !l.disabled) return null;
  try {
    const tree = cr?.tree ?? null;
    const item = sampleItem(tree);
    const r = renderStandalone(l.value ?? "", { item, ctx: getState().ctx, defs: a.defs });
    if (previewCache.size > 20000) previewCache.clear();
    previewCache.set(key, r);
    return r;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- rule list

function matchesQuery(l: Line, q: string, codes: Set<string>): boolean {
  const raw = l.raw.toLowerCase();
  if (raw.includes(q)) return true;
  if (codes.size && l.kind === "rule") {
    for (const t of (l.key ?? "").split(/[\s()!]+/)) if (codes.has(t.slice(0, 4))) return true;
  }
  return false;
}

function RuleList({ onNew }: { onNew: () => void }) {
  const a = useAnalysis();
  const selected = useStore((s) => s.selected);
  const reveal = useStore((s) => s.reveal);
  const showBlank = useStore((s) => s.settings.showBlankLines);
  const ruleText = useStore((s) => s.settings.ruleText);
  const test = useTestResult();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState(0);
  const [height, setHeight] = useState(600);
  const [rowH, setRowH] = useState(40);

  const matched = useMemo(() => new Set(test?.matched ?? []), [test]);

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    // Item-name search: "shako" finds rules that mention uap.
    const codes = new Set<string>();
    if (query.length >= 3) {
      for (const i of DATA.items) if (i.n.toLowerCase().includes(query)) codes.add(i.c);
      for (const u of [...DATA.uniques, ...DATA.sets]) if (u.n.toLowerCase().includes(query)) codes.add(u.c);
    }
    const out: number[] = [];
    a.lines.forEach((l, i) => {
      if (l.kind === "blank" && !showBlank) return;
      if (query && !matchesQuery(l, query, codes)) return;
      if (filter !== "all") {
        if (l.kind !== "rule") return;
        if (filter === "problems" && !a.issuesById.get(l.id)?.some((x) => x.sev !== "info")) return;
        if (filter === "disabled" && !l.disabled) return;
        if (filter === "test" && !matched.has(i)) return;
        if (filter === "notify" || filter === "hides") {
          const p = splitOutput(l.value ?? "");
          if (filter === "notify" && !["border", "map", "dot", "px", "line"].some((k) => (p.effects as any)[k]) && p.effects.sound == null) return;
          if (filter === "hides" && (p.name.trim() !== "" || p.effects.cont)) return;
        }
      }
      out.push(i);
    });
    return out;
  }, [a, filter, q, showBlank, matched]);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const measure = () => {
      setHeight(el.clientHeight);
      const v = parseFloat(getComputedStyle(el).getPropertyValue("--row"));
      if (v) setRowH(v);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Scroll a revealed line into view.
  useEffect(() => {
    if (!reveal || !listRef.current) return;
    const idx = a.indexOf.get(reveal.id);
    const pos = rows.indexOf(idx ?? -1);
    if (pos < 0 && idx != null) {
      // Revealed line is filtered out: clear filters so it can be shown.
      setFilter("all");
      setQ("");
      return;
    }
    const el = listRef.current;
    const top = pos * rowH;
    if (top < el.scrollTop || top > el.scrollTop + el.clientHeight - rowH * 2) el.scrollTop = Math.max(0, top - el.clientHeight / 3);
    // Render the destination rows right away rather than waiting for the scroll event.
    setScroll(el.scrollTop);
  }, [reveal, rows, a, rowH]);

  const first = Math.max(0, Math.floor(scroll / rowH) - 8);
  const last = Math.min(rows.length, Math.ceil((scroll + height) / rowH) + 8);

  const onKey = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).closest("input,textarea,select")) return;
    const cur = selected ? rows.indexOf(a.indexOf.get(selected) ?? -1) : -1;
    const go = (p: number) => {
      const i = rows[Math.max(0, Math.min(rows.length - 1, p))];
      if (i != null) actions.select(a.lines[i].id, true);
    };
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (e.altKey && selected) actions.move(selected, 1);
      else go(cur + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (e.altKey && selected) actions.move(selected, -1);
      else go(cur - 1);
    } else if (e.key === "PageDown") {
      e.preventDefault();
      go(cur + Math.floor(height / rowH));
    } else if (e.key === "PageUp") {
      e.preventDefault();
      go(cur - Math.floor(height / rowH));
    } else if (e.key === "Delete" && selected) {
      e.preventDefault();
      actions.remove([selected]);
    } else if (e.key === " " && selected) {
      e.preventDefault();
      const l = a.lines[a.indexOf.get(selected) ?? -1];
      if (l && l.kind !== "comment" && l.kind !== "blank" && l.kind !== "other") actions.updateLine(selected, { disabled: !l.disabled });
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d" && selected) {
      e.preventDefault();
      duplicate(selected);
    } else if (e.key === "Insert" || (e.key.toLowerCase() === "n" && !e.ctrlKey)) {
      e.preventDefault();
      onNew();
    }
  };

  const chips: [Filter, string, number?][] = [
    ["all", "All"],
    ["problems", "Problems", a.counts.error + a.counts.warn],
    ["notify", "Notifications"],
    ["hides", "Hides items"],
    ["disabled", "Disabled"],
    ["test", "Match test item", test?.matched.length],
  ];

  return (
    <div className="pane" onKeyDown={onKey}>
      <div className="pane-head">
        <div className="row grow" style={{ position: "relative" }}>
          <Icon name="search" size={16} />
          <input className="input grow" placeholder="Search rules, codes or item names (e.g. shako, r33, %BORDER)…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="seg" title="Show each rule's conditions in plain words or as filter code">
          <button className={ruleText === "plain" ? "on" : ""} onClick={() => actions.setSettings({ ruleText: "plain" })}>
            Words
          </button>
          <button className={ruleText === "code" ? "on" : ""} onClick={() => actions.setSettings({ ruleText: "code" })}>
            Code
          </button>
        </div>
        <button className="btn primary" onClick={onNew} title="New rule (N)">
          <Icon name="plus" size={16} /> New rule
        </button>
      </div>
      <div className="chips">
        {chips.map(([f, label, n]) => (
          <button key={f} className={`chip ${filter === f ? "on" : ""}`} onClick={() => setFilter(f)}>
            {label}
            {n ? ` · ${n}` : ""}
          </button>
        ))}
        <span className="grow" />
        <span className="small faint" style={{ alignSelf: "center" }}>
          {rows.length.toLocaleString()} lines
        </span>
      </div>
      <div className="vlist" ref={listRef} tabIndex={0} onScroll={(e) => setScroll((e.target as HTMLDivElement).scrollTop)}>
        <div style={{ height: rows.length * rowH, position: "relative" }}>
          {rows.slice(first, last).map((i, k) => {
            const l = a.lines[i];
            return (
              <Row
                key={l.id}
                a={a}
                l={l}
                index={i}
                top={(first + k) * rowH}
                on={selected === l.id}
                hit={matched.has(i) && filter !== "test" ? (test?.final === i ? "final" : "hit") : filter === "test" && test?.final === i ? "final" : undefined}
                mode={ruleText}
              />
            );
          })}
        </div>
        {rows.length === 0 && <div className="empty">Nothing matches. {q ? "Try a different search." : ""}</div>}
      </div>
    </div>
  );
}

export function duplicate(id: string) {
  const s = getState();
  const l = s.doc?.lines.find((x) => x.id === id);
  if (!l) return;
  actions.insertAfter(id, [editLine({ ...l, id: newId() }, {})]);
}

const Row = memo(function Row({ a, l, index, top, on, hit }: { a: Analysis; l: Line; index: number; top: number; on: boolean; hit?: "hit" | "final"; mode: string }) {
  const issues = a.issuesById.get(l.id);
  const worst = issues?.some((i) => i.sev === "error") ? "err" : issues?.some((i) => i.sev === "warn") ? "warn" : issues?.length ? "info" : null;
  const style = { top };
  const sel = () => actions.select(l.id);
  const cls = `vrow ${on ? "on" : ""} ${hit ? `hit ${hit}` : ""} ${l.disabled ? "disabled" : ""}`;

  if (l.kind === "comment") {
    const h = headingAt(a.lines, index);
    if (h)
      return (
        <div className={`${cls} header ${h.depth ? "sub" : ""}`} style={style} onClick={sel}>
          <span className="lineno">{index + 1}</span>
          <Icon name={h.depth ? "right" : "layers"} size={14} />
          <span className="ellipsis">{h.title}</span>
        </div>
      );
    return (
      <div className={`${cls} comment`} style={style} onClick={sel}>
        <span className="lineno">{index + 1}</span>
        <span className="ellipsis">//{l.text}</span>
      </div>
    );
  }
  if (l.kind === "blank")
    return (
      <div className={cls} style={style} onClick={sel}>
        <span className="lineno">{index + 1}</span>
      </div>
    );
  if (l.kind === "alias" || l.kind === "formula" || l.kind === "level") {
    const label = l.kind === "alias" ? "Alias" : l.kind === "formula" ? "Formula" : "Filter level";
    return (
      <div className={`${cls} def`} style={style} onClick={sel}>
        <span className="lineno">{index + 1}</span>
        <span className="badge accent">{label}</span>
        {l.kind !== "level" && <b>{l.key}</b>}
        <span className="ellipsis muted">{l.value}</span>
        {worst && <span className={`badge ${worst}`}>{issues!.length}</span>}
      </div>
    );
  }
  if (l.kind === "other")
    return (
      <div className={`${cls} comment`} style={style} onClick={sel}>
        <span className="lineno">{index + 1}</span>
        <span className="ellipsis">{l.raw}</span>
        {worst && <span className={`badge ${worst}`}>{issues!.length}</span>}
      </div>
    );

  const r = rulePreview(a, l);
  const fx = splitOutput(l.value ?? "").effects;
  const plain = getState().settings.ruleText === "plain";
  const cr = a.ruleById.get(l.id);
  return (
    <div className={cls} style={style} onClick={sel} onDoubleClick={sel}>
      <span className="lineno">{index + 1}</span>
      <button
        className={`switch ${l.disabled ? "" : "on"}`}
        title={l.disabled ? "Disabled (commented out). Click to enable." : "Enabled. Click to disable."}
        onClick={(e) => {
          e.stopPropagation();
          actions.updateLine(l.id, { disabled: !l.disabled });
        }}
      />
      <div className="rule-preview">{r ? <D2Label r={r} hiddenText="hidden" /> : <span className="faint small">—</span>}</div>
      {plain ? (
        <div className="rule-plain" title={`ItemDisplay[${l.key}]`}>
          {cr?.error ? <span style={{ color: "var(--err)" }}>Broken: never matches</span> : l.disabled ? <span className="faint">(disabled) {l.key}</span> : describeTree(cr?.tree ?? null)}
        </div>
      ) : (
        <div className="rule-cond">
          <CondTokens cond={l.key ?? ""} a={a} />
        </div>
      )}
      <div className="rule-fx">
        <MapIcons fx={fx} />
        {fx.sound != null && (
          <span title={`Sound ${fx.sound}`} style={{ color: "var(--muted)", display: "flex" }}>
            <Icon name="sound" size={15} />
          </span>
        )}
        {fx.tier != null && <span className="badge" title={`Notification only at filter level ${fx.tier} or below`}>T{fx.tier}</span>}
        {fx.cont && (
          <span title="%CONTINUE%: keeps checking later rules" style={{ color: "var(--accent)", display: "flex" }}>
            <Icon name="cont" size={15} />
          </span>
        )}
        {worst && (
          <span className={`badge ${worst}`} title={issues!.map((i) => i.msg).join("\n")}>
            <Icon name="problems" size={12} />
            {issues!.length}
          </span>
        )}
      </div>
    </div>
  );
});

export function CondTokens({ cond, a, max = 24 }: { cond: string; a: Analysis; max?: number }) {
  const toks: Tok[] = useMemo(() => tokenize(cond, a.defs), [cond, a.defs]);
  if (!cond.trim()) return <span className="tok flag">every item</span>;
  return (
    <>
      {toks.slice(0, max).map((t, i) => {
        if (t.t === "leaf") {
          const l = t.leaf;
          const label = l.cls === "item" && l.base ? l.base.n : l.text;
          return (
            <span key={i} className={`tok ${l.cls}`} title={l.issue ?? (l.cls === "item" ? `${l.key}: ${l.base?.n}` : l.kw?.desc ?? l.text)}>
              {label}
            </span>
          );
        }
        const txt = t.t === "not" ? "!" : t.t === "lp" ? "(" : t.t === "rp" ? ")" : t.t.toUpperCase();
        return (
          <span key={i} className={`tok ${t.t === "not" ? "not" : "op"}`}>
            {txt}
          </span>
        );
      })}
      {toks.length > max && <span className="tok op">…</span>}
    </>
  );
}
