// Test Lab: build any item, set the character/zone/filter level, and see exactly which rules
// fire. Below it, a pile of typical loot rendered the way the filter would show it.
import { useMemo, useState } from "react";
import { actions, useStore } from "../state/store";
import { useAnalysis, useTestResult } from "../state/analysis";
import { runFilter, type FilterResult } from "../lib/engine";
import { referencedCodes } from "../lib/conditions";
import { DATA, ITEM_BY_CODE, STAT_BY_ID, searchItems, lookupCode } from "../lib/data";
import { CLASS_NAMES, DIFF_NAMES } from "../lib/spec";
import { LOCATIONS, QUALITIES, makeItem, qualityLabel, type TestItem } from "../lib/item";
import { paletteCss } from "../lib/explain";
import { cssColor } from "../lib/output";
import { D2Label, MapIcons, Runs } from "./D2Label";
import { LevelPicker } from "./LevelPicker";
import { Icon } from "./icons";

export function LabView() {
  return (
    <div className="lab">
      <div className="pane" style={{ overflow: "auto" }}>
        <ItemBuilder />
      </div>
      <div className="pane" style={{ overflow: "auto" }}>
        <div className="col" style={{ padding: 16, gap: 16 }}>
          <Result />
          <LootPile />
        </div>
      </div>
    </div>
  );
}

function ItemBuilder() {
  const it = useStore((s) => s.testItem);
  const ctx = useStore((s) => s.ctx);
  const [q, setQ] = useState("");
  const hits = useMemo(() => (q.trim().length >= 2 ? searchItems(q, 14) : []), [q]);
  const base = lookupCode(it.code);
  const set = actions.setTestItem;
  const [statQ, setStatQ] = useState("");
  const statHits = useMemo(() => (statQ.trim().length >= 2 ? DATA.stats.filter((s) => `${s.d} ${s.key} stat${s.id}`.toLowerCase().includes(statQ.toLowerCase())).slice(0, 12) : []), [statQ]);

  return (
    <div className="col" style={{ padding: 16, gap: 14 }}>
      <div className="row">
        <Icon name="lab" />
        <b className="grow">Test item</b>
        <button className="btn sm" title="Random item from the loot pile" onClick={() => actions.replaceTestItem(LOOT[Math.floor(Math.random() * LOOT.length)].item)}>
          <Icon name="dice" size={14} /> Random
        </button>
      </div>
      <div className="field">
        <label>Base, unique, set or runeword</label>
        <input className="input" placeholder={`${base?.n ?? it.code} — type to change`} value={q} onChange={(e) => setQ(e.target.value)} />
        {hits.length > 0 && (
          <div className="card" style={{ maxHeight: 240, overflow: "auto" }}>
            {hits.map((h) => (
              <div
                key={h.kind + h.name + h.code}
                className="list-row"
                onClick={() => {
                  if (h.kind === "runeword") {
                    const rw = DATA.runewords.find((r) => r.n === h.name)!;
                    const bases = DATA.items.filter((b) => b.cat !== "misc" && rw.types.some((t) => b.tc.includes(t)) && b.tier === "e" && (b.ms ?? 0) >= rw.runes.length);
                    actions.replaceTestItem(makeItem(bases[0]?.c ?? "7cr", { runeword: true, title: h.name, sockets: rw.runes.length, gemmed: true }));
                  } else {
                    const b = ITEM_BY_CODE.get(h.code);
                    actions.replaceTestItem(
                      makeItem(h.code, {
                        quality: h.kind === "unique" ? "unique" : h.kind === "set" ? "set" : "normal",
                        title: h.kind === "base" ? undefined : h.name,
                        qty: b?.stk ? 1 : 0,
                        gold: h.code === "gld" ? 1000 : 0,
                      })
                    );
                  }
                  setQ("");
                }}
              >
                <span className="grow">{h.name}</span>
                <span className="small muted">{h.detail}</span>
              </div>
            ))}
          </div>
        )}
        <div className="small muted">
          {base ? `${base.n} · ${base.c} · ${base.cat}${base.tier ? ` · ${{ n: "normal", x: "exceptional", e: "elite" }[base.tier]}` : ""} · ${base.w}×${base.h}` : `Unknown code ${it.code}`}
        </div>
      </div>
      <div className="row wrap">
        <div className="field">
          <label>Quality</label>
          <select className="select" value={it.quality} onChange={(e) => set({ quality: e.target.value as TestItem["quality"] })}>
            {QUALITIES.map((q) => (
              <option key={q} value={q}>
                {qualityLabel(q)}
              </option>
            ))}
          </select>
        </div>
        <div className="field grow">
          <label>Name (uniques, sets, rares, runewords)</label>
          <input className="input" value={it.title ?? ""} onChange={(e) => set({ title: e.target.value || undefined })} />
        </div>
      </div>
      <div className="row wrap" style={{ gap: 14 }}>
        {(
          [
            ["identified", "Identified"],
            ["ethereal", "Ethereal"],
            ["runeword", "Runeword"],
            ["gemmed", "Socketed with something"],
          ] as [keyof TestItem, string][]
        ).map(([k, label]) => (
          <label key={k} className="row small">
            <button className={`switch ${it[k] ? "on" : ""}`} onClick={() => set({ [k]: !it[k] } as Partial<TestItem>)} />
            {label}
          </label>
        ))}
      </div>
      <div className="row wrap">
        <Num label="Sockets" v={it.sockets} on={(v) => set({ sockets: v })} max={6} />
        <Num label="Item level" v={it.ilvl} on={(v) => set({ ilvl: v })} max={99} />
        {base?.stk ? <Num label="Quantity" v={it.qty} on={(v) => set({ qty: v })} max={500} /> : null}
        {it.code === "gld" && <Num label="Gold" v={it.gold} on={(v) => set({ gold: v })} max={999999} />}
        <Num label="Sell price" v={it.price} on={(v) => set({ price: v })} max={35000} />
      </div>

      <div className="field">
        <label>Stats on the item</label>
        {Object.entries(it.stats).map(([id, v]) => (
          <div key={id} className="statrow">
            <span className="small ellipsis" title={`STAT${id}`}>
              {STAT_BY_ID.get(Number(id))?.d ?? `STAT${id}`}
            </span>
            <input className="input num" type="number" value={v} onChange={(e) => set({ stats: { ...it.stats, [id]: Number(e.target.value) } })} />
            <button
              className="btn sm icon ghost"
              onClick={() => {
                const s = { ...it.stats };
                delete s[Number(id)];
                set({ stats: s });
              }}
            >
              <Icon name="x" size={13} />
            </button>
          </div>
        ))}
        <input className="input" placeholder="Add a stat: life, resist, faster cast, magic find…" value={statQ} onChange={(e) => setStatQ(e.target.value)} />
        {statHits.length > 0 && (
          <div className="card" style={{ maxHeight: 200, overflow: "auto" }}>
            {statHits.map((s) => (
              <div
                key={s.id}
                className="list-row"
                onClick={() => {
                  set({ stats: { ...it.stats, [s.id]: 10 } });
                  setStatQ("");
                }}
              >
                <span className="grow small">{s.d}</span>
                <span className="mono small faint">STAT{s.id}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="field">
        <label>Skills (MULTI layers, e.g. 107,54 = +Teleport, 83,1 = +Sorceress skills)</label>
        {Object.entries(it.multi).map(([k, v]) => (
          <div key={k} className="statrow">
            <span className="mono small">MULTI{k}</span>
            <input className="input num" type="number" value={v} onChange={(e) => set({ multi: { ...it.multi, [k]: Number(e.target.value) } })} />
            <button
              className="btn sm icon ghost"
              onClick={() => {
                const m = { ...it.multi };
                delete m[k];
                set({ multi: m });
              }}
            >
              <Icon name="x" size={13} />
            </button>
          </div>
        ))}
        <SkillAdder onAdd={(k) => set({ multi: { ...it.multi, [k]: 1 } })} />
      </div>
      <div className="row wrap">
        <div className="field grow">
          <label>Prefix ids</label>
          <input className="input mono" value={it.prefixes.join(",")} onChange={(e) => set({ prefixes: e.target.value.split(/[ ,]+/).filter(Boolean).map(Number) })} />
        </div>
        <div className="field grow">
          <label>Suffix ids</label>
          <input className="input mono" value={it.suffixes.join(",")} onChange={(e) => set({ suffixes: e.target.value.split(/[ ,]+/).filter(Boolean).map(Number) })} />
        </div>
      </div>

      <div className="divider" />
      <div className="row">
        <Icon name="settings" size={16} />
        <b>Character & place</b>
      </div>
      <div className="row wrap">
        <div className="field">
          <label>Class</label>
          <select className="select" value={ctx.cls} onChange={(e) => actions.setCtx({ cls: Number(e.target.value) })}>
            {CLASS_NAMES.map((c, i) => (
              <option key={c} value={i}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <Num label="Char level" v={ctx.clvl} on={(v) => actions.setCtx({ clvl: v })} max={99} />
        <div className="field">
          <label>Difficulty</label>
          <select className="select" value={ctx.diff} onChange={(e) => actions.setCtx({ diff: Number(e.target.value) })}>
            {DIFF_NAMES.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="row wrap">
        <div className="field">
          <label>Where the item is</label>
          <select className="select" value={ctx.location} onChange={(e) => actions.setCtx({ location: e.target.value as typeof ctx.location })}>
            {LOCATIONS.map((l) => (
              <option key={l} value={l}>
                {l[0] + l.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </div>
        <div className="field grow">
          <label>Zone (MAPID)</label>
          <select className="select" value={ctx.mapid} onChange={(e) => actions.setCtx({ mapid: Number(e.target.value) })}>
            {DATA.zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.id} · {z.n}
              </option>
            ))}
          </select>
        </div>
      </div>
      <LevelPicker />
    </div>
  );
}

function SkillAdder({ onAdd }: { onAdd: (key: string) => void }) {
  const [q, setQ] = useState("");
  const hits = q.trim().length >= 2 ? DATA.skills.filter((s) => s.n.toLowerCase().includes(q.toLowerCase())).slice(0, 10) : [];
  return (
    <>
      <input className="input" placeholder="Add a skill: teleport, fire ball, battle orders…" value={q} onChange={(e) => setQ(e.target.value)} />
      {hits.length > 0 && (
        <div className="card">
          {hits.map((s) => (
            <div key={s.id} className="list-row small">
              <span className="grow">
                {s.n} <span className="faint">({s.cls})</span>
              </span>
              <button className="btn sm" onClick={() => { onAdd(`107,${s.id}`); setQ(""); }}>+skill</button>
              <button className="btn sm" onClick={() => { onAdd(`97,${s.id}`); setQ(""); }}>oskill</button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function Num({ label, v, on, max }: { label: string; v: number; on: (v: number) => void; max: number }) {
  return (
    <div className="field">
      <label>{label}</label>
      <input className="input num" type="number" min={0} max={max} value={v} onChange={(e) => on(Math.max(0, Math.min(max, Number(e.target.value) || 0)))} />
    </div>
  );
}

function Result() {
  const a = useAnalysis();
  const r = useTestResult();
  const it = useStore((s) => s.testItem);
  const missed = useMemo(() => {
    if (!r) return [];
    const code = it.code.slice(0, 4);
    const out: number[] = [];
    a.compiled.rules.forEach((cr) => {
      if (r.matched.includes(cr.index)) return;
      const l = a.lines[cr.index];
      if (referencedCodes(l.key ?? "", a.defs).includes(code)) out.push(cr.index);
    });
    return out.slice(0, 12);
  }, [a, r, it]);
  if (!r) return null;
  const n = r.notify;
  return (
    <div className="block">
      <div className="block-head">
        <h3>How your filter shows this item</h3>
        {r.hidden ? <span className="badge warn">hidden</span> : <span className="badge ok">shown</span>}
        {n ? <span className="badge accent">notifies</span> : r.tierSkipped.length > 0 ? <span className="badge">silenced by TIER</span> : null}
      </div>
      <div className="preview-stage" style={{ minHeight: 140 }}>
        {!r.hidden && r.display.desc.length > 0 && (
          <div className="d2-tooltip">
            <Runs lines={r.display.desc} />
          </div>
        )}
        <D2Label r={r.display} hiddenText="hidden — not drawn on the ground" />
        {n && (
          <div className="row" style={{ gap: 10 }}>
            <MapIcons fx={n.effects} size={1.4} />
            {n.effects.sound != null && (
              <span className="small" style={{ color: "#ccc" }}>
                <Icon name="sound" size={14} /> {n.effects.sound}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="small muted">
        Name length {r.display.displayLength}/56{r.display.displayLength > 56 && <b style={{ color: "var(--err)" }}> — too long, PD2 cuts it off</b>}
      </div>
      <div className="section-title">Rules that matched, in order</div>
      <div className="trace">
        {r.matched.length === 0 && <div className="small muted">No rule matched, so the item keeps its normal look.</div>}
        {r.matched.map((i) => (
          <TraceStep key={i} index={i} label={i === r.final ? "decides" : "continues"} />
        ))}
        {n && !r.matched.includes(n.index) && <TraceStep index={n.index} label="notification" />}
      </div>
      {missed.length > 0 && (
        <>
          <div className="section-title">Rules that mention this item but didn't match</div>
          <div className="trace">
            {missed.map((i) => (
              <TraceStep key={i} index={i} label="no match" dim />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function TraceStep({ index, label, dim }: { index: number; label: string; dim?: boolean }) {
  const a = useAnalysis();
  const l = a.lines[index];
  return (
    <div className="trace-step" style={dim ? { opacity: 0.7 } : undefined} onClick={() => actions.goTo(l.id)} title="Open this rule">
      <span className="lineno">{index + 1}</span>
      <span className={`badge ${label === "decides" ? "ok" : label === "notification" ? "accent" : ""}`}>{label}</span>
      <span className="mono small ellipsis grow">{l.raw.trim()}</span>
      <Icon name="right" size={14} />
    </div>
  );
}

// ---------------------------------------------------------------- loot pile

const L = (code: string, patch: Partial<TestItem> = {}) => ({ item: makeItem(code, patch) });
const LOOT: { item: TestItem }[] = [
  L("r33"), L("r30"), L("r26"), L("r20"), L("r15"), L("r10"), L("r05"), L("r01"),
  L("gpw"), L("glr"), L("gcv"), L("skz"),
  L("cm3", { quality: "magic", title: "Shimmering Grand Charm" }), L("cm1", { quality: "magic", title: "Serpent's Small Charm of Vita" }), L("jew", { quality: "rare", title: "Doom Eye" }),
  L("uap", { quality: "unique", identified: false }), L("rin", { quality: "unique", identified: false }), L("amu", { quality: "rare", identified: false }), L("rin", { quality: "magic", identified: false }),
  L("uar", { quality: "set", identified: false }), L("xtb", { quality: "magic", identified: false }), L("ci3", { quality: "magic", identified: false }), L("uhb", { quality: "rare", identified: false }),
  L("7cr", { sockets: 5, ethereal: true }), L("7gd", { quality: "superior", sockets: 4 }), L("uit", { sockets: 4 }), L("xap"), L("cap"), L("lbt", { quality: "inferior" }), L("6l7", { quality: "magic", identified: false }),
  L("imma", { qty: 1 }), L("upma", { qty: 1 }), L("scou", { qty: 1 }), L("wss", { qty: 1 }), L("pk1"), L("toa"), L("ivea"), L("jewf", { qty: 5 }),
  L("t11", { qty: 1 }), L("t33", { qty: 1 }),
  L("hp5"), L("hp2"), L("mp3"), L("rvl"), L("rvs"), L("yps"), L("tsc"), L("isc"), L("key", { qty: 6 }), L("aqv", { qty: 250 }),
  L("gld", { gold: 180 }), L("gld", { gold: 2400 }), L("gld", { gold: 9500 }),
];

function layout(n: number) {
  // Deterministic scatter in a loose grid so labels rarely overlap.
  // Leave room for the notification list on the left and the minimap on the right.
  const cols = 4;
  return Array.from({ length: n }, (_, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const jx = ((i * 37) % 11) - 5;
    const jy = ((i * 53) % 9) - 4;
    return { x: 30 + (c + 0.5) * (46 / cols) + jx * 0.5, y: 6 + r * 30 + jy };
  });
}

export function LootPile({ onPick, big }: { onPick?: (it: TestItem) => void; big?: boolean }) {
  const a = useAnalysis();
  const ctx = useStore((s) => s.ctx);
  const [showHidden, setShowHidden] = useState(true);
  const results = useMemo(() => LOOT.map((l) => ({ item: l.item, r: runFilter(a.compiled, l.item, ctx) })), [a.compiled, ctx]);
  const pos = layout(LOOT.length);
  const shown = results.filter((x) => !x.r.hidden).length;
  const notes = results.filter((x) => x.r.notify && !x.r.notify.suppressedByTier && !x.r.hidden);
  const height = 20 + Math.ceil(LOOT.length / 4) * 30 + 50;
  return (
    <div className="block">
      <div className="block-head">
        <h3>Loot pile preview</h3>
        <span className="small muted">
          {shown}/{LOOT.length} shown · {notes.length} notify
        </span>
        <label className="row small">
          <button className={`switch ${showHidden ? "on" : ""}`} onClick={() => setShowHidden(!showHidden)} /> ghost hidden items
        </label>
        <LevelPicker compact />
      </div>
      <div className="ground" style={{ height }}>
        {results.map(({ item, r }, i) =>
          r.hidden && !showHidden ? null : (
            <div
              key={i}
              className={`loot ${r.hidden ? "gone" : ""}`}
              style={{ left: `${pos[i].x}%`, top: pos[i].y + 40 }}
              onClick={() => (onPick ? onPick(item) : actions.replaceTestItem(item))}
              title={`${lookupCode(item.code)?.n ?? item.code} — click to inspect`}
            >
              <D2Label r={r.display} hiddenText={lookupCode(item.code)?.n ?? item.code} />
            </div>
          )
        )}
        <div className="notif-list">
          {notes.slice(0, 10).map(({ r }, i) => (
            <NotifLine key={i} r={r} />
          ))}
        </div>
        <div className="minimap" title="Minimap icons">
          {results.map(({ r }, i) =>
            r.notify && !r.hidden ? (
              <span key={i} style={{ position: "absolute", left: `${pos[i].x}%`, top: `${(pos[i].y / height) * 100 + 8}%` }}>
                <MapIcons fx={r.notify.effects} />
              </span>
            ) : null
          )}
        </div>
      </div>
      {!big && <div className="help">Click any label to load it into the Test Lab. The notification list (top left) and minimap (top right) mimic PD2's drop alerts.</div>}
    </div>
  );
}

function NotifLine({ r }: { r: FilterResult }) {
  const top = r.display.lines[r.display.lines.length - 1] ?? [];
  const fx = r.notify!.effects;
  const hex = fx.border ?? fx.map ?? fx.dot ?? fx.px;
  return (
    <div className="row" style={{ gap: 6 }}>
      <span style={{ width: 8, height: 8, background: paletteCss(hex), display: "inline-block" }} />
      {top.map((run, i) => (
        <span key={i} style={{ color: cssColor(run.color) }}>
          {run.text}
        </span>
      ))}
    </div>
  );
}
