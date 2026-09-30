// Simple mode: pick a kind of item, see exactly how your filter shows it, and change it with
// swatches, pictures and sound buttons. No filter code anywhere.
import { useEffect, useMemo, useState } from "react";
import { actions, getState, useStore } from "../state/store";
import { useAnalysis, type Analysis } from "../state/analysis";
import { runFilter, type FilterResult } from "../lib/engine";
import { makeItem, type ViewContext } from "../lib/item";
import { makeDirective } from "../lib/document";
import { searchItems } from "../lib/data";
import { COLOR_CSS } from "../lib/spec";
import { paletteCss } from "../lib/explain";
import {
  CATALOG,
  ICON_COLORS,
  ICON_SIZES,
  TEXT_COLORS,
  applyChoice,
  changesLook,
  groupFor,
  itemGroup,
  readChoices,
  readMysteries,
  type Group,
  type SimpleStyle,
} from "../lib/simple";
import { D2Label, MapIcons } from "./D2Label";
import { Icon } from "./icons";
import { SoundGrid } from "./SoundGrid";
import { MysteryBanner, MysteryEditor, MysteryPresets } from "./Mystery";

const CHANGES = "changes";
/** Sidebar entries for mysteries are "mys:<id>"; "mys:new" is the preset picker. */
const MYS = "mys:";

function levelNames(a: Analysis) {
  return a.defs.levels.length ? a.defs.levels.map((l) => l.name) : ["Standard"];
}

function preview(a: Analysis, g: Group, ctx: ViewContext): FilterResult {
  const { code, ...patch } = g.sample;
  return runFilter(a.compiled, makeItem(code, patch), ctx);
}

export function SimpleView() {
  const a = useAnalysis();
  const ctx = useStore((s) => s.ctx);
  const cat = useStore((s) => s.simpleCat);
  const setCat = actions.setSimpleCat;
  const [sel, setSel] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const choices = useMemo(() => readChoices(a.lines), [a]);
  const mysteries = useMemo(() => readMysteries(a.lines), [a]);
  const mysId = cat.startsWith(MYS) ? cat.slice(MYS.length) : null;
  const mystery = mysteries.find((m) => m.id === mysId);
  useEffect(() => {
    if (mysId) actions.markSeen("mystery");
  }, [mysId]);
  const pick = (c: string) => {
    setCat(c);
    setQ("");
    setSel(null);
  };

  const groups: Group[] = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (query) {
      const out: Group[] = [];
      for (const c of CATALOG) for (const g of c.groups) if (g.label.toLowerCase().includes(query)) out.push(g);
      const seen = new Set(out.map((g) => g.id));
      if (query.length >= 2)
        for (const h of searchItems(query, 30)) {
          if (h.kind === "runeword") continue;
          const g = itemGroup(h.kind, h.code);
          if (!seen.has(g.id)) {
            seen.add(g.id);
            out.push(g);
          }
        }
      return out;
    }
    if (cat === CHANGES) return [...choices.keys()].map(groupFor).filter((g): g is Group => !!g);
    if (mysId) return [...choices.entries()].filter(([, s]) => s.mystery === mysId).map(([id]) => groupFor(id)).filter((g): g is Group => !!g);
    return CATALOG.find((c) => c.id === cat)?.groups ?? [];
  }, [q, cat, choices, mysId]);

  const selected = sel ? groupFor(sel) ?? groups.find((g) => g.id === sel) : undefined;
  const catInfo = CATALOG.find((c) => c.id === cat);

  return (
    <div className="simple">
      <LevelStrip />
      <div className="simple-body">
        <nav className="simple-cats">
          <div className="simple-search">
            <Icon name="search" size={16} />
            <input className="input grow" placeholder="Find any item…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {CATALOG.map((c) => {
            const n = c.groups.filter((g) => choices.has(g.id)).length;
            return (
              <button key={c.id} className={`simple-cat ${cat === c.id && !q ? "on" : ""}`} onClick={() => pick(c.id)}>
                <CatIcon a={a} g={c.groups[0]} ctx={ctx} />
                <span className="grow">{c.label}</span>
                {n > 0 && <span className="badge accent">{n}</span>}
              </button>
            );
          })}
          <div className="divider" />
          <button className={`simple-cat ${cat === CHANGES && !q ? "on" : ""}`} onClick={() => pick(CHANGES)}>
            <Icon name="check" size={16} />
            <span className="grow">My changes</span>
            <span className="badge">{choices.size}</span>
          </button>
          <div className="divider" />
          <div className="section-title" style={{ padding: "0 10px" }}>Mystery drops</div>
          {mysteries.map((m) => {
            const n = [...choices.values()].filter((s) => s.mystery === m.id).length;
            return (
              <button key={m.id} className={`simple-cat ${cat === MYS + m.id && !q ? "on" : ""}`} onClick={() => pick(MYS + m.id)} title="See every item hidden behind this banner">
                <span className="cat-dot" style={{ background: COLOR_CSS[m.words[0]?.color ?? "WHITE"] }} />
                <span className="grow ellipsis">{m.name}</span>
                <span className="badge">{n}</span>
              </button>
            );
          })}
          <button className={`simple-cat ${cat === MYS + "new" && !q ? "on" : ""}`} onClick={() => pick(MYS + "new")}>
            <Icon name="plus" size={16} />
            <span className="grow">New mystery…</span>
          </button>
        </nav>

        <section className="simple-grid-wrap">
          <div className="simple-head">
            <h2>{q ? `Results for “${q}”` : cat === CHANGES ? "My changes" : mystery ? mystery.name : mysId ? "New mystery drop" : catInfo?.label}</h2>
            <p>
              {q
                ? "Catalog groups and single items. Click one to change how it looks."
                : mystery
                  ? "On the ground these items all show as the banner below — you only see what it really is once you pick it up. Click an item to change it, or the banner to edit it."
                  : mysId
                    ? "Pick a starting point on the right. You can change every part of it afterwards."
                : cat === CHANGES
                  ? choices.size
                    ? "Everything you've customized. Click one to adjust or reset it."
                    : "Nothing customized yet. Pick a category on the left and click an item."
                  : `${catInfo?.blurb} This is exactly how your filter shows them right now. Click one to change it.`}
            </p>
          </div>
          {mysId && !mystery && !q && (
            <div className="mystery-howto">
              <div>
                <b>1</b>
                <span>
                  <strong>Pick a look</strong> on the right — Little Bastard, Lucky Bastard, Holy Moly… — or start from any of them.
                </span>
              </div>
              <div>
                <b>2</b>
                <span>
                  <strong>Make it yours:</strong> banner words and colors, decorations, minimap icon and drop sound.
                </span>
              </div>
              <div>
                <b>3</b>
                <span>
                  <strong>Choose the items</strong> it hides: open any item under <em>Items</em> and pick your mystery under “Mystery drop”.
                </span>
              </div>
              <div className="small muted">
                On the ground, those items show only your banner, icon and sound. You find out what dropped when you pick it up.
              </div>
            </div>
          )}
          {mystery && (
            <button className="mystery-hero" onClick={() => setSel(null)} title="Edit the banner">
              <MysteryBanner m={mystery} scale={1.25} />
            </button>
          )}
          <div className="simple-grid">
            {groups.map((g) => (
              <Tile key={g.id} a={a} g={g} ctx={ctx} on={sel === g.id} custom={choices.get(g.id)} mysteryName={mysteries.find((m) => m.id === choices.get(g.id)?.mystery)?.name} onClick={() => setSel(g.id)} />
            ))}
            {groups.length === 0 && !(mysId && !mystery) && <div className="empty">{mystery ? "No items use this mystery yet. Open any item and pick it under “Mystery drop”." : "Nothing here."}</div>}
          </div>
        </section>

        <aside className="simple-editor">
          {selected ? (
            <StyleEditor key={selected.id} g={selected} onOpenMystery={(id) => pick(MYS + id)} />
          ) : mystery ? (
            <MysteryEditor m={mystery} members={groups.length} onDeleted={() => pick(CHANGES)} />
          ) : mysId ? (
            <MysteryPresets onCreated={(id) => pick(MYS + id)} />
          ) : (
            <EditorEmpty />
          )}
        </aside>
      </div>
    </div>
  );
}

function CatIcon({ a, g, ctx }: { a: Analysis; g: Group; ctx: ViewContext }) {
  const r = preview(a, g, { ...ctx, filtlvl: 0 });
  const color = r.display.lines.flat()[0]?.color ?? "WHITE";
  return <span className="cat-dot" style={{ background: COLOR_CSS[color] ?? "#fff" }} />;
}

function Tile({ a, g, ctx, on, custom, mysteryName, onClick }: { a: Analysis; g: Group; ctx: ViewContext; on: boolean; custom?: SimpleStyle; mysteryName?: string; onClick: () => void }) {
  const r = preview(a, g, ctx);
  const fx = r.notify && !r.hidden ? r.notify.effects : null;
  return (
    <button className={`tile ${on ? "on" : ""} ${r.hidden ? "is-hidden" : ""}`} onClick={onClick} title={g.hint ?? g.label}>
      <div className="tile-stage">
        <D2Label r={r.display} hiddenText="hidden" />
      </div>
      <div className="tile-foot">
        <span className="ellipsis grow">{g.label}</span>
        {fx && <MapIcons fx={fx} />}
        {fx?.sound != null && <Icon name="sound" size={13} />}
        {mysteryName && <span className="badge" title={`Hidden behind “${mysteryName}” on the ground`}>?</span>}
        {custom && <span className="badge accent" title="You customized this">yours</span>}
      </div>
    </button>
  );
}

function EditorEmpty() {
  return (
    <div className="empty" style={{ padding: "60px 24px" }}>
      <Icon name="wand" size={30} />
      <h3>Click any item to change it</h3>
      <p className="muted">
        Pick a color, add a minimap icon and a drop sound, or hide it once you don't need it anymore. The preview shows exactly what the game will do.
      </p>
      <p className="small faint">Tip: the strip at the top switches between your filter's strictness levels.</p>
    </div>
  );
}

// ---------------------------------------------------------------- strictness strip

function LevelStrip() {
  const a = useAnalysis();
  const lvl = useStore((s) => s.ctx.filtlvl);
  const [edit, setEdit] = useState(false);
  const names = levelNames(a);
  return (
    <div className="level-strip">
      <span className="small muted nowrap">Preview at strictness</span>
      <div className="level-pills">
        <button className={lvl === 0 ? "on" : ""} onClick={() => actions.setCtx({ filtlvl: 0 })} title="Level 0 never hides anything">
          <b>0</b> Show everything
        </button>
        {names.map((n, i) => (
          <button key={i} className={lvl === i + 1 ? "on" : ""} onClick={() => actions.setCtx({ filtlvl: i + 1 })}>
            <b>{i + 1}</b> {n}
          </button>
        ))}
      </div>
      <button className="btn sm" onClick={() => setEdit(true)}>
        <Icon name="layers" size={14} /> Edit levels
      </button>
      {edit && <LevelsDialog onClose={() => setEdit(false)} />}
    </div>
  );
}

function LevelsDialog({ onClose }: { onClose: () => void }) {
  const a = useAnalysis();
  const lines = a.lines.filter((l) => l.kind === "level");
  const add = (name: string) => {
    const s = getState();
    const all = s.doc!.lines;
    const last = [...all].reverse().find((l) => l.kind === "level");
    const line = makeDirective("level", "", name);
    if (last) actions.insertAfter(last.id, [line], false);
    else actions.insertAt(Math.max(0, all.findIndex((l) => l.kind !== "comment" && l.kind !== "blank")), [line]);
  };
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="dialog" style={{ width: "min(560px, 92vw)" }}>
        <div className="dialog-head">
          <Icon name="layers" />
          <h2>Strictness levels</h2>
          <button className="btn icon ghost" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="dialog-body">
          <p className="muted" style={{ margin: 0 }}>
            Players pick one of these in-game (Options → PD2 Options → Filter Level). Higher numbers usually hide more. Level 0 always shows everything.
          </p>
          {lines.length === 0 && (
            <button
              className="btn primary"
              onClick={() => ["Relaxed", "Standard", "Strict", "Very strict"].forEach(add)}
              style={{ alignSelf: "flex-start" }}
            >
              <Icon name="plus" size={15} /> Add 4 levels (Relaxed → Very strict)
            </button>
          )}
          {lines.map((l, i) => (
            <div key={l.id} className="row">
              <span className="badge accent" style={{ width: 30, justifyContent: "center" }}>
                {i + 1}
              </span>
              <input className="input grow" value={l.value ?? ""} onChange={(e) => actions.updateLine(l.id, { value: e.target.value })} />
              {i === lines.length - 1 && (
                <button className="btn sm icon ghost danger" title="Remove the last level" onClick={() => actions.remove([l.id])}>
                  <Icon name="trash" size={14} />
                </button>
              )}
            </div>
          ))}
          {lines.length > 0 && lines.length < 12 && (
            <button className="btn" style={{ alignSelf: "flex-start" }} onClick={() => add(`Level ${lines.length + 1}`)}>
              <Icon name="plus" size={15} /> Add a stricter level
            </button>
          )}
        </div>
        <div className="dialog-foot">
          <button className="btn primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- style editor

function StyleEditor({ g, onOpenMystery }: { g: Group; onOpenMystery: (id: string) => void }) {
  const a = useAnalysis();
  const ctx = useStore((s) => s.ctx);
  const current = readChoices(a.lines).get(g.id) ?? {};
  const names = levelNames(a);
  const set = (patch: Partial<SimpleStyle>) => {
    const next: SimpleStyle = { ...current, ...patch };
    for (const k of Object.keys(next) as (keyof SimpleStyle)[]) if (next[k] === undefined) delete next[k];
    actions.setLines(applyChoice(getState().doc!.lines, g.id, next));
  };
  const reset = () => actions.setLines(applyChoice(getState().doc!.lines, g.id, null));
  const r = preview(a, g, ctx);
  const fx = r.notify && !r.hidden ? r.notify.effects : null;
  const hideMode = current.hide === "always" ? "always" : typeof current.hide === "number" ? "from" : "show";
  const custom = Object.keys(current).length > 0;
  const mysteries = readMysteries(a.lines);
  const myMystery = mysteries.find((m) => m.id === current.mystery);
  const pickedUp = myMystery ? preview(a, g, { ...ctx, location: "INVENTORY" }) : null;

  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="row">
        <div className="grow">
          <h3 style={{ margin: 0 }}>{g.label}</h3>
          {g.hint && <div className="small muted">{g.hint}</div>}
        </div>
        {custom && (
          <button className="btn sm" onClick={reset} title="Go back to how the filter shows it">
            <Icon name="undo" size={14} /> Reset
          </button>
        )}
      </div>

      <div className="big-stage">
        <D2Label r={r.display} hiddenText="hidden on the ground" showDesc />
        <div className="big-stage-map" title="Minimap">
          {fx ? <MapIcons fx={fx} size={1.6} /> : <span className="small faint">no icon</span>}
        </div>
      </div>
      {pickedUp && (
        <div className="row small" style={{ justifyContent: "center" }}>
          <span className="muted">Once picked up:</span>
          <D2Label r={pickedUp.display} hiddenText="hidden" />
        </div>
      )}
      <LevelVisibility a={a} g={g} names={names} />

      <Section title="Mystery drop">
        <div className="mystery-picks">
          <button className={`mystery-pick ${!current.mystery ? "on" : ""}`} onClick={() => set({ mystery: undefined })}>
            <Icon name="eye" size={16} />
            <span>Show what it is</span>
          </button>
          {mysteries.map((m) => (
            <button key={m.id} className={`mystery-pick ${current.mystery === m.id ? "on" : ""}`} onClick={() => set({ mystery: m.id })} title={`Hide it behind “${m.name}” while it's on the ground`}>
              <span className="mystery-stage small">
                <MysteryBanner m={m} scale={0.7} />
              </span>
              <span>{m.name}</span>
            </button>
          ))}
          <button className="mystery-pick" onClick={() => onOpenMystery("new")}>
            <Icon name="plus" size={16} />
            <span>New mystery…</span>
          </button>
        </div>
        {myMystery && (
          <div className="help">
            On the ground it shows as “{myMystery.name}” with its own icon and sound; you see the real item once you pick it up.{" "}
            <a href="#" onClick={(e) => { e.preventDefault(); onOpenMystery(myMystery.id); }}>
              Edit the banner
            </a>
          </div>
        )}
      </Section>

      <Section title="On the ground">
        <div className="choice-cards">
          <ChoiceCard on={hideMode === "show"} icon="eye" title="Show it" sub="At every level" onClick={() => set({ hide: undefined })} />
          <ChoiceCard on={hideMode === "from"} icon="layers" title="Hide later" sub="On stricter levels" onClick={() => set({ hide: Math.min(2, names.length) })} />
          <ChoiceCard on={hideMode === "always"} icon="eyeoff" title="Hide it" sub="Everywhere" onClick={() => set({ hide: "always", color: undefined, stars: undefined, rename: undefined, icon: undefined, sound: undefined })} />
        </div>
        {hideMode === "from" && (
          <div className="col" style={{ gap: 6 }}>
            <span className="small muted">Hide starting at level…</span>
            <div className="level-pills small-pills">
              {names.map((n, i) => (
                <button key={i} className={current.hide === i + 1 ? "on" : ""} onClick={() => set({ hide: i + 1 })}>
                  <b>{i + 1}</b> {n}
                </button>
              ))}
            </div>
          </div>
        )}
        {hideMode === "always" && <div className="help">Nothing else to set — it won't be drawn. Level 0 (Show everything) still shows it.</div>}
      </Section>

      {hideMode !== "always" && (
        <>
          <Section title="Text color">
            <div className="swatch-row">
              <button className={`swatch-big none ${!current.color ? "on" : ""}`} onClick={() => set({ color: undefined })} title="Keep the filter's color">
                <Icon name="x" size={14} />
              </button>
              {TEXT_COLORS.map((c) => (
                <button key={c.code} className={`swatch-big ${current.color === c.code ? "on" : ""}`} style={{ background: COLOR_CSS[c.code] }} title={c.label} onClick={() => set({ color: c.code })} />
              ))}
            </div>
            <label className="row">
              <button className={`switch ${current.stars ? "on" : ""}`} onClick={() => set({ stars: current.stars ? undefined : true })} />
              Make it stand out with <b>*** stars ***</b>
            </label>
            <RenameField value={current.rename ?? ""} onCommit={(v) => set({ rename: v.trim() || undefined })} />
            {changesLook(current) && <div className="help">Your text choices replace how the filter writes this item's name.</div>}
          </Section>

          <Section title="Drop alert">
            <div className="choice-cards">
              <ChoiceCard on={!current.icon} icon="x" title="No icon" sub="Filter's choice" onClick={() => set({ icon: undefined })} />
              {ICON_SIZES.map((s) => (
                <button key={s.size} className={`choice-card ${current.icon?.size === s.size ? "on" : ""}`} onClick={() => set({ icon: { size: s.size, hex: current.icon?.hex ?? "62" } })}>
                  <span className="icon-demo">
                    <span className={`mapicon ${s.size}`} style={{ color: paletteCss(current.icon?.hex ?? "62") }} />
                  </span>
                  <b>{s.label}</b>
                </button>
              ))}
            </div>
            {current.icon && (
              <div className="swatch-row">
                {ICON_COLORS.map((c) => (
                  <button key={c.hex} className={`swatch-big ${current.icon?.hex === c.hex ? "on" : ""}`} style={{ background: paletteCss(c.hex) }} title={c.label} onClick={() => set({ icon: { ...current.icon!, hex: c.hex } })} />
                ))}
              </div>
            )}
            <span className="small muted">Sound when it drops</span>
            <SoundGrid value={current.sound} onChange={(sound) => set({ sound })} />
            {(current.icon || current.sound != null) && names.length > 1 && (
              <label className="row small">
                Text alert shows on
                <select className="select" value={current.tier ?? ""} onChange={(e) => set({ tier: e.target.value === "" ? undefined : Number(e.target.value) })}>
                  <option value="">every level</option>
                  {names.slice(0, 9).map((n, i) => (
                    <option key={i} value={i + 1}>
                      level {i + 1} ({n}) and below
                    </option>
                  ))}
                </select>
              </label>
            )}
            {!changesLook(current) && (current.icon || current.sound != null) && <div className="help">The filter's own look is kept; only your alert is added.</div>}
          </Section>
        </>
      )}

      <details className="small muted">
        <summary style={{ cursor: "pointer" }}>What this changes in the filter file</summary>
        <div className="mono" style={{ marginTop: 6 }}>
          Items matching: {g.cond}
        </div>
        <div style={{ marginTop: 6 }}>Your choices are saved as rules in a "Simple mode choices" block at the top of the filter, which you can also see in Advanced mode.</div>
      </details>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="section-title">{title}</div>
      {children}
    </div>
  );
}

function ChoiceCard({ on, icon, title, sub, onClick }: { on: boolean; icon: string; title: string; sub: string; onClick: () => void }) {
  return (
    <button className={`choice-card ${on ? "on" : ""}`} onClick={onClick}>
      <Icon name={icon} size={20} />
      <b>{title}</b>
      <span className="small muted">{sub}</span>
    </button>
  );
}

function RenameField({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value);
  return (
    <div className="field">
      <span className="label">Custom name (optional)</span>
      <input
        className="input"
        placeholder="Keep the item's own name"
        value={v}
        maxLength={48}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => v !== value && onCommit(v)}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
    </div>
  );
}

function LevelVisibility({ a, g, names }: { a: Analysis; g: Group; names: string[] }) {
  const ctx = useStore((s) => s.ctx);
  const cells = [0, ...names.map((_, i) => i + 1)].map((lvl) => {
    const r = preview(a, g, { ...ctx, filtlvl: lvl });
    return { lvl, shown: !r.hidden, alert: !!r.notify && !r.notify.suppressedByTier && !r.hidden };
  });
  return (
    <div className="vis-row">
      {cells.map((c) => (
        <button
          key={c.lvl}
          className={`vis-cell ${c.shown ? "shown" : ""} ${ctx.filtlvl === c.lvl ? "on" : ""}`}
          onClick={() => actions.setCtx({ filtlvl: c.lvl })}
          title={`Level ${c.lvl}${c.lvl ? ` · ${names[c.lvl - 1]}` : " · Show everything"}: ${c.shown ? "shown" : "hidden"}${c.alert ? ", alerts" : ""}`}
        >
          <b>{c.lvl}</b>
          <Icon name={c.shown ? "eye" : "eyeoff"} size={14} />
          {c.alert && <Icon name="bell" size={12} />}
        </button>
      ))}
    </div>
  );
}
