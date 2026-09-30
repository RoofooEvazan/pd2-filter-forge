// "New rule" wizard: common goals as recipes, each producing a ready rule the user can refine.
import { useMemo, useState } from "react";
import { actions, getState } from "../state/store";
import { useAnalysis } from "../state/analysis";
import { makeRule } from "../lib/document";
import { searchItems, ITEM_BY_CODE } from "../lib/data";
import { COLORS, POE_SOUNDS } from "../lib/spec";
import { composeOutput, renderStandalone } from "../lib/output";
import { compileCondition } from "../lib/conditions";
import { sampleItem } from "../lib/sample";
import { D2Label, MapIcons } from "./D2Label";
import { ColorPick } from "./OutputEditor";
import { Icon } from "./icons";

type Recipe = "highlight" | "hide" | "tag" | "blank";

const HIDE_PRESETS: { label: string; cond: string }[] = [
  { label: "Low potions (minor/light healing & mana, antidote, stamina, thawing)", cond: "(hp1 OR hp2 OR mp1 OR mp2 OR yps OR vps OR wms)" },
  { label: "Town portal & identify scrolls", cond: "(tsc OR isc)" },
  { label: "Normal arrows & bolts", cond: "(aqv OR cqv) NMAG" },
  { label: "Small gold piles (under 1000)", cond: "GOLD<1000" },
  { label: "Chipped/flawed/normal gems", cond: "GEMLEVEL<4" },
  { label: "Low runes (El–Ort)", cond: "RUNE<10" },
  { label: "Inferior (low quality) gear", cond: "INF" },
  { label: "Plain non-elite gear without sockets", cond: "NMAG !ETH SOCKETS=0 (ARMOR OR WEAPON) !ELT" },
  { label: "Magic non-elite gear (except jewelry, charms, circlets)", cond: "MAG (ARMOR OR WEAPON) !ELT !CIRC !CLASS" },
  { label: "Keys", cond: "key" },
];

export function NewRuleDialog({ onClose }: { onClose: () => void }) {
  const a = useAnalysis();
  const [recipe, setRecipe] = useState<Recipe>("highlight");
  // highlight
  const [q, setQ] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [color, setColor] = useState("ORANGE");
  const [icon, setIcon] = useState<"" | "dot" | "map" | "border">("map");
  const [hex, setHex] = useState("0B");
  const [sound, setSound] = useState<number | "">("");
  const [stars, setStars] = useState(false);
  // hide
  const [preset, setPreset] = useState(0);
  const [fromLevel, setFromLevel] = useState(2);
  // tag
  const [tags, setTags] = useState({ sockets: true, ilvl: false, eth: true, rune: false });

  const levels = a.defs.levels.map((l) => l.name);
  const hits = useMemo(() => (q.trim().length >= 2 ? searchItems(q, 12).filter((h) => h.kind !== "runeword") : []), [q]);

  const rule = useMemo((): { key: string; value: string; note?: string } => {
    switch (recipe) {
      case "highlight": {
        const key = codes.length === 0 ? "" : codes.length === 1 ? codes[0] : `(${codes.join(" OR ")})`;
        const name = stars ? `%${color}%*** %NAME% %${color}%***` : `%${color}%%NAME%`;
        return { key, value: composeOutput({ name, desc: null, effects: { cont: false, ...(icon ? { [icon]: hex } : {}), ...(sound !== "" ? { sound } : {}) } }) };
      }
      case "hide": {
        const p = HIDE_PRESETS[preset];
        return { key: `${p.cond}${fromLevel > 0 ? ` FILTLVL>${fromLevel - 1}` : ""}`, value: "", note: ` hide: ${p.label}` };
      }
      case "tag": {
        let name = "%NAME%";
        if (tags.eth) name = `%GRAY%Eth %NAME%`;
        if (tags.sockets) name += " %GRAY%[%SOCKETS%]";
        if (tags.ilvl) name += " %GRAY%(L%ILVL%)";
        if (tags.rune) name += " %GRAY%#%RUNENUM%";
        const conds = [tags.eth ? "ETH" : "", tags.sockets ? "SOCKETS>0" : "", tags.rune ? "RUNE>0" : ""].filter(Boolean);
        const key = tags.rune && !tags.eth && !tags.sockets ? "RUNE>0" : conds.length > 1 ? `(${conds.join(" OR ")})` : conds[0] ?? "";
        return { key, value: `${name}%CONTINUE%`, note: " tag (continues)" };
      }
      default:
        return { key: "", value: "%NAME%" };
    }
  }, [recipe, codes, color, icon, hex, sound, stars, preset, fromLevel, tags]);

  const preview = useMemo(() => {
    const tree = compileCondition(rule.key, a.defs).tree;
    return renderStandalone(rule.value, { item: sampleItem(tree), ctx: getState().ctx, defs: a.defs });
  }, [rule, a.defs]);

  const create = () => {
    const l = makeRule(rule.key, rule.value, rule.note);
    actions.insertAfter(getState().selected, [l]);
    onClose();
  };

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="dialog" onKeyDown={(e) => e.key === "Escape" && onClose()}>
        <div className="dialog-head">
          <Icon name="wand" />
          <h2>New rule</h2>
          <button className="btn icon ghost" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="dialog-body">
          <div className="seg" style={{ alignSelf: "flex-start" }}>
            {(
              [
                ["highlight", "Highlight items"],
                ["hide", "Hide junk"],
                ["tag", "Tag with info"],
                ["blank", "Blank rule"],
              ] as [Recipe, string][]
            ).map(([r, label]) => (
              <button key={r} className={recipe === r ? "on" : ""} onClick={() => setRecipe(r)}>
                {label}
              </button>
            ))}
          </div>

          {recipe === "highlight" && (
            <>
              <div className="field">
                <label>Which items? Search by name</label>
                <input className="input" autoFocus placeholder="e.g. Ber, Shako, Grand Charm, Arcane Orb…" value={q} onChange={(e) => setQ(e.target.value)} />
                {hits.length > 0 && (
                  <div className="card" style={{ maxHeight: 180, overflow: "auto" }}>
                    {hits.map((h) => (
                      <div
                        key={h.kind + h.name}
                        className="list-row"
                        onClick={() => {
                          if (!codes.includes(h.code)) setCodes([...codes, h.code]);
                          setQ("");
                        }}
                      >
                        <span className="grow">{h.name}</span>
                        <span className="small muted">{h.detail}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="row wrap" style={{ gap: 6 }}>
                  {codes.map((c) => (
                    <span key={c} className="tok item">
                      {ITEM_BY_CODE.get(c)?.n ?? c}
                      <button className="btn sm icon ghost" style={{ height: 18, width: 18 }} onClick={() => setCodes(codes.filter((x) => x !== c))}>
                        <Icon name="x" size={11} />
                      </button>
                    </span>
                  ))}
                  {codes.length === 0 && <span className="small faint">No items picked: the rule will apply to every item until you add conditions.</span>}
                </div>
              </div>
              <div className="field">
                <label>Text color</label>
                <div className="swatches">
                  {COLORS.map((c) => (
                    <button key={c.code} className={`swatch ${color === c.code ? "on" : ""}`} style={{ background: c.css }} title={c.label} onClick={() => setColor(c.code)} />
                  ))}
                  <label className="row small" style={{ marginLeft: 12 }}>
                    <button className={`switch ${stars ? "on" : ""}`} onClick={() => setStars(!stars)} /> *** stars ***
                  </label>
                </div>
              </div>
              <div className="row wrap">
                <div className="field">
                  <label>Minimap icon</label>
                  <div className="seg">
                    {(["", "dot", "map", "border"] as const).map((k) => (
                      <button key={k} className={icon === k ? "on" : ""} onClick={() => setIcon(k)}>
                        {k === "" ? "None" : k === "dot" ? "Small" : k === "map" ? "Medium" : "Large"}
                      </button>
                    ))}
                  </div>
                </div>
                {icon && (
                  <div className="field">
                    <label>Icon color</label>
                    <ColorPick value={hex} onChange={setHex} />
                  </div>
                )}
                <div className="field">
                  <label>Sound</label>
                  <select className="select" value={sound} onChange={(e) => setSound(e.target.value === "" ? "" : Number(e.target.value))}>
                    <option value="">None</option>
                    {POE_SOUNDS.map((s, i) => (
                      <option key={s} value={s}>
                        Drop sound {i + 1}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}

          {recipe === "hide" && (
            <>
              <div className="field">
                <label>What to hide</label>
                <div className="card">
                  {HIDE_PRESETS.map((p, i) => (
                    <div key={i} className={`list-row ${preset === i ? "on" : ""}`} onClick={() => setPreset(i)}>
                      <span className="grow">{p.label}</span>
                      <span className="mono small faint">{p.cond}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="field">
                <label>Starting at filter level</label>
                <select className="select" value={fromLevel} onChange={(e) => setFromLevel(Number(e.target.value))} style={{ width: 320 }}>
                  <option value={0}>always (even on Show All Items)</option>
                  {Array.from({ length: Math.max(1, levels.length) }, (_, i) => (
                    <option key={i} value={i + 1}>
                      level {i + 1}
                      {levels[i] ? ` · ${levels[i]}` : ""} and stricter
                    </option>
                  ))}
                </select>
                <div className="help">Players pick the level in-game, so one filter can be relaxed early and strict at endgame.</div>
              </div>
            </>
          )}

          {recipe === "tag" && (
            <div className="col">
              <div className="help">Tag rules add info and then continue, so later rules still decide colors and icons. Put them near the top of the filter.</div>
              {(
                [
                  ["eth", "Prefix ethereal items with “Eth”"],
                  ["sockets", "Show socket count [n]"],
                  ["ilvl", "Show item level (Lnn)"],
                  ["rune", "Show rune number #n"],
                ] as [keyof typeof tags, string][]
              ).map(([k, label]) => (
                <label key={k} className="row">
                  <button className={`switch ${tags[k] ? "on" : ""}`} onClick={() => setTags({ ...tags, [k]: !tags[k] })} />
                  {label}
                </label>
              ))}
            </div>
          )}

          {recipe === "blank" && <div className="help">Creates ItemDisplay[]: %NAME% which you can then shape in the visual editor.</div>}

          <div className="block">
            <div className="block-head">
              <h3>Result</h3>
            </div>
            <div className="preview-stage">
              <D2Label r={preview} hiddenText="hidden on the ground" />
              <MapIcons fx={{ cont: false, ...(recipe === "highlight" && icon ? { [icon]: hex } : {}) }} />
            </div>
            <div className="code-hl">
              ItemDisplay[{rule.key}]: {rule.value}
              {rule.note ? ` //${rule.note}` : ""}
            </div>
          </div>
        </div>
        <div className="dialog-foot">
          <span className="small muted grow">Inserted after the selected line.</span>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={create}>
            <Icon name="plus" size={16} /> Add rule
          </button>
        </div>
      </div>
    </>
  );
}
