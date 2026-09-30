// The filter as plain text: highlighted read view (virtualised) and a full-text edit mode.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { actions, useStore } from "../state/store";
import { useAnalysis } from "../state/analysis";
import { lineText, parseFilter, type Line } from "../lib/document";
import { segmentOutput } from "../lib/output";
import { COLOR_CSS } from "../lib/spec";
import { Icon } from "./icons";

const ROW = 22;

export function Highlight({ l }: { l: Line }) {
  const text = lineText(l);
  if (l.kind === "comment" || l.kind === "blank") return <span className="hl-comment">{text}</span>;
  if (l.kind === "other") return <span className="hl-unknown">{text}</span>;
  const head = { rule: "ItemDisplay", alias: "Alias", formula: "Formula", level: "ItemDisplayFilterName" }[l.kind];
  const segs = segmentOutput(l.value ?? "");
  return (
    <>
      {l.indent}
      {l.disabled && <span className="hl-comment">//</span>}
      <span className="hl-dir">{head}</span>[<span className="hl-kw">{l.key}</span>]:{l.value ? " " : ""}
      {segs.map((s, i) => (
        <span
          key={i}
          className={
            s.kind === "color" ? "hl-color" : s.kind === "notify" ? "hl-notify" : s.kind === "special" ? "hl-special" : s.kind === "value" || s.kind === "stat" ? "hl-value" : s.kind === "unknown" ? "hl-unknown" : s.kind === "alias" ? "hl-alias" : undefined
          }
          style={s.kind === "color" ? { color: COLOR_CSS[s.code!] } : undefined}
        >
          {s.raw}
        </span>
      ))}
      {l.note != null && <span className="hl-comment">{"\t//" + l.note}</span>}
    </>
  );
}

export function SourceView() {
  const a = useAnalysis();
  const selected = useStore((s) => s.selected);
  const eol = useStore((s) => s.doc?.eol ?? "\n");
  const [edit, setEdit] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState(0);
  const [h, setH] = useState(600);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setH(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [edit]);
  useEffect(() => {
    const i = selected ? a.indexOf.get(selected) : undefined;
    if (i != null && ref.current) ref.current.scrollTop = Math.max(0, i * ROW - 200);
    // only when opening the view
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (edit != null) {
    return (
      <div className="col" style={{ height: "100%", padding: 12, gap: 10 }}>
        <div className="row">
          <b className="grow">Editing the whole file as text</b>
          <span className="small muted">Changes apply when you press Apply (undo works afterwards).</span>
          <button className="btn" onClick={() => setEdit(null)}>
            Cancel
          </button>
          <button
            className="btn primary"
            onClick={() => {
              actions.setLines(parseFilter(edit).lines);
              setEdit(null);
              actions.toast("Text applied");
            }}
          >
            Apply
          </button>
        </div>
        <textarea className="textarea grow" style={{ resize: "none", whiteSpace: "pre", overflow: "auto" }} spellCheck={false} value={edit} onChange={(e) => setEdit(e.target.value)} />
      </div>
    );
  }

  const first = Math.max(0, Math.floor(scroll / ROW) - 10);
  const last = Math.min(a.lines.length, Math.ceil((scroll + h) / ROW) + 10);
  return (
    <div className="col" style={{ height: "100%", gap: 0 }}>
      <div className="pane-head">
        <Icon name="source" size={16} />
        <b className="grow">Source</b>
        <span className="small muted">{a.lines.length.toLocaleString()} lines · click a line to open it</span>
        <button className="btn" onClick={() => setEdit(a.lines.map(lineText).join(eol))}>
          Edit as text
        </button>
      </div>
      <div ref={ref} className="vlist" onScroll={(e) => setScroll((e.target as HTMLDivElement).scrollTop)}>
        <div style={{ height: a.lines.length * ROW, position: "relative" }}>
          {a.lines.slice(first, last).map((l, k) => {
            const i = first + k;
            const iss = a.issuesById.get(l.id);
            return (
              <div key={l.id} className={`source-line ${selected === l.id ? "on" : ""}`} style={{ position: "absolute", top: i * ROW, left: 0, right: 0 }} onClick={() => actions.goTo(l.id)}>
                <span className="lineno" style={{ color: iss?.some((x) => x.sev === "error") ? "var(--err)" : undefined }}>
                  {i + 1}
                </span>
                <span>
                  <Highlight l={l} />
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
