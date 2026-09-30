// Mystery drops: your own "Little/Big/Lucky Bastard" banners that hide what dropped until you pick it up.
import { useEffect, useState } from "react";
import { actions, getState } from "../state/store";
import { renderStandalone } from "../lib/output";
import { collectDefinitions } from "../lib/document";
import { DEFAULT_CTX, makeItem } from "../lib/item";
import { COLOR_CSS, NAME_DISPLAY_LIMIT } from "../lib/spec";
import { paletteCss } from "../lib/explain";
import {
  DECORATIONS,
  ICON_COLORS,
  ICON_SIZES,
  MYSTERY_PRESETS,
  TEXT_COLORS,
  deleteMystery,
  mysteryOutput,
  mysteryText,
  newMysteryId,
  readMysteries,
  saveMystery,
  type Mystery,
} from "../lib/simple";
import { D2Label, MapIcons } from "./D2Label";
import { Icon } from "./icons";
import { SoundGrid } from "./SoundGrid";

const DEFS = collectDefinitions([]);

export function MysteryBanner({ m, scale }: { m: Mystery; scale?: number }) {
  const r = renderStandalone(mysteryOutput(m), { item: makeItem("r30"), ctx: DEFAULT_CTX, defs: DEFS });
  return (
    <span style={scale ? { zoom: scale, display: "inline-block" } : undefined}>
      <D2Label r={r} />
    </span>
  );
}

/** Pick a starting point for a new mystery. */
export function MysteryPresets({ onCreated }: { onCreated: (id: string) => void }) {
  const create = (p: (typeof MYSTERY_PRESETS)[number]) => {
    const lines = getState().doc!.lines;
    const { blurb: _b, ...rest } = p;
    const m: Mystery = { ...rest, id: newMysteryId(readMysteries(lines)) };
    actions.setLines(saveMystery(lines, m));
    onCreated(m.id);
  };
  return (
    <div className="col" style={{ gap: 14 }}>
      <div>
        <h3 style={{ margin: 0 }}>New mystery drop</h3>
        <p className="small muted" style={{ margin: "4px 0 0" }}>
          A mystery hides what dropped behind a banner of your own, with its own minimap icon and sound. You only find out what it is when you pick it up. Start from one of these and make it yours.
        </p>
      </div>
      {MYSTERY_PRESETS.map((p) => (
        <button key={p.name} className="mystery-preset" onClick={() => create(p)}>
          <span className="mystery-stage">
            <MysteryBanner m={{ ...p, id: "x" }} scale={0.85} />
          </span>
          <b>{p.name}</b>
          <span className="small muted">{p.blurb}</span>
        </button>
      ))}
    </div>
  );
}

export function MysteryEditor({ m, members, onDeleted }: { m: Mystery; members: number; onDeleted: () => void }) {
  const save = (patch: Partial<Mystery>) => actions.setLines(saveMystery(getState().doc!.lines, { ...m, ...patch }));
  const setWord = (i: number, patch: Partial<Mystery["words"][number]>) => save({ words: m.words.map((w, j) => (j === i ? { ...w, ...patch } : w)) });
  const len = mysteryText(m).length;
  const r = renderStandalone(mysteryOutput(m), { item: makeItem("r30"), ctx: DEFAULT_CTX, defs: DEFS });
  const fx = { cont: false, ...(m.icon ? { [m.icon.size]: m.icon.hex } : {}) };
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="row">
        <TextCommit className="input grow mystery-name" value={m.name} placeholder="Mystery name" onCommit={(name) => name.trim() && save({ name: name.trim() })} />
        <button
          className="btn sm icon ghost danger"
          title="Delete this mystery"
          onClick={() => {
            if (!members || confirm(`Delete “${m.name}”? Its ${members} item${members === 1 ? "" : "s"} will show normally again.`)) {
              actions.setLines(deleteMystery(getState().doc!.lines, m.id));
              onDeleted();
            }
          }}
        >
          <Icon name="trash" size={15} />
        </button>
      </div>

      <div className="big-stage">
        <D2Label r={r} />
        <div className="big-stage-map" title="Minimap">
          {m.icon ? <MapIcons fx={fx} size={1.6} /> : <span className="small faint">no icon</span>}
        </div>
      </div>
      <div className={`small ${len > NAME_DISPLAY_LIMIT ? "warn-text" : "faint"}`}>
        {len} of {NAME_DISPLAY_LIMIT} characters{len > NAME_DISPLAY_LIMIT ? " — PD2 cuts off the rest. Use fewer decorations or a shorter text." : ""}
      </div>

      <Section title="Banner text">
        {m.words.map((w, i) => (
          <div key={i} className="col" style={{ gap: 6 }}>
            <div className="row">
              <TextCommit className="input grow" value={w.text} maxLength={20} placeholder={i === 0 ? "Little" : "Bastard"} onCommit={(text) => setWord(i, { text })} />
              {m.words.length > 1 && (
                <button className="btn sm icon ghost" title="Remove this word" onClick={() => save({ words: m.words.filter((_, j) => j !== i) })}>
                  <Icon name="x" size={14} />
                </button>
              )}
            </div>
            <Swatches value={w.color} onPick={(color) => setWord(i, { color })} />
          </div>
        ))}
        {m.words.length < 3 && (
          <button className="btn sm" style={{ alignSelf: "flex-start" }} onClick={() => save({ words: [...m.words, { text: "Bastard", color: "RED" }] })}>
            <Icon name="plus" size={13} /> Another word in a different color
          </button>
        )}
        <label className="row small">
          <button className={`switch ${m.spaced ? "on" : ""}`} onClick={() => save({ spaced: !m.spaced })} />
          Spread the letters out: <b>L i t t l e</b>
        </label>
      </Section>

      <Section title="Decoration on both sides">
        <div className="chip-row">
          <button className={`chip ${!m.deco || !m.decoCount ? "on" : ""}`} onClick={() => save({ decoCount: 0 })}>
            None
          </button>
          {DECORATIONS.map((d) => (
            <button key={d} className={`chip mono ${m.deco === d && m.decoCount ? "on" : ""}`} onClick={() => save({ deco: d, decoCount: m.decoCount || 6 })}>
              {d}
            </button>
          ))}
        </div>
        {m.decoCount > 0 && (
          <>
            <label className="row small">
              <span style={{ width: 70 }}>How many</span>
              <input type="range" min={1} max={16} value={m.decoCount} onChange={(e) => save({ decoCount: Number(e.target.value) })} className="grow" />
              <b style={{ width: 24 }}>{m.decoCount}</b>
            </label>
            <label className="row small">
              <span style={{ width: 70 }}>Spacing</span>
              <input type="range" min={0} max={6} value={m.gap} onChange={(e) => save({ gap: Number(e.target.value) })} className="grow" />
              <b style={{ width: 24 }}>{m.gap}</b>
            </label>
            <Swatches value={m.decoColor} onPick={(decoColor) => save({ decoColor })} />
          </>
        )}
      </Section>

      <Section title="Drop alert">
        <div className="choice-cards">
          <button className={`choice-card ${!m.icon ? "on" : ""}`} onClick={() => save({ icon: undefined })}>
            <Icon name="x" size={20} />
            <b>No icon</b>
          </button>
          {ICON_SIZES.map((s) => (
            <button key={s.size} className={`choice-card ${m.icon?.size === s.size ? "on" : ""}`} onClick={() => save({ icon: { size: s.size, hex: m.icon?.hex ?? "62" } })}>
              <span className="icon-demo">
                <span className={`mapicon ${s.size}`} style={{ color: paletteCss(m.icon?.hex ?? "62") }} />
              </span>
              <b>{s.label}</b>
            </button>
          ))}
        </div>
        {m.icon && (
          <div className="swatch-row">
            {ICON_COLORS.map((c) => (
              <button key={c.hex} className={`swatch-big ${m.icon?.hex === c.hex ? "on" : ""}`} style={{ background: paletteCss(c.hex) }} title={c.label} onClick={() => save({ icon: { ...m.icon!, hex: c.hex } })} />
            ))}
          </div>
        )}
        <span className="small muted">Sound when it drops</span>
        <SoundGrid value={m.sound} onChange={(sound) => save({ sound })} />
      </Section>

      <Section title="When does the mystery end?">
        <label className="row small">
          <button className={`switch on`} disabled />
          When you pick it up (always)
        </label>
        <label className="row small">
          <button className={`switch ${m.revealInTown ? "on" : ""}`} onClick={() => save({ revealInTown: !m.revealInTown })} />
          When it's dropped in a town
        </label>
        <label className="row small">
          <button className={`switch ${m.untilId ? "on" : ""}`} onClick={() => save({ untilId: !m.untilId })} />
          When uniques, sets and rares are already identified
        </label>
      </Section>

      <div className="help">
        {members
          ? `${members} item${members === 1 ? " uses" : "s use"} this mystery. Open any item and pick “${m.name}” under Mystery drop to add more.`
          : `No items use it yet. Open any item (runes, uniques, currency…) and pick “${m.name}” under Mystery drop.`}
      </div>
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

function Swatches({ value, onPick }: { value: string; onPick: (c: string) => void }) {
  return (
    <div className="swatch-row">
      {TEXT_COLORS.map((c) => (
        <button key={c.code} className={`swatch-big ${value === c.code ? "on" : ""}`} style={{ background: COLOR_CSS[c.code] }} title={c.label} onClick={() => onPick(c.code)} />
      ))}
    </div>
  );
}

function TextCommit({ value, onCommit, ...rest }: { value: string; onCommit: (v: string) => void; className?: string; placeholder?: string; maxLength?: number }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <input
      {...rest}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onCommit(v)}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}
