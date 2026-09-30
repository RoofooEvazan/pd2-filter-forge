// "Show real names on unidentified items": one switch plus options, with live examples from this filter.
import { useState } from "react";
import { actions, getState, useStore } from "../state/store";
import { useAnalysis } from "../state/analysis";
import { runFilter } from "../lib/engine";
import { makeItem } from "../lib/item";
import { DEFAULT_UNID, readUnid, unidStats, writeUnid, type UnidOptions } from "../lib/unid";
import { D2Label } from "./D2Label";
import { Icon } from "./icons";

const EXAMPLES: { code: string; quality: "unique" | "set"; label: string }[] = [
  { code: "uap", quality: "unique", label: "Unique Shako" },
  { code: "rin", quality: "unique", label: "Unique ring" },
  { code: "lrg", quality: "set", label: "Set Large Shield" },
];

export function UnidPanel({ compact }: { compact?: boolean }) {
  const a = useAnalysis();
  const ctx = useStore((s) => s.ctx);
  const current = readUnid(a.lines);
  const on = !!current;
  const o = current ?? DEFAULT_UNID;
  const [open, setOpen] = useState(!compact);
  const save = (next: UnidOptions | null) => actions.setLines(writeUnid(getState().doc!.lines, next));
  const set = (patch: Partial<UnidOptions>) => save({ ...o, ...patch });
  const st = unidStats();
  const results = EXAMPLES.map((e) => ({ e, r: runFilter(a.compiled, makeItem(e.code, { quality: e.quality, identified: false }), { ...ctx, location: "GROUND" }) }));
  const ring = results[1].r;
  const listWiped = on && o.possibilities && o.uniques && !ring.display.desc.flat().some((x) => x.text.includes("Could be"));

  return (
    <div className={`unid-panel ${on ? "on" : ""}`}>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <button className={`switch ${on ? "on" : ""}`} onClick={() => save(on ? null : o)} />
        <div className="grow">
          <b>Show real names on unidentified items</b>
          <div className="small muted">
            A dropped Shako shows as “Harlequin Crest” before you identify it. Items that could be several uniques or set items keep their name, and the tooltip lists what they could be.
          </div>
        </div>
        {compact && (
          <button className="btn sm ghost" onClick={() => setOpen(!open)}>
            {open ? "Hide" : "Options"}
          </button>
        )}
      </div>
      {open && (
        <div className="col" style={{ gap: 10, marginTop: 10 }}>
          <div className="row wrap" style={{ gap: 16 }}>
            <label className="row small">
              <button className={`switch sm ${o.uniques ? "on" : ""}`} disabled={!on} onClick={() => set({ uniques: !o.uniques })} />
              Uniques ({st.uniques.single} named, {st.uniques.multi} with several)
            </label>
            <label className="row small">
              <button className={`switch sm ${o.sets ? "on" : ""}`} disabled={!on} onClick={() => set({ sets: !o.sets })} />
              Set items ({st.sets.single} named, {st.sets.multi} with several)
            </label>
            <label className="row small">
              <button className={`switch sm ${o.possibilities ? "on" : ""}`} disabled={!on} onClick={() => set({ possibilities: !o.possibilities })} />
              List the possibilities in the tooltip
            </label>
            <label className="row small">
              <button className={`switch sm ${o.withBase ? "on" : ""}`} disabled={!on} onClick={() => set({ withBase: !o.withBase })} />
              Keep the base type: “Harlequin Crest (Shako)”
            </label>
          </div>
          <div className="unid-examples">
            {results.map(({ e, r }) => (
              <div key={e.code} className="unid-example">
                <div className="unid-stage">
                  <D2Label r={r.display} showDesc hiddenText="hidden" />
                </div>
                <span className="small muted">{e.label}, unidentified</span>
              </div>
            ))}
          </div>
          {listWiped && (
            <div className="small warn-text">
              <Icon name="info" size={13} /> In this filter a later rule replaces the tooltip of unique rings (it has no {"{ }"} part), so the “Could be” list won't show on those. The names still work. Rules that end with {"{%NAME%}"} keep it.
            </div>
          )}
          <div className="small faint">Written as its own block at the top of your filter. These rules continue, so your own rules still color and mark these items.</div>
        </div>
      )}
    </div>
  );
}
