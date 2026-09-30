// Problems: what PD2 will silently get wrong in this filter. Each finding is a row with the problem on
// the left and what to do on the right; expanding it shows what PD2 does, a before/after of each fix,
// and the engine-reference section that backs it up.
import { useMemo, useState } from "react";
import engineReference from "../../docs/PD2-Filter-Engine-Reference.md?raw";
import { actions, getState, useStore } from "../state/store";
import { useAnalysis, type Analysis } from "../state/analysis";
import { editLine, type Line } from "../lib/document";
import { CHECKS, CHECK_BY_ID, IMPACTS, type CheckDef, type Fix, type Impact, type Issue } from "../lib/lint";
import { runDeepChecks } from "../lib/deep";
import { problemsReport } from "../lib/report";
import { browserDownload, isDesktop, pickSavePath, writeFileBytes } from "../lib/platform";
import { Icon } from "./icons";

const IMPACT_ORDER: Impact[] = ["breaks", "broadens", "misleads", "display", "tidy"];

/** Reference anchor → "§4 Aliases". */
const REF_TITLES: Map<string, string> = (() => {
  const m = new Map<string, string>();
  const lines = engineReference.split(/\r?\n/);
  lines.forEach((l, k) => {
    const a = l.match(/^<a id="([^"]+)"><\/a>$/);
    const h = a && lines[k + 1]?.match(/^#+\s+(?:(\d+)\.\s+)?(.*?)(?:\s+\(`.*`\))?$/);
    if (a && h) m.set(a[1], `${h[1] ? `§${h[1]} ` : ""}${h[2].replace(/`/g, "")}`);
  });
  return m;
})();

/** Apply one fix to the document. */
function applyFix(lines: Line[], l: Line, f: Fix): Line[] {
  if (f.remove) return lines.filter((x) => x.id !== l.id);
  if (f.move) {
    const moving = lines.find((x) => x.id === f.move!.id);
    if (!moving) return lines;
    const rest = lines.filter((x) => x.id !== moving.id);
    const anchor = rest.findIndex((x) => x.id === (f.move!.after ?? f.move!.before));
    if (anchor < 0) return lines;
    const at = f.move.after ? anchor + 1 : anchor;
    return [...rest.slice(0, at), moving, ...rest.slice(at)];
  }
  return lines.map((x) => (x.id === l.id ? editLine(x, { ...(f.key != null ? { key: f.key } : {}), ...(f.value != null ? { value: f.value } : {}) }) : x));
}

function doFix(l: Line, f: Fix) {
  const lines = getState().doc?.lines;
  if (!lines) return;
  actions.setLines(applyFix(lines, l, f));
  actions.toast(`${f.label}. Undo with Ctrl+Z.`);
}

let deepSignal = { cancelled: false };
async function startDeep(a: Analysis) {
  deepSignal.cancelled = true;
  deepSignal = { cancelled: false };
  const signal = deepSignal;
  const doc = { lines: a.lines, eol: "\n" as const };
  actions.setDeep({ forLines: a.lines, issues: [], done: 0, total: a.compiled.rules.length, running: true });
  const disabled = new Set(getState().settings.disabledChecks);
  await runDeepChecks(doc, a.compiled, (p) => !signal.cancelled && actions.setDeep({ done: p.done, total: p.total, issues: p.issues.filter((i) => !disabled.has(i.check)) }), signal);
  if (!signal.cancelled) actions.setDeep({ running: false });
}

export function ProblemsView() {
  const a = useAnalysis();
  const deep = useStore((s) => s.deep);
  const disabled = useStore((s) => s.settings.disabledChecks);
  const [impact, setImpact] = useState<Impact | "all">("all");
  const [q, setQ] = useState("");
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [showChecks, setShowChecks] = useState(false);
  const [showExport, setShowExport] = useState(false);

  const deepFresh = deep.forLines === a.lines;
  const all: Issue[] = useMemo(() => [...a.issues, ...(deepFresh ? deep.issues : [])], [a.issues, deep.issues, deepFresh]);
  const byImpact = useMemo(() => {
    const m: Record<Impact, number> = { breaks: 0, broadens: 0, misleads: 0, display: 0, tidy: 0 };
    for (const i of all) m[CHECK_BY_ID.get(i.check)!.impact]++;
    return m;
  }, [all]);

  const groups = useMemo(() => {
    const query = q.trim().toLowerCase();
    const m = new Map<string, Issue[]>();
    for (const i of all) {
      const def = CHECK_BY_ID.get(i.check)!;
      if (impact !== "all" && def.impact !== impact) continue;
      if (query && !`${def.title} ${i.msg} ${i.advice ?? ""} ${a.lines[i.line]?.raw}`.toLowerCase().includes(query)) continue;
      (m.get(i.check) ?? m.set(i.check, []).get(i.check)!).push(i);
    }
    return [...m.entries()].sort((x, y) => IMPACT_ORDER.indexOf(CHECK_BY_ID.get(x[0])!.impact) - IMPACT_ORDER.indexOf(CHECK_BY_ID.get(y[0])!.impact) || y[1].length - x[1].length);
  }, [all, impact, q, a.lines]);

  const sectionOf = (line: number) => {
    let title = "";
    for (const s of a.sections) if (line >= Math.max(0, s.start) && line < s.end) title = s.title;
    return title;
  };

  const fixAll = (issues: Issue[]) => {
    const byId = new Map<string, Fix>();
    for (const i of issues) {
      const f = i.fixes.find((x) => x.safe && !x.remove && !x.move);
      if (f && !byId.has(i.id)) byId.set(i.id, f);
    }
    let lines = a.lines;
    for (const [id, f] of byId) {
      const l = lines.find((x) => x.id === id);
      if (l) lines = applyFix(lines, l, f);
    }
    actions.setLines(lines);
    actions.toast(`Applied ${byId.size} fix${byId.size === 1 ? "" : "es"}. Undo with Ctrl+Z.`);
  };

  const total = all.length;
  return (
    <div className="page">
      <div className="row" style={{ alignItems: "flex-start", marginBottom: 12 }}>
        <div className="grow">
          <h2>Problems</h2>
          <p className="lead" style={{ marginBottom: 0 }}>
            PD2 never reports filter errors — it silently drops or reinterprets what it doesn't understand. Each finding says what's wrong, what to do, and (expanded) exactly what PD2 does, with a link to the engine reference.
          </p>
        </div>
        <button className="btn" onClick={() => actions.openDiscord("help")} title="Post in #filter-help on the Roofoo Discord, with your filter and this report attached">
          <Icon name="chat" size={15} /> Ask on Discord
        </button>
        <button className="btn" onClick={() => setShowExport(true)} disabled={total === 0} title="A text report of every problem and suggested fix, ready to paste into an AI assistant">
          <Icon name="copy" size={15} /> Copy for AI
        </button>
        <button className="btn" onClick={() => setShowChecks(true)}>
          <Icon name="settings" size={15} /> Checks
        </button>
      </div>

      <div className="health">
        <button className={`health-card ${impact === "all" ? "on" : ""}`} onClick={() => setImpact("all")}>
          <span className="n">{total}</span>
          <b>All findings</b>
          <span className="small muted">{total === 0 ? "Nothing PD2 would trip over." : `${groups.length} kinds`}</span>
        </button>
        {IMPACT_ORDER.map((k) => (
          <button key={k} className={`health-card ${k} ${impact === k ? "on" : ""}`} onClick={() => setImpact(impact === k ? "all" : k)} title={IMPACTS[k].blurb}>
            <span className="n">{byImpact[k]}</span>
            <b>{IMPACTS[k].label}</b>
            <span className="small muted ellipsis">{IMPACTS[k].blurb}</span>
          </button>
        ))}
      </div>

      <div className="card row" style={{ padding: "10px 14px", marginBottom: 14 }}>
        <Icon name="lab" size={16} />
        <div className="grow">
          <b>Deep check</b>
          <div className="small muted">
            Tests example items against every rule that targets specific items, to find rules an earlier rule overrides, icons/sounds that never fire, and descriptions that get wiped.
            {deepFresh && !deep.running && deep.total > 0 && ` Last run found ${deep.issues.length}.`}
            {!deepFresh && deep.forLines && " The filter changed since the last run."}
          </div>
        </div>
        {deep.running ? (
          <>
            <div className="progress" style={{ maxWidth: 200 }}>
              <div style={{ width: `${deep.total ? (deep.done / deep.total) * 100 : 0}%` }} />
            </div>
            <span className="small muted">
              {deep.done}/{deep.total}
            </span>
            <button className="btn sm" onClick={() => { deepSignal.cancelled = true; actions.setDeep({ running: false }); }}>
              Stop
            </button>
          </>
        ) : (
          <button className="btn" onClick={() => startDeep(a)}>
            {deepFresh && deep.total ? "Run again" : "Run deep check"}
          </button>
        )}
      </div>

      <div className="row" style={{ marginBottom: 12 }}>
        <input className="input grow" placeholder="Search problems, suggestions or rule text…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn sm ghost" onClick={() => setClosed(new Set())}>Expand all</button>
        <button className="btn sm ghost" onClick={() => setClosed(new Set(groups.map(([k]) => k)))}>Collapse all</button>
      </div>

      {groups.length === 0 && (
        <div className="empty">
          <Icon name="check" size={28} />
          <p>{total === 0 ? "No problems found. PD2 will read this filter exactly as written." : "Nothing matches this filter."}</p>
        </div>
      )}

      <div className="col" style={{ gap: 12, maxWidth: 1300 }}>
        {groups.map(([check, issues]) => {
          const def = CHECK_BY_ID.get(check)!;
          const isOpen = !closed.has(check);
          const fixable = issues.filter((i) => i.fixes.some((f) => f.safe && !f.remove && !f.move));
          const toggle = () => setClosed((s) => { const n = new Set(s); n.has(check) ? n.delete(check) : n.add(check); return n; });
          return (
            <div key={check} className="pcard">
              <div className="pcard-head" onClick={toggle}>
                <span className={`sev-dot ${IMPACTS[def.impact].sev}`} />
                <Icon name={isOpen ? "down" : "right"} size={15} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <b>{def.title}</b>
                  <div className="small muted ellipsis">{def.why}</div>
                </div>
                {def.deep && <span className="badge">deep</span>}
                <span className="badge">{IMPACTS[def.impact].label}</span>
                <span className="badge accent">{issues.length}</span>
                <div className="row" style={{ gap: 4 }} onClick={(e) => e.stopPropagation()}>
                  {fixable.length > 1 && (
                    <button className="btn sm" onClick={() => fixAll(fixable)} title="Applies only certain, mechanical fixes (never guesses). Undo with Ctrl+Z.">
                      <Icon name="wand" size={14} /> Fix all {fixable.length}
                    </button>
                  )}
                  <button className="btn sm ghost icon" title={`Read ${REF_TITLES.get(def.ref) ?? "the reference"}`} onClick={() => actions.openReference(def.ref)}>
                    <Icon name="codex" size={14} />
                  </button>
                  <button className="btn sm ghost icon" title="Stop checking for this" onClick={() => actions.setSettings({ disabledChecks: [...disabled, check] })}>
                    <Icon name="eyeoff" size={14} />
                  </button>
                </div>
              </div>
              {isOpen && <IssueTable issues={issues} def={def} a={a} sectionOf={sectionOf} />}
            </div>
          );
        })}
      </div>
      {showChecks && <ChecksDialog onClose={() => setShowChecks(false)} />}
      {showExport && (
        <ExportDialog
          all={all}
          shown={groups.flatMap(([, x]) => x)}
          filtered={impact !== "all" || !!q.trim()}
          lines={a.lines}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  );
}

function IssueTable({ issues, def, a, sectionOf }: { issues: Issue[]; def: CheckDef; a: Analysis; sectionOf: (line: number) => string }) {
  const [limit, setLimit] = useState(8);
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="ptable">
      <div className="ptable-head">
        <span>Problem</span>
        <span>Suggestion</span>
      </div>
      {issues.slice(0, limit).map((i, k) => {
        const l = a.lines[i.line];
        if (!l) return null;
        return <IssueRow key={`${i.id}-${k}`} i={i} l={l} def={def} lines={a.lines} section={sectionOf(i.line)} expanded={open === k} onToggle={() => setOpen(open === k ? null : k)} />;
      })}
      {issues.length > limit && (
        <div style={{ padding: "8px 14px" }}>
          <button className="btn sm" onClick={() => setLimit(limit + 100)}>
            Show {Math.min(100, issues.length - limit)} more of {issues.length - limit}
          </button>
        </div>
      )}
    </div>
  );
}

function IssueRow({ i, l, def, lines, section, expanded, onToggle }: { i: Issue; l: Line; def: CheckDef; lines: Line[]; section: string; expanded: boolean; onToggle: () => void }) {
  const advice = i.advice ?? def.advice;
  const primary = i.fixes[0];
  return (
    <div className={`prow ${expanded ? "open" : ""}`}>
      <div className="prow-main" onClick={onToggle}>
        <div className="prow-problem">
          <Icon name={expanded ? "down" : "right"} size={14} />
          <span className="lineno">{i.line + 1}</span>
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="prow-msg">{i.msg}</div>
            <div className="code wrap-line">
              <Highlighted text={l.raw.trim()} token={i.token} />
            </div>
          </div>
        </div>
        <div className="prow-fix">
          {advice && <div className="prow-advice">{advice}</div>}
          <div className="row wrap" style={{ gap: 6 }} onClick={(e) => e.stopPropagation()}>
            {primary && (
              <button className={`btn sm ${primary.safe ? "primary" : ""}`} onClick={() => doFix(l, primary)} title={primary.safe ? "Certain fix — same result PD2 would give, written correctly" : "A guess — check it's what you meant"}>
                <Icon name="wand" size={13} /> {primary.label}
              </button>
            )}
            {i.fixes.length > 1 && (
              <button className="btn sm ghost" onClick={onToggle}>
                {i.fixes.length - 1} more option{i.fixes.length > 2 ? "s" : ""}
              </button>
            )}
            <button className="btn sm ghost" onClick={() => actions.goTo(l.id)} title="Open this line in the editor">
              Open
            </button>
          </div>
        </div>
      </div>
      {expanded && (
        <div className="prow-detail">
          <div>
            <div className="section-title">What PD2 does</div>
            <p>{i.detail ?? def.why}</p>
            <div className="section-title">Line {i.line + 1}{section ? ` · ${section}` : ""}</div>
            <div className="code wrap">
              <Highlighted text={l.raw.trim()} token={i.token} />
            </div>
            <p className="small" style={{ marginTop: 10 }}>
              <a href="#" onClick={(e) => { e.preventDefault(); actions.openReference(def.ref); }}>
                <Icon name="codex" size={13} /> Engine reference: {REF_TITLES.get(def.ref) ?? def.ref}
              </a>
            </p>
          </div>
          <div>
            <div className="section-title">{i.fixes.length ? (i.fixes.length > 1 ? "Possible fixes" : "Fix") : "What to do"}</div>
            {advice && <p>{advice}</p>}
            {i.fixes.map((f, j) => (
              <FixPreview key={j} f={f} l={l} lines={lines} />
            ))}
            {!i.fixes.length && (
              <button className="btn sm" onClick={() => actions.goTo(l.id)}>
                Open line {i.line + 1} in the editor <Icon name="right" size={13} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FixPreview({ f, l, lines }: { f: Fix; l: Line; lines: Line[] }) {
  let body;
  if (f.remove) body = <div className="diff del">{l.raw.trim()}</div>;
  else if (f.move) {
    const from = lines.findIndex((x) => x.id === f.move!.id);
    const to = lines.findIndex((x) => x.id === (f.move!.after ?? f.move!.before));
    body = (
      <div className="small muted">
        Moves line {from + 1} (<code>{lines[from]?.raw.trim().slice(0, 60)}</code>) to just {f.move.after ? "below" : "above"} line {to + 1}.
      </div>
    );
  } else {
    const after = editLine(l, { ...(f.key != null ? { key: f.key } : {}), ...(f.value != null ? { value: f.value } : {}) }).raw.trim();
    body = <Diff before={l.raw.trim()} after={after} />;
  }
  return (
    <div className="fixprev">
      <div className="row" style={{ gap: 8 }}>
        <span className={`badge ${f.safe ? "ok" : ""}`} title={f.safe ? "Mechanical: does exactly what the text already means, written so PD2 reads it" : "A guess at what you meant"}>
          {f.safe ? "certain" : "suggestion"}
        </span>
        <b className="grow">{f.label}</b>
        <button className={`btn sm ${f.safe ? "primary" : ""}`} onClick={() => doFix(l, f)}>
          Apply
        </button>
      </div>
      {body}
    </div>
  );
}

/** Before/after with the changed middle highlighted, cropped around the change. */
function Diff({ before, after }: { before: string; after: string }) {
  let p = 0;
  while (p < before.length && p < after.length && before[p] === after[p]) p++;
  let s = 0;
  while (s < before.length - p && s < after.length - p && before[before.length - 1 - s] === after[after.length - 1 - s]) s++;
  const ctx = 40;
  const crop = (t: string) => {
    const head = t.slice(0, p);
    const mid = t.slice(p, t.length - s);
    const tail = t.slice(t.length - s);
    return [head.length > ctx ? `…${head.slice(-ctx)}` : head, mid, tail.length > ctx ? `${tail.slice(0, ctx)}…` : tail];
  };
  const [bh, bm, bt] = crop(before);
  const [ah, am, at] = crop(after);
  return (
    <div className="diff">
      <div className="del">
        <span className="sign">−</span>
        {bh}
        <mark>{bm}</mark>
        {bt}
      </div>
      <div className="ins">
        <span className="sign">+</span>
        {ah}
        <mark>{am}</mark>
        {at}
      </div>
    </div>
  );
}

function Highlighted({ text, token }: { text: string; token?: string }) {
  const t = token?.trim();
  const at = t ? text.indexOf(t) : -1;
  if (!t || at < 0) return <span>{text}</span>;
  return (
    <span>
      {text.slice(0, at)}
      <mark>{t}</mark>
      {text.slice(at + t.length)}
    </span>
  );
}

function ChecksDialog({ onClose }: { onClose: () => void }) {
  const disabled = useStore((s) => s.settings.disabledChecks);
  const set = new Set(disabled);
  const toggle = (id: string) => actions.setSettings({ disabledChecks: set.has(id) ? disabled.filter((x) => x !== id) : [...disabled, id] });
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="dialog" style={{ width: "min(860px, 94vw)" }}>
        <div className="dialog-head">
          <Icon name="settings" />
          <h2>Checks</h2>
          <span className="small muted">
            {CHECKS.length - set.size} of {CHECKS.length} on
          </span>
          <button className="btn icon ghost" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="dialog-body">
          {IMPACT_ORDER.map((imp) => (
            <div key={imp} className="col" style={{ gap: 4 }}>
              <div className="section-title">{IMPACTS[imp].label}</div>
              {CHECKS.filter((c) => c.impact === imp).map((c) => (
                <label key={c.id} className="row" style={{ alignItems: "flex-start", padding: "4px 0" }}>
                  <button className={`switch ${set.has(c.id) ? "" : "on"}`} onClick={() => toggle(c.id)} />
                  <div className="grow">
                    <b>{c.title}</b> {c.deep && <span className="badge">deep</span>}
                    <div className="small muted">{c.why}</div>
                  </div>
                  <a href="#" className="small" onClick={(e) => { e.preventDefault(); onClose(); actions.openReference(c.ref); }}>
                    {REF_TITLES.get(c.ref) ?? "reference"}
                  </a>
                </label>
              ))}
            </div>
          ))}
        </div>
        <div className="dialog-foot">
          <button className="btn" onClick={() => actions.setSettings({ disabledChecks: [] })}>
            Turn all on
          </button>
          <button className="btn primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </>
  );
}

function ExportDialog({ all, shown, filtered, lines, onClose }: { all: Issue[]; shown: Issue[]; filtered: boolean; lines: Line[]; onClose: () => void }) {
  const fileName = useStore((s) => s.file?.name);
  const [onlyShown, setOnlyShown] = useState(filtered);
  const [tidy, setTidy] = useState(false);
  const pool = (onlyShown ? shown : all).filter((i) => tidy || CHECK_BY_ID.get(i.check)?.impact !== "tidy");
  const text = useMemo(
    () => problemsReport(pool, lines, { fileName, filtered: onlyShown && filtered ? "only the ones currently shown in Filter Forge" : !tidy ? "tidy-ups left out" : undefined }),
    [pool, lines, fileName, onlyShown, filtered, tidy]
  );
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      actions.toast(`Copied ${pool.length} problem${pool.length === 1 ? "" : "s"} — paste it into your AI assistant.`);
    } catch {
      actions.toast("Couldn't copy; use Save .txt instead.");
    }
  };
  const save = async () => {
    const base = (fileName ?? "filter").replace(/\.filter$/i, "");
    const name = `${base} - problems.txt`;
    // Windows line endings so it opens cleanly in Notepad.
    const bytes = new TextEncoder().encode(text.replace(/\n/g, "\r\n"));
    if (!isDesktop) return browserDownload(name, bytes);
    const path = await pickSavePath(name, { name: "Text", extensions: ["txt"] });
    if (!path) return;
    await writeFileBytes(path, bytes, false);
    actions.toast(`Saved ${name}.`);
  };
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="dialog" style={{ width: "min(900px, 94vw)" }}>
        <div className="dialog-head">
          <Icon name="copy" />
          <h2>Problems report for AI</h2>
          <span className="small muted">
            {pool.length} problem{pool.length === 1 ? "" : "s"} · {text.length.toLocaleString()} characters
          </span>
          <button className="btn icon ghost" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="dialog-body">
          <p className="small muted" style={{ margin: 0 }}>
            Every problem with its line, what PD2 does, and the suggested fixes — plus a short primer on how PD2 reads filters, so the assistant judges fixes correctly. Paste it into ChatGPT, Claude or any other assistant.
          </p>
          <div className="row wrap">
            {filtered && (
              <label className="row small">
                <button className={`switch ${onlyShown ? "on" : ""}`} onClick={() => setOnlyShown(!onlyShown)} />
                Only what's shown now ({shown.length})
              </label>
            )}
            <label className="row small">
              <button className={`switch ${tidy ? "on" : ""}`} onClick={() => setTidy(!tidy)} />
              Include tidy-ups
            </label>
          </div>
          <textarea className="input mono export-text" readOnly value={text} onFocus={(e) => e.currentTarget.select()} />
        </div>
        <div className="dialog-foot">
          <button className="btn" onClick={save}>
            <Icon name="save" size={15} /> Save .txt
          </button>
          <button className="btn primary" onClick={copy} disabled={!pool.length}>
            <Icon name="copy" size={15} /> Copy to clipboard
          </button>
        </div>
      </div>
    </>
  );
}
