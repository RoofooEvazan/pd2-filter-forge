// Editor for a rule's output: name text with color/keyword insertion, description, and the
// notification effects (minimap icon, line, sound, tier, continue) as plain form controls.
import { useRef, useState } from "react";
import { COLORS, OUTPUTS, POE_SOUNDS } from "../lib/spec";
import { composeOutput, splitOutput, type IconKind, type OutputParts } from "../lib/output";
import { PALETTE, SOUND_BY_ID, DATA } from "../lib/data";
import type { Definitions } from "../lib/document";
import { paletteCss } from "../lib/explain";
import { actions } from "../state/store";
import { CodeField, type CodeFieldHandle } from "./CodeField";
import { Icon } from "./icons";

const ICON_LABEL: Record<IconKind, string> = { border: "Large", map: "Medium", dot: "Small", px: "Tiny", line: "Line" };
const VALUE_KEYS = ["NAME", "BASENAME", "ILVL", "ALVL", "SOCKETS", "DEF", "ED", "RES", "QTY", "PRICE", "RUNENAME", "RUNENUM", "LVLREQ", "CRAFTALVL", "CODE", "MAXSOCKETS", "GEMLEVEL", "GEMTYPE"];

export function OutputEditor({ id, value, defs, levels }: { id: string; value: string; defs: Definitions; levels: string[] }) {
  const parts = splitOutput(value);
  const set = (p: Partial<OutputParts>) => actions.updateLine(id, { value: composeOutput({ ...parts, ...p }) });
  const setFx = (fx: Partial<OutputParts["effects"]>) => set({ effects: { ...parts.effects, ...fx } });
  const nameRef = useRef<CodeFieldHandle>(null);
  const descRef = useRef<CodeFieldHandle>(null);
  const [focus, setFocus] = useState<"name" | "desc">("name");
  const target = () => (focus === "desc" && parts.desc != null ? descRef.current : nameRef.current);

  const hidden = parts.name.trim() === "";
  const iconKind = (["border", "map", "dot", "px"] as IconKind[]).find((k) => parts.effects[k]);
  const iconColor = iconKind ? parts.effects[iconKind] : undefined;

  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="row wrap" style={{ gap: 6 }}>
        <span className="small muted">Quick:</span>
        <button className={`btn sm ${parts.name === "%NAME%" ? "on" : ""}`} onClick={() => set({ name: "%NAME%" })}>
          Show normally
        </button>
        <button className={`btn sm ${hidden ? "on" : ""}`} onClick={() => set({ name: "", desc: null })} title="An empty output hides the item">
          <Icon name="eyeoff" size={13} /> Hide
        </button>
        <button className="btn sm" onClick={() => set({ name: `%ORANGE%*** %NAME% ***` })}>
          Highlight
        </button>
        <button className="btn sm" onClick={() => set({ name: `${parts.name || "%NAME%"} %GRAY%[%SOCKETS%]` })}>
          + sockets
        </button>
        <button className="btn sm" onClick={() => set({ name: `${parts.name || "%NAME%"} %GRAY%(L%ILVL%)` })}>
          + item level
        </button>
      </div>

      <div className="field">
        <div className="row">
          <span className="label grow">Name shown on the ground {hidden && <span className="badge warn">empty = hidden</span>}</span>
        </div>
        <CodeField ref={nameRef} mode="out" defs={defs} value={parts.name} onChange={(v) => set({ name: v })} placeholder="Empty hides the item. Type % for keywords." />
        <InsertBar onInsert={(t) => target()?.insert(t)} onFocusName={() => setFocus("name")} />
      </div>

      <div className="field">
        <div className="row">
          <span className="label grow">Description (tooltip text above the stats)</span>
          <button
            className={`switch ${parts.desc != null ? "on" : ""}`}
            onClick={() => {
              if (parts.desc != null) set({ desc: null });
              else {
                set({ desc: "%NAME%" });
                setFocus("desc");
              }
            }}
            title="Custom description"
          />
        </div>
        {parts.desc != null && (
          <div onFocus={() => setFocus("desc")} onClick={() => setFocus("desc")}>
            <CodeField ref={descRef} mode="out" defs={defs} value={parts.desc} onChange={(v) => set({ desc: v })} placeholder="%NAME% keeps the original description" />
          </div>
        )}
        {parts.desc != null && <div className="help">Inside the description, %NAME% means the item's normal description. %NL% starts a new line (lines stack upward).</div>}
      </div>

      <div className="divider" />
      <div className="section-title">Notification & minimap</div>
      <div className="row wrap">
        <div className="seg">
          <button className={!iconKind ? "on" : ""} onClick={() => setFx({ border: undefined, map: undefined, dot: undefined, px: undefined })}>
            No icon
          </button>
          {(["px", "dot", "map", "border"] as IconKind[]).map((k) => (
            <button
              key={k}
              className={iconKind === k ? "on" : ""}
              onClick={() => setFx({ border: undefined, map: undefined, dot: undefined, px: undefined, [k]: iconColor ?? "0A" })}
              title={`%${k.toUpperCase()}-xx%`}
            >
              {ICON_LABEL[k]}
            </button>
          ))}
        </div>
        {iconKind && <ColorPick value={iconColor!} onChange={(hex) => setFx({ [iconKind]: hex })} />}
      </div>
      <div className="row wrap">
        <label className="row small">
          <button className={`switch ${parts.effects.line ? "on" : ""}`} onClick={() => setFx({ line: parts.effects.line ? undefined : iconColor ?? "0A" })} />
          Draw a minimap line to it <span className="badge" title="Found in PD2's engine source; not on the wiki yet">new</span>
        </label>
        {parts.effects.line && <ColorPick value={parts.effects.line} onChange={(hex) => setFx({ line: hex })} />}
      </div>
      <div className="row wrap">
        <div className="field grow">
          <span className="label">Drop sound</span>
          <SoundPick value={parts.effects.sound} onChange={(sound) => setFx({ sound })} />
        </div>
        <div className="field" style={{ width: 200 }}>
          <span className="label">Text notification shows at</span>
          <select className="select" value={parts.effects.tier ?? ""} onChange={(e) => setFx({ tier: e.target.value === "" ? undefined : Number(e.target.value) })}>
            <option value="">every filter level</option>
            {Array.from({ length: 10 }, (_, i) => (
              <option key={i} value={i}>
                level {i}
                {i > 0 && levels[i - 1] ? ` (${levels[i - 1]})` : i === 0 ? " (Show All) only" : ""} and below
              </option>
            ))}
          </select>
        </div>
      </div>
      {!iconKind && parts.effects.sound == null && !parts.effects.line && parts.effects.tier != null && <div className="help">%TIER% only matters when the rule also has a map icon or sound.</div>}

      <div className="divider" />
      <label className="row">
        <button className={`switch ${parts.effects.cont ? "on" : ""}`} onClick={() => setFx({ cont: !parts.effects.cont })} />
        <div>
          <div>
            Continue to later rules <span className="mono small faint">%CONTINUE%</span>
          </div>
          <div className="help">Saves this output as the new %NAME% and keeps checking rules below — great for adding tags like [sockets] that other rules then color.</div>
        </div>
      </label>
    </div>
  );
}

function InsertBar({ onInsert, onFocusName }: { onInsert: (t: string) => void; onFocusName: () => void }) {
  const [more, setMore] = useState(false);
  return (
    <div className="col" style={{ gap: 6 }} onMouseDown={(e) => e.preventDefault()}>
      <div className="swatches">
        {COLORS.map((c) => (
          <button key={c.code} className="swatch" style={{ background: c.css }} title={`%${c.code}%: ${c.label}${c.custom ? " (needs HD text or Glide)" : ""}`} onClick={() => onInsert(`%${c.code}%`)} />
        ))}
        <span className="grow" />
        <button className="btn sm" onClick={() => setMore(!more)}>
          Insert value <Icon name="down" size={12} />
        </button>
      </div>
      {more && (
        <div className="row wrap" style={{ gap: 4 }}>
          {VALUE_KEYS.map((k) => (
            <button key={k} className="btn sm" title={OUTPUTS.find((o) => o.code === k)?.desc} onClick={() => { onFocusName(); onInsert(`%${k}%`); }}>
              %{k}%
            </button>
          ))}
          <button className="btn sm" title="New line" onClick={() => onInsert("%NL%")}>%NL%</button>
          <button className="btn sm" title="Clean space" onClick={() => onInsert("%CS%")}>%CS%</button>
          <button className="btn sm" title="Literal %" onClick={() => onInsert("%PERCENT%")}>%PERCENT%</button>
          <button className="btn sm" title="Inline formula: prints a calculated number" onClick={() => onInsert("$f(FRES+CRES+LRES+PRES)")}>$f(…)</button>
        </div>
      )}
    </div>
  );
}

const QUICK_HEX = ["55", "0B", "D3", "7D", "94", "9B", "6A", "1F", "C6", "CB", "84", "60"];

export function ColorPick({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  return (
    <div className="row" style={{ gap: 4 }}>
      {QUICK_HEX.map((h) => (
        <button key={h} className={`swatch ${value === h ? "on" : ""}`} style={{ background: PALETTE[parseInt(h, 16)] }} title={h} onClick={() => onChange(h)} />
      ))}
      <button
        className="btn sm"
        onClick={(e) => {
          setRect((e.currentTarget as HTMLElement).getBoundingClientRect());
          setOpen(true);
        }}
        title="All 256 minimap palette colors"
      >
        <span className="swatch" style={{ width: 14, height: 14, background: paletteCss(value) }} /> {value}
      </button>
      {open && rect && (
        <>
          <div className="scrim clear" onClick={() => setOpen(false)} />
          <div className="pop" style={{ left: Math.min(rect.left, window.innerWidth - 380), top: Math.min(rect.bottom + 6, window.innerHeight - 420), width: 360, padding: 10, gap: 8 }}>
            <div className="small muted">Minimap palette (Act 1). Hover for the hex code.</div>
            <div className="palette-grid">
              {PALETTE.map((c, i) => {
                const h = i.toString(16).toUpperCase().padStart(2, "0");
                return <button key={i} style={{ background: c }} className={h === value ? "on" : ""} title={h} onClick={() => { onChange(h); setOpen(false); }} />;
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SoundPick({ value, onChange }: { value?: number; onChange: (v: number | undefined) => void }) {
  const [custom, setCustom] = useState(false);
  const isPoe = value != null && POE_SOUNDS.includes(value);
  return (
    <div className="row">
      <select
        className="select grow"
        value={value == null ? "" : isPoe && !custom ? String(value) : "custom"}
        onChange={(e) => {
          if (e.target.value === "") onChange(undefined);
          else if (e.target.value === "custom") {
            setCustom(true);
            onChange(value ?? 4714);
          } else {
            setCustom(false);
            onChange(Number(e.target.value));
          }
        }}
      >
        <option value="">No sound</option>
        <optgroup label="PoE-style drop sounds">
          {POE_SOUNDS.map((s, i) => (
            <option key={s} value={s}>
              Drop sound {i + 1} ({s})
            </option>
          ))}
        </optgroup>
        <option value="custom">Other sound by number…</option>
      </select>
      {value != null && (!isPoe || custom) && (
        <>
          <input className="input num" type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} />
          <span className="small muted ellipsis" style={{ maxWidth: 140 }} title={SOUND_BY_ID.get(value)}>
            {SOUND_BY_ID.get(value) ?? "not a playable sound"}
          </span>
        </>
      )}
      <span className="small faint" title={`Test in-game by typing .playsound ${value ?? 4714}. ${DATA.sounds.length} sounds available.`}>
        <Icon name="info" size={14} />
      </span>
    </div>
  );
}

