// Visual editor for a rule's conditions: nested "ALL of" / "ANY of" groups, NOT toggles and
// per-condition operator/value editing. Every change re-serialises to PD2 syntax.
import { useState } from "react";
import { classify, parseCondition, serializeTree, type Leaf, type Node, type Op } from "../lib/conditions";
import type { Definitions } from "../lib/document";
import { describeLeaf } from "../lib/explain";
import { actions } from "../state/store";
import { ConditionPicker, type Pick } from "./Picker";
import { Icon } from "./icons";

type Group = { t: "and" | "or"; items: Node[] };
type Path = number[];

function asGroup(n: Node | null): Group {
  if (!n) return { t: "and", items: [] };
  if (n.t === "and" || n.t === "or") return n;
  return { t: "and", items: [n] };
}

function update(root: Group, path: Path, fn: (n: Node) => Node | null): Group {
  if (path.length === 0) return fn(root) as Group;
  const [i, ...rest] = path;
  const items = [...root.items];
  const child = items[i];
  let next: Node | null;
  if (rest.length === 0) next = fn(child);
  else if (child.t === "not") {
    const inner = child.item.t === "and" || child.item.t === "or" ? child.item : asGroup(child.item);
    next = { t: "not", item: update(inner, rest, fn) };
  } else next = update(child as Group, rest, fn);
  if (next == null) items.splice(i, 1);
  else items[i] = next;
  return { ...root, items };
}

function leafText(key: string, op?: Op, v?: number, v2?: number) {
  if (!op) return key;
  if (op === "~") return `${key}~${v ?? 0}-${v2 ?? v ?? 0}`;
  return `${key}${op}${v ?? 0}`;
}

function picksToNodes(p: Pick, defs: Definitions, parent: "and" | "or"): Node[] {
  const leaves: Node[] = p.texts.map((t) => ({ t: "leaf", leaf: classify(t, defs) }));
  if (leaves.length === 1) return leaves;
  const want = p.any ? "or" : "and";
  return want === parent ? leaves : [{ t: want, items: leaves }];
}

export function ConditionBuilder({ id, cond, defs }: { id: string; cond: string; defs: Definitions }) {
  const parsed = parseCondition(cond, defs);
  const [picker, setPicker] = useState<{ path: Path; rect: DOMRect } | null>(null);

  if (parsed.error) {
    return (
      <div className="issue err">
        <Icon name="problems" size={16} />
        <div>
          <b>The visual editor can't show this rule:</b> {parsed.error} Fix it in the text box above, or use a fix from the Problems list.
        </div>
      </div>
    );
  }
  const root = asGroup(parsed.tree);
  const commit = (g: Group) => {
    const tree: Node | null = g.items.length === 0 ? null : g.items.length === 1 && g.t === "and" ? g.items[0] : g;
    actions.updateLine(id, { key: serializeTree(tree) });
  };

  const onPick = (p: Pick) => {
    if (!picker) return;
    const path = picker.path;
    commit(
      update(root, path, (n) => {
        const g = n.t === "not" ? asGroup(n.item) : (n as Group);
        const added = { ...g, items: [...g.items, ...picksToNodes(p, defs, g.t)] };
        return n.t === "not" ? { t: "not", item: added } : added;
      })
    );
    setPicker(null);
  };

  return (
    <>
      <GroupView g={root} path={[]} root={root} commit={commit} openPicker={(path, rect) => setPicker({ path, rect })} defs={defs} top />
      {picker && <ConditionPicker defs={defs} anchor={picker.rect} onPick={onPick} onClose={() => setPicker(null)} />}
    </>
  );
}

function GroupView({
  g,
  path,
  root,
  commit,
  openPicker,
  defs,
  top,
  negated,
}: {
  g: Group;
  path: Path;
  root: Group;
  commit: (g: Group) => void;
  openPicker: (path: Path, rect: DOMRect) => void;
  defs: Definitions;
  top?: boolean;
  negated?: boolean;
}) {
  const setType = (t: "and" | "or") => commit(update(root, path, (n) => (n.t === "not" ? { t: "not", item: { ...asGroup(n.item), t } } : { ...(n as Group), t })));
  const addGroup = () =>
    commit(
      update(root, path, (n) => {
        const grp = n.t === "not" ? asGroup(n.item) : (n as Group);
        const added = { ...grp, items: [...grp.items, { t: grp.t === "and" ? "or" : "and", items: [] } as Node] };
        return n.t === "not" ? { t: "not", item: added } : added;
      })
    );
  return (
    <div className={`group ${g.t} ${negated ? "not" : ""}`}>
      <div className="group-head">
        {negated && <b style={{ color: "var(--err)" }}>NOT</b>}
        <span>Match</span>
        <div className="seg">
          <button className={g.t === "and" ? "on" : ""} onClick={() => setType("and")} title="Every condition must be true">
            ALL
          </button>
          <button className={g.t === "or" ? "on" : ""} onClick={() => setType("or")} title="At least one condition must be true">
            ANY
          </button>
        </div>
        <span>of these{top && g.items.length === 0 ? " (no conditions = every item)" : ""}</span>
        <span className="grow" />
        <button className="btn sm" onClick={(e) => openPicker(path, (e.currentTarget as HTMLElement).getBoundingClientRect())}>
          <Icon name="plus" size={13} /> Condition
        </button>
        <button className="btn sm ghost" onClick={addGroup} title={`Add a nested ${g.t === "and" ? "ANY" : "ALL"} group`}>
          <Icon name="plus" size={13} /> Group
        </button>
      </div>
      {g.items.map((c, i) => (
        <div key={i} className="col" style={{ gap: 4 }}>
          {i > 0 && <div className="joiner">{g.t === "and" ? "AND" : "OR"}</div>}
          <ChildView n={c} path={[...path, i]} root={root} commit={commit} openPicker={openPicker} defs={defs} />
        </div>
      ))}
      {g.items.length === 0 && !top && <div className="small faint" style={{ padding: "4px 6px" }}>Empty group: add conditions or remove it.</div>}
    </div>
  );
}

function ChildView({ n, path, root, commit, openPicker, defs }: { n: Node; path: Path; root: Group; commit: (g: Group) => void; openPicker: (path: Path, rect: DOMRect) => void; defs: Definitions }) {
  const remove = () => commit(update(root, path, () => null));
  const toggleNot = () => commit(update(root, path, (x) => (x.t === "not" ? x.item : { t: "not", item: x })));
  const negated = n.t === "not";
  const inner = negated ? n.item : n;
  const controls = (
    <>
      <button className={`btn sm ${negated ? "on" : "ghost"}`} onClick={toggleNot} title="Negate: match items where this is NOT true">
        NOT
      </button>
      <button className="btn sm icon ghost danger" onClick={remove} title="Remove">
        <Icon name="x" size={14} />
      </button>
    </>
  );
  if (inner.t === "and" || inner.t === "or") {
    return (
      <div className="col" style={{ gap: 4 }}>
        <GroupView g={inner} path={path} root={root} commit={commit} openPicker={openPicker} defs={defs} negated={negated} />
        <div className="row" style={{ justifyContent: "flex-end" }}>
          {controls}
        </div>
      </div>
    );
  }
  if (inner.t === "not") {
    return (
      <div className="cond-row">
        <span className="what small muted">Double negation — simplify in the text editor.</span>
        {controls}
      </div>
    );
  }
  const setLeaf = (text: string) => commit(update(root, path, (x) => (x.t === "not" ? { t: "not", item: { t: "leaf", leaf: classify(text, defs) } } : { t: "leaf", leaf: classify(text, defs) })));
  const leaf = (inner as { t: "leaf"; leaf: Leaf }).leaf;
  return <LeafRow leaf={leaf} negated={negated} setLeaf={setLeaf} controls={controls} aliasValue={leaf.cls === "alias" ? defs.aliases.get(leaf.key)?.value : undefined} />;
}

const OPS: { op: Op; label: string }[] = [
  { op: ">", label: "more than" },
  { op: "<", label: "less than" },
  { op: "=", label: "exactly" },
  { op: "~", label: "between" },
];

function LeafRow({ leaf, negated, setLeaf, controls, aliasValue }: { leaf: Leaf; negated: boolean; setLeaf: (t: string) => void; controls: React.ReactNode; aliasValue?: string }) {
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState(leaf.text);
  const comparable = leaf.cls === "value" || leaf.cls === "param" || leaf.cls === "add" || ((leaf.cls === "formula" || leaf.cls === "inline") && !!leaf.op);
  const keyPart = leaf.cls === "inline" ? leaf.text.slice(0, leaf.text.search(/[<>=~][^)]*$/) >= 0 ? leaf.text.search(/[<>=~][^)]*$/) : leaf.text.length) : leaf.key;

  if (editing) {
    return (
      <div className="cond-row">
        <input
          className="input mono grow"
          autoFocus
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              setLeaf(raw.trim());
              setEditing(false);
            } else if (e.key === "Escape") setEditing(false);
          }}
          onBlur={() => {
            if (raw.trim() && raw.trim() !== leaf.text) setLeaf(raw.trim());
            setEditing(false);
          }}
        />
        {controls}
      </div>
    );
  }

  const title = leaf.cls === "item" && leaf.base ? leaf.base.n : leaf.kw?.label ?? leaf.key;
  return (
    <div className="cond-row" title={leaf.kw?.desc ?? leaf.issue ?? ""} style={leaf.issue && leaf.cls === "unknown" ? { borderColor: "var(--err)" } : undefined}>
      <span className={`tok ${leaf.cls}`} style={{ flex: "none" }}>
        {leaf.cls === "item" ? leaf.key : leaf.cls === "param" ? keyPart : leaf.cls === "flag" ? leaf.key : leaf.cls === "value" ? leaf.key : leaf.cls}
      </span>
      <div className="what ellipsis" onDoubleClick={() => { setRaw(leaf.text); setEditing(true); }}>
        {negated && <b style={{ color: "var(--err)" }}>not </b>}
        {comparable ? (leaf.cls === "param" || leaf.cls === "add" ? describeLeaf({ ...leaf, op: undefined }).replace(/ \(no comparison\)$/, "") : title) : describeLeaf(leaf)}
        {leaf.issue && <div className="small" style={{ color: leaf.cls === "unknown" ? "var(--err)" : "var(--warn)" }}>{leaf.issue}</div>}
        {aliasValue != null && <div className="small faint mono ellipsis" title={aliasValue}>= {aliasValue || "(empty)"}</div>}
      </div>
      {comparable && (
        <>
          <select className="select" style={{ height: 28, width: 100 }} value={leaf.op ?? ">"} onChange={(e) => setLeaf(leafText(keyPart, e.target.value as Op, leaf.v, leaf.v2 ?? leaf.v))}>
            {OPS.map((o) => (
              <option key={o.op} value={o.op}>
                {o.label}
              </option>
            ))}
          </select>
          <input className="input num" type="number" style={{ height: 28 }} value={leaf.v ?? 0} onChange={(e) => setLeaf(leafText(keyPart, leaf.op ?? ">", Number(e.target.value), leaf.v2))} />
          {leaf.op === "~" && (
            <>
              <span className="small muted">and</span>
              <input className="input num" type="number" style={{ height: 28 }} value={leaf.v2 ?? 0} onChange={(e) => setLeaf(leafText(keyPart, "~", leaf.v, Number(e.target.value)))} />
            </>
          )}
        </>
      )}
      <button className="btn sm icon ghost" title="Edit as text" onClick={() => { setRaw(leaf.text); setEditing(true); }}>
        <Icon name="source" size={13} />
      </button>
      {controls}
    </div>
  );
}
