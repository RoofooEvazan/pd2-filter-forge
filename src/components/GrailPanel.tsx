// Holy grail (Season 14): tag uniques and sets you haven't found yet, hide the ones you have, and
// keep showing what the filter shows specifically. Live examples use this filter.
import { useMemo, useState } from "react";
import { actions, getState, useStore } from "../state/store";
import { useAnalysis } from "../state/analysis";
import { runFilter } from "../lib/engine";
import { makeItem, type GrailState } from "../lib/item";
import { ITEM_BY_CODE, searchItems } from "../lib/data";
import { COLOR_CSS } from "../lib/spec";
import { paletteCss } from "../lib/explain";
import { ICON_COLORS, ICON_SIZES, TEXT_COLORS } from "../lib/simple";
import { DEFAULT_GRAIL, GRAIL_BASES, grailStats, readGrail, specificKeeps, writeGrail, writtenKeeps, type GrailOptions } from "../lib/grail";
import { D2Label } from "./D2Label";
import { Icon } from "./icons";
import { SoundGrid } from "./SoundGrid";

const EXAMPLES: { code: string; quality: "unique" | "set"; discovered: GrailState; label: string }[] = [
  { code: "uap", quality: "unique", discovered: "none", label: "Unique Shako, not found yet" },
  { code: "rin", quality: "unique", discovered: "some", label: "Unique ring, some found" },
  { code: "rin", quality: "unique", discovered: "all", label: "Unique ring, every one found" },
  { code: "uap", quality: "unique", discovered: "all", label: "Unique Shako, found" },
];

/** "Shako — Harlequin Crest" / "Ring — 9 uniques". */
function keepLabel(k: string) {
  const [q, code] = k.split(".") as ["uni" | "set", string];
  const names = GRAIL_BASES[q].get(code) ?? [];
  const base = ITEM_BY_CODE.get(code)?.n ?? code;
  const what = names.length === 1 ? names[0] : `${names.length} ${q === "uni" ? "uniques" : "set items"}`;
  return { base, what, title: names.join(", ") };
}

/** Example drops as this filter shows them, found and not found. */
export function GrailExamples({ big }: { big?: boolean }) {
  const a = useAnalysis();
  const ctx = useStore((s) => s.ctx);
  const list = big
    ? [...EXAMPLES, { code: "lrg", quality: "set" as const, discovered: "none" as GrailState, label: "Set Large Shield, not found yet" }, { code: "lrg", quality: "set" as const, discovered: "all" as GrailState, label: "Set Large Shield, found" }]
    : EXAMPLES;
  return (
    <div className={`unid-examples ${big ? "big" : ""}`}>
      {list.map((e, i) => {
        const r = runFilter(a.compiled, makeItem(e.code, { quality: e.quality, identified: false, discovered: e.discovered }), { ...ctx, location: "GROUND" });
        return (
          <div key={i} className="unid-example">
            <div className="unid-stage">
              <D2Label r={r.display} hiddenText="hidden" />
            </div>
            <span className="small muted">{e.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export function GrailPanel({ compact, examples = true }: { compact?: boolean; examples?: boolean }) {
  const a = useAnalysis();
  const current = readGrail(a.lines);
  const on = !!current;
  const o = current ?? DEFAULT_GRAIL;
  const [open, setOpen] = useState(!compact);
  const [find, setFind] = useState("");
  const save = (next: GrailOptions | null) => actions.setLines(writeGrail(getState().doc!.lines, next));
  const set = (patch: Partial<GrailOptions>) => save({ ...o, ...patch });
  const names = a.defs.levels.length ? a.defs.levels.map((l) => l.name) : ["Standard"];
  const st = grailStats();

  const auto = useMemo(() => (on && o.hide !== "off" ? specificKeeps(a.lines) : []), [a.lines, on, o.hide]);
  const written = useMemo(() => writtenKeeps(a.lines), [a.lines]);
  const want = useMemo(() => [...new Set([...auto.filter((k) => !o.hideAnyway.includes(k)), ...o.keepExtra])].sort(), [auto, o.hideAnyway, o.keepExtra]);
  const stale = on && o.hide !== "off" && want.join() !== written.join();
  const hits = find.trim().length >= 2 ? searchItems(find.trim(), 12).filter((h) => h.kind === "unique" || h.kind === "set") : [];

  const hideMode = o.hide === "off" ? "off" : o.hide === "always" ? "always" : "from";

  return (
    <div className={`unid-panel grail-panel ${on ? "on" : ""}`}>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <button className={`switch ${on ? "on" : ""}`} onClick={() => save(on ? null : o)} />
        <div className="grow">
          <b>Holy grail</b> <span className="badge">Season 14</span>
          <div className="small muted">
            Uniques and set items you haven't found yet get a tag. Ones you've already found are hidden, unless your filter shows them specifically. Covers {st.uniqueItems} uniques and {st.setItems} set items; an unidentified item counts as new if any unique or set it could be is still missing.
          </div>
        </div>
        {compact && (
          <button className="btn sm ghost" onClick={() => setOpen(!open)}>
            {open ? "Hide" : "Options"}
          </button>
        )}
      </div>
      {open && (
        <div className="col" style={{ gap: 12, marginTop: 10 }}>
          {stale && (
            <div className="row grail-stale">
              <Icon name="info" size={15} />
              <span className="grow small">Your filter changed, so the list of items that stay shown is out of date.</span>
              <button className="btn sm primary" onClick={() => save(o)}>
                Update
              </button>
            </div>
          )}
          <div className="row wrap" style={{ gap: 16 }}>
            <label className="row small">
              <button className={`switch sm ${o.uniques ? "on" : ""}`} disabled={!on} onClick={() => set({ uniques: !o.uniques })} />
              Uniques
            </label>
            <label className="row small">
              <button className={`switch sm ${o.sets ? "on" : ""}`} disabled={!on} onClick={() => set({ sets: !o.sets })} />
              Set items
            </label>
          </div>

          <div className="grail-section">
            <label className="row">
              <button className={`switch sm ${o.mark ? "on" : ""}`} disabled={!on} onClick={() => set({ mark: !o.mark })} />
              <b className="small">Tag items you haven't found yet</b>
            </label>
            {o.mark && (
              <div className="col" style={{ gap: 8, marginLeft: 38 }}>
                <div className="row wrap" style={{ gap: 8 }}>
                  <TagField value={o.markText} disabled={!on} onCommit={(markText) => set({ markText })} />
                  <div className="swatch-row">
                    {TEXT_COLORS.map((c) => (
                      <button key={c.code} disabled={!on} className={`swatch-big ${o.markColor === c.code ? "on" : ""}`} style={{ background: COLOR_CSS[c.code] }} title={c.label} onClick={() => set({ markColor: c.code })} />
                    ))}
                  </div>
                </div>
                <label className="row small">
                  Unidentified items:
                  <select className="select" disabled={!on} value={o.unid} onChange={(e) => set({ unid: e.target.value as GrailOptions["unid"] })}>
                    <option value="any">tag them while any possibility is still missing</option>
                    <option value="none">tag them only when none of the possibilities is found</option>
                  </select>
                </label>
                <details className="small">
                  <summary style={{ cursor: "pointer" }}>Drop alert for new finds{o.icon || o.sound != null ? " (on)" : ""}</summary>
                  <div className="col" style={{ gap: 8, marginTop: 8 }}>
                    <div className="row wrap" style={{ gap: 6 }}>
                      <button className={`btn sm ${!o.icon ? "primary" : ""}`} disabled={!on} onClick={() => set({ icon: undefined })}>
                        No icon
                      </button>
                      {ICON_SIZES.map((s) => (
                        <button key={s.size} disabled={!on} className={`btn sm ${o.icon?.size === s.size ? "primary" : ""}`} onClick={() => set({ icon: { size: s.size, hex: o.icon?.hex ?? "9B" } })}>
                          <span className={`mapicon ${s.size}`} style={{ color: paletteCss(o.icon?.hex ?? "9B") }} /> {s.label}
                        </button>
                      ))}
                    </div>
                    {o.icon && (
                      <div className="swatch-row">
                        {ICON_COLORS.map((c) => (
                          <button key={c.hex} className={`swatch-big ${o.icon?.hex === c.hex ? "on" : ""}`} style={{ background: paletteCss(c.hex) }} title={c.label} onClick={() => set({ icon: { ...o.icon!, hex: c.hex } })} />
                        ))}
                      </div>
                    )}
                    <span className="small muted">Sound when it drops</span>
                    <SoundGrid value={o.sound} onChange={(sound) => on && set({ sound })} />
                    <div className="help">For possible new finds this replaces the filter's own icon and sound: PD2 only uses the first alert that matches.</div>
                  </div>
                </details>
              </div>
            )}
          </div>

          <div className="grail-section">
            <b className="small">Items you've already found</b>
            <div className="row wrap" style={{ gap: 6 }}>
              <button className={`btn sm ${hideMode === "off" ? "primary" : ""}`} disabled={!on} onClick={() => set({ hide: "off" })}>
                Keep showing them
              </button>
              <button className={`btn sm ${hideMode === "always" ? "primary" : ""}`} disabled={!on} onClick={() => set({ hide: "always" })}>
                Hide them
              </button>
              {names.length > 1 && (
                <button className={`btn sm ${hideMode === "from" ? "primary" : ""}`} disabled={!on} onClick={() => set({ hide: Math.min(2, names.length) })}>
                  Hide on stricter levels
                </button>
              )}
            </div>
            {hideMode === "from" && (
              <div className="level-pills small-pills">
                {names.map((n, i) => (
                  <button key={i} className={o.hide === i + 1 ? "on" : ""} onClick={() => set({ hide: i + 1 })}>
                    <b>{i + 1}</b> {n}
                  </button>
                ))}
              </div>
            )}
            {o.hide !== "off" && (
              <div className="col" style={{ gap: 6 }}>
                <span className="small muted">
                  Still shown after they're found ({want.length}). Your filter shows these specifically (a rule names them, or you chose them in Simple mode). Remove any you don't need, or add more.
                </span>
                <div className="grail-chips">
                  {want.map((k) => {
                    const { base, what, title } = keepLabel(k);
                    const isAuto = auto.includes(k);
                    return (
                      <span key={k} className="grail-chip" title={title}>
                        <b>{base}</b> {what}
                        {isAuto && <span className="faint"> · your filter</span>}
                        <button
                          className="btn sm ghost icon"
                          disabled={!on}
                          title={isAuto ? "Hide it once found anyway" : "Remove"}
                          onClick={() => set(isAuto ? { hideAnyway: [...o.hideAnyway, k], keepExtra: o.keepExtra.filter((x) => x !== k) } : { keepExtra: o.keepExtra.filter((x) => x !== k) })}
                        >
                          <Icon name="x" size={12} />
                        </button>
                      </span>
                    );
                  })}
                  {o.hideAnyway.filter((k) => auto.includes(k)).map((k) => {
                    const { base, what } = keepLabel(k);
                    return (
                      <span key={k} className="grail-chip off" title="Your filter shows it specifically, but you chose to hide it once found">
                        <s>
                          <b>{base}</b> {what}
                        </s>
                        <button className="btn sm ghost" disabled={!on} onClick={() => set({ hideAnyway: o.hideAnyway.filter((x) => x !== k) })}>
                          Keep
                        </button>
                      </span>
                    );
                  })}
                  {!want.length && !o.hideAnyway.length && <span className="small faint">None yet.</span>}
                </div>
                <div className="grail-find">
                  <input className="input" disabled={!on} placeholder="Keep showing another unique or set item…" value={find} onChange={(e) => setFind(e.target.value)} />
                  {hits.length > 0 && (
                    <div className="grail-hits">
                      {hits.map((h) => {
                        const k = `${h.kind === "unique" ? "uni" : "set"}.${h.code}`;
                        return (
                          <button
                            key={`${k}-${h.name}`}
                            className="btn sm ghost"
                            disabled={want.includes(k)}
                            onClick={() => {
                              set({ keepExtra: [...new Set([...o.keepExtra, k])], hideAnyway: o.hideAnyway.filter((x) => x !== k) });
                              setFind("");
                            }}
                          >
                            {h.name} <span className="faint">({ITEM_BY_CODE.get(h.code)?.n})</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="help">Kept by base item: keeping Harlequin Crest keeps every unique Shako.</div>
              </div>
            )}
          </div>

          {examples && <GrailExamples />}
          <div className="small faint">
            Needs Season 14 (the Compendium). Written as its own block near the top of your filter. On older game versions PD2 skips these rules, so nothing is tagged or hidden there. Try other items in the Test Lab with “Found before”.
          </div>
        </div>
      )}
    </div>
  );
}

function TagField({ value, disabled, onCommit }: { value: string; disabled: boolean; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value);
  return (
    <label className="field">
      <span className="label">Tag after the name</span>
      <input
        className="input"
        value={v}
        disabled={disabled}
        maxLength={20}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => v !== value && onCommit(v)}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
    </label>
  );
}
