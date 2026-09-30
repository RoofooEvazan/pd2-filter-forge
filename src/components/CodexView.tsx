// The Codex: the whole filter language and game data, searchable, cross-referenced with the open
// filter (how often each code is used, jump to uses) and insertable into the selected rule.
import { useEffect, useMemo, useState } from "react";
import engineReference from "../../docs/PD2-Filter-Engine-Reference.md?raw";
import { Markdown } from "./Markdown";
import { actions, getState, useStore } from "../state/store";
import { useAnalysis, type Analysis } from "../state/analysis";
import { CONDITIONS, COND_CATEGORIES, OUTPUTS, COLORS, FORMULA_FUNCTIONS, DIRECTIVES, POE_SOUNDS, CLASS_NAMES, TAB_NAMES } from "../lib/spec";
import { DATA, PALETTE, tierName } from "../lib/data";
import { Icon } from "./icons";

const TABS = ["Engine reference", "Guide", "Conditions", "Output", "Items", "Stats", "Skills", "Zones", "Colors", "Sounds", "Formulas"] as const;
type Tab = (typeof TABS)[number];

function usage(a: Analysis) {
  const m = new Map<string, { n: number; first: string }>();
  const bump = (k: string, id: string) => {
    const e = m.get(k);
    if (e) e.n++;
    else m.set(k, { n: 1, first: id });
  };
  for (const l of a.lines) {
    if (l.kind !== "rule" && l.kind !== "alias") continue;
    for (const t of (l.key ?? "").split(/[\s()!]+/)) {
      const k = t.split(/[<>=~]/)[0];
      if (!k) continue;
      bump(k, l.id);
      for (const part of k.split("+")) if (part !== k) bump(part, l.id);
      const pm = k.match(/^(STAT|SK|OS|CHSK|CLSK|TABSK|CHARSTAT|MULTI)\d/);
      if (pm) bump(pm[1], l.id);
    }
    for (const m2 of (l.value ?? "").matchAll(/%([A-Za-z_]+)(?:-[0-9A-Za-z]+)?%/g)) bump("%" + m2[1].toUpperCase(), l.id);
  }
  return m;
}

export function CodexView() {
  const a = useAnalysis();
  const hasDoc = useStore((s) => !!s.doc);
  const showUndoc = useStore((s) => s.settings.showUndocumented);
  const refAnchor = useStore((s) => s.refAnchor);
  const [tab, setTab] = useState<Tab>(refAnchor ? "Engine reference" : "Guide");
  useEffect(() => {
    if (refAnchor) setTab("Engine reference");
  }, [refAnchor]);
  const [q, setQ] = useState("");
  const uses = useMemo(() => usage(a), [a]);
  const sel = useStore((s) => (s.selected ? s.doc?.lines.find((l) => l.id === s.selected) : undefined));
  const canInsert = hasDoc && sel?.kind === "rule";

  const insertCond = (text: string) => {
    if (!sel) return;
    actions.updateLine(sel.id, { key: `${(sel.key ?? "").trim()} ${text}`.trim() });
    actions.toast(`Added ${text} to line ${(a.indexOf.get(sel.id) ?? 0) + 1}`);
  };
  const insertOut = (text: string) => {
    if (!sel) return;
    actions.updateLine(sel.id, { value: `${sel.value ?? ""}${text}` });
    actions.toast(`Added ${text} to line ${(a.indexOf.get(sel.id) ?? 0) + 1}`);
  };

  const Use = ({ k }: { k: string }) => {
    const u = uses.get(k);
    if (!hasDoc) return null;
    return u ? (
      <button className="btn sm ghost" title="Jump to the first rule that uses it" onClick={() => actions.goTo(u.first)}>
        {u.n}× <Icon name="right" size={12} />
      </button>
    ) : (
      <span className="small faint">unused</span>
    );
  };
  const Ins = ({ text, out }: { text: string; out?: boolean }) =>
    canInsert ? (
      <button className="btn sm" title={`Add to the selected rule's ${out ? "output" : "conditions"}`} onClick={() => (out ? insertOut(text) : insertCond(text))}>
        <Icon name="plus" size={12} />
      </button>
    ) : null;

  const qq = q.trim().toLowerCase();
  const m = (...s: (string | number | undefined)[]) => !qq || s.some((x) => String(x ?? "").toLowerCase().includes(qq));

  return (
    <div className="codex">
      <div className="pane">
        <div className="pane-head">
          <Icon name="codex" size={16} />
          <b>Codex</b>
        </div>
        <div className="pane-body">
          {TABS.map((t) => (
            <div key={t} className={`outline-item ${tab === t ? "on" : ""}`} onClick={() => setTab(t)}>
              <span className="title">{t}</span>
            </div>
          ))}
        </div>
        <div className="small faint" style={{ padding: 12 }}>
          {canInsert ? `+ buttons add to line ${(a.indexOf.get(sel!.id) ?? 0) + 1}.` : "Select a rule to insert codes into it."}
        </div>
      </div>
      <div className="page">
        {tab !== "Guide" && tab !== "Engine reference" && (
          <div className="row" style={{ marginBottom: 12 }}>
            <input className="input grow" autoFocus placeholder={`Search ${tab.toLowerCase()}…`} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        )}
        {tab === "Guide" && <Guide />}
        {tab === "Engine reference" && <Markdown source={engineReference} anchor={refAnchor} />}
        {tab === "Conditions" &&
          COND_CATEGORIES.map((cat) => {
            const rows = CONDITIONS.filter((k) => k.cat === cat && (showUndoc || !k.undocumented) && m(k.code, k.label, k.desc, ...(k.alt ?? [])));
            if (!rows.length) return null;
            return (
              <div key={cat} style={{ marginBottom: 18 }}>
                <h3>{cat}</h3>
                <table className="table">
                  <tbody>
                    {rows.map((k) => (
                      <tr key={k.code}>
                        <td style={{ width: 170 }}>
                          <span className={`tok ${k.kind === "logic" ? "op" : k.kind === "flag" ? "flag" : "value"}`}>{k.code}</span>
                          {k.alt?.map((x) => (
                            <div key={x} className="small faint mono">
                              {x}
                            </div>
                          ))}
                        </td>
                        <td>
                          <b>{k.label}</b> {k.undocumented && <span className="badge accent" title="Supported by PD2's engine, not yet on the wiki">engine-only</span>} {k.mutable && <span className="badge" title="Depends on the character or where the item is">viewer-dependent</span>}
                          <div className="muted small">{k.desc}</div>
                          {(k.example || k.range) && (
                            <div className="small faint mono">
                              {k.range && `range ${k.range}`} {k.example && `e.g. ${k.example}`}
                            </div>
                          )}
                        </td>
                        <td style={{ width: 80 }}>
                          <Use k={k.code} />
                        </td>
                        <td style={{ width: 44 }}>
                          <Ins text={k.kind === "value" ? `${k.code}>0` : k.kind === "param" ? k.example ?? k.code : k.code} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        {tab === "Output" &&
          ["Colors", "Item text", "Item values", "Notifications", "Flow", "Layout"].map((cat) => {
            const rows = OUTPUTS.filter((k) => k.cat === cat && (showUndoc || !k.undocumented) && m(k.code, k.label, k.desc));
            if (!rows.length) return null;
            return (
              <div key={cat} style={{ marginBottom: 18 }}>
                <h3>{cat}</h3>
                <table className="table">
                  <tbody>
                    {rows.map((k) => {
                      const text = k.example ?? `%${k.code}%`;
                      return (
                        <tr key={k.code}>
                          <td style={{ width: 200 }}>
                            <span className="tok value" style={k.kind === "color" ? { color: COLORS.find((c) => c.code === k.code)?.css } : undefined}>
                              {text}
                            </span>
                          </td>
                          <td>
                            <b>{k.label}</b> {k.undocumented && <span className="badge accent">engine-only</span>}
                            <div className="muted small">{k.desc}</div>
                          </td>
                          <td style={{ width: 80 }}>
                            <Use k={"%" + k.code} />
                          </td>
                          <td style={{ width: 44 }}>
                            <Ins text={text} out />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
        {tab === "Items" && (
          <table className="table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Type</th>
                <th>Req. level</th>
                <th>Uses</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {DATA.items
                .filter((i) => m(i.c, i.n, i.t))
                .slice(0, 400)
                .map((i) => (
                  <tr key={i.c}>
                    <td>
                      <span className="tok item">{i.c}</span>
                    </td>
                    <td>
                      {i.n}
                      <div className="small faint">{DATA.uniques.filter((u) => u.c === i.c).map((u) => u.n).concat(DATA.sets.filter((s) => s.c === i.c).map((s) => s.n)).join(", ")}</div>
                    </td>
                    <td className="small muted">
                      {[tierName(i.tier), i.cat, i.t].filter(Boolean).join(" · ")}
                      {i.ms ? ` · ${i.ms} sockets max` : ""}
                    </td>
                    <td className="small">{i.lr || ""}</td>
                    <td>
                      <Use k={i.c} />
                    </td>
                    <td>
                      <Ins text={i.c} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
        {tab === "Stats" && (
          <table className="table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Appears as</th>
                <th>Internal name</th>
                <th>Uses</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {DATA.stats
                .filter((s) => m(`stat${s.id}`, s.d, s.key))
                .map((s) => (
                  <tr key={s.id}>
                    <td>
                      <span className="tok value">STAT{s.id}</span>
                    </td>
                    <td>{s.d}</td>
                    <td className="mono small faint">{s.key}</td>
                    <td>
                      <Use k={`STAT${s.id}`} />
                    </td>
                    <td>
                      <Ins text={`STAT${s.id}>0`} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
        {tab === "Skills" && (
          <>
            <h3>Groups</h3>
            <table className="table" style={{ marginBottom: 18 }}>
              <tbody>
                {CLASS_NAMES.map((c, i) =>
                  m(c, `clsk${i}`) ? (
                    <tr key={c}>
                      <td style={{ width: 120 }}>
                        <span className="tok value">CLSK{i}</span>
                      </td>
                      <td>+{c} skills</td>
                      <td style={{ width: 80 }}>
                        <Use k={`CLSK${i}`} />
                      </td>
                      <td style={{ width: 44 }}>
                        <Ins text={`CLSK${i}>0`} />
                      </td>
                    </tr>
                  ) : null
                )}
                {Object.entries(TAB_NAMES).map(([id, n]) =>
                  m(n, `tabsk${id}`) ? (
                    <tr key={id}>
                      <td>
                        <span className="tok value">TABSK{id}</span>
                      </td>
                      <td>+{n} skills</td>
                      <td>
                        <Use k={`TABSK${id}`} />
                      </td>
                      <td>
                        <Ins text={`TABSK${id}>0`} />
                      </td>
                    </tr>
                  ) : null
                )}
              </tbody>
            </table>
            <h3>Single skills (SK = +skill, OS = oskill, CHSK = charges)</h3>
            <table className="table">
              <tbody>
                {DATA.skills
                  .filter((s) => m(s.n, s.cls, `sk${s.id}`))
                  .map((s) => (
                    <tr key={s.id}>
                      <td style={{ width: 120 }}>
                        <span className="tok value">SK{s.id}</span>
                      </td>
                      <td>
                        {s.n} {s.gray && <span className="badge" title="Not in the skill tree / rarely on items">rare</span>}
                      </td>
                      <td className="small muted">{s.cls}</td>
                      <td style={{ width: 80 }}>
                        <Use k={`SK${s.id}`} />
                      </td>
                      <td style={{ width: 44 }}>
                        <Ins text={`SK${s.id}>0`} />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </>
        )}
        {tab === "Zones" && (
          <table className="table">
            <tbody>
              {DATA.zones
                .filter((z) => m(z.n, z.id))
                .map((z) => (
                  <tr key={z.id}>
                    <td style={{ width: 120 }}>
                      <span className="tok value">MAPID={z.id}</span>
                    </td>
                    <td>{z.n}</td>
                    <td style={{ width: 44 }}>
                      <Ins text={`MAPID=${z.id}`} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
        {tab === "Colors" && <ColorsTab onPick={(h) => canInsert && insertOut(`%MAP-${h}%`)} />}
        {tab === "Sounds" && (
          <>
            <p className="muted">
              %SOUNDID-n% plays sound n from sounds.txt when the item drops. Test any of them in-game with <span className="mono">.playsound n</span>. PD2's PoE-style drop sounds are {POE_SOUNDS[0]}–{POE_SOUNDS[POE_SOUNDS.length - 1]}.
            </p>
            <table className="table">
              <tbody>
                {DATA.sounds
                  .filter(([id, n]) => (qq ? m(id, n) : POE_SOUNDS.includes(id) || id < 60))
                  .slice(0, 400)
                  .map(([id, n]) => (
                    <tr key={id}>
                      <td style={{ width: 160 }}>
                        <span className="tok value">%SOUNDID-{id}%</span>
                      </td>
                      <td className="mono small">{n}</td>
                      <td style={{ width: 44 }}>
                        <Ins text={`%SOUNDID-${id}%`} out />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </>
        )}
        {tab === "Formulas" && (
          <>
            <p className="muted">
              Define with <span className="mono">Formula[KEY]: expression</span> and use as <span className="mono">FORMULAKEY</span> in conditions or <span className="mono">%FORMULAKEY%</span> in output, or inline as{" "}
              <span className="mono">$f(expression)</span>. Operators: == != &gt; &lt; &gt;= &lt;= + - * / ^ !. Every condition code works as a variable (flags are 1 or 0).
            </p>
            <table className="table">
              <tbody>
                {FORMULA_FUNCTIONS.filter((f) => m(f.name, f.desc)).map((f) => (
                  <tr key={f.name}>
                    <td style={{ width: 140 }}>
                      <span className="tok formula">{f.name}()</span>
                    </td>
                    <td>
                      {f.desc}
                      <div className="mono small faint">{f.example}</div>
                    </td>
                    <td className="small muted" style={{ width: 90 }}>
                      {f.arity} arg{f.arity === "1" ? "" : "s"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}

function ColorsTab({ onPick }: { onPick: (hex: string) => void }) {
  return (
    <>
      <h3>Text colors</h3>
      <table className="table" style={{ marginBottom: 18 }}>
        <tbody>
          {COLORS.map((c) => (
            <tr key={c.code}>
              <td style={{ width: 150 }}>
                <span className="d2" style={{ color: c.css }}>
                  {c.label}
                </span>
              </td>
              <td className="mono">%{c.code}%</td>
              <td className="small muted">
                {c.use ?? ""}
                {c.custom ? "Needs Glide or HD text." : ""}
              </td>
              <td className="small">
                map color <span className="mono">{c.hex}</span> <span className="swatch" style={{ display: "inline-block", width: 12, height: 12, background: PALETTE[parseInt(c.hex, 16)], verticalAlign: "middle" }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>Minimap palette (for %BORDER-xx%, %MAP-xx%, %DOT-xx%, %PX-xx%, %LINE-xx%)</h3>
      <p className="muted small">Row = first hex digit, column = second. Click a color to add it as a medium icon to the selected rule.</p>
      <div className="palette-grid" style={{ maxWidth: 560 }}>
        {PALETTE.map((c, i) => {
          const h = i.toString(16).toUpperCase().padStart(2, "0");
          return <button key={i} style={{ background: c }} title={`${h}  ${c}`} onClick={() => onPick(h)} />;
        })}
      </div>
    </>
  );
}

function Guide() {
  const hasDoc = !!getState().doc;
  return (
    <div className="guide">
      <h2>How PD2 loot filters work</h2>
      <p>A filter is a text file of rules. Each rule says <i>which items</i> and <i>how they look</i>:</p>
      <p>
        <code>ItemDisplay[UNI ELT]: %GOLD%%NAME%%BORDER-D3%</code> — elite uniques in gold with a large gold minimap icon.
      </p>
      <h3>Top to bottom, first match wins</h3>
      <p>
        For each item, PD2 checks rules from the top. The first rule whose conditions match decides how it looks, and checking stops — unless that rule ends with <code>%CONTINUE%</code>, which saves its
        text as the new <code>%NAME%</code> and keeps going. That's how "tag" rules add [sockets] or "Eth" before a later rule picks the color.
      </p>
      <h3>Hiding</h3>
      <p>
        A rule with nothing after the colon hides the item: <code>ItemDisplay[hp1]:</code>. Filter level 0 ("Show All Items") never hides anything.
      </p>
      <h3>Conditions</h3>
      <ul>
        <li>
          Next to each other means AND: <code>MAG HELM</code>. Use <code>OR</code> for alternatives and <code>!</code> to negate: <code>!ETH</code>, <code>!(BAR OR DRU)</code>.
        </li>
        <li>
          <b>Watch out:</b> PD2 gives AND and OR the <i>same</i> priority and reads left to right. <code>UNI OR SET ETH</code> means <code>(UNI OR SET) AND ETH</code>. Always put OR groups in
          parentheses. Filter Forge warns you and can add them for you.
        </li>
        <li>
          Numbers compare with <code>&gt; &lt; =</code> or a range with <code>~</code>: <code>SOCKETS~1-2</code>. Add stats with +: <code>FRES+CRES+LRES+PRES&gt;79</code>.
        </li>
        <li>Unknown words are silently ignored by PD2 — and a typo can disable a whole rule. The Problems page catches these.</li>
      </ul>
      <h3>Output</h3>
      <ul>
        <li>
          Colors like <code>%RED%</code> change the text after them. <code>%NAME%</code> is the item's normal name. Text in <code>{"{braces}"}</code> becomes the tooltip description.
        </li>
        <li>
          <code>%BORDER-xx%</code>, <code>%MAP-xx%</code>, <code>%DOT-xx%</code>, <code>%PX-xx%</code> add a drop notification and minimap icon (xx = palette color). <code>%SOUNDID-n%</code> plays a sound.{" "}
          <code>%TIER-n%</code> (a single digit) limits the notification to filter level n and below.
        </li>
        <li>Names show at most 56 characters.</li>
      </ul>
      <h3>Filter levels, aliases, formulas</h3>
      <ul>
        {DIRECTIVES.map((d) => (
          <li key={d.code}>
            <b>{d.label}:</b> {d.desc}
          </li>
        ))}
      </ul>
      <h3>Installing</h3>
      <p>
        <b>Install to PD2</b> saves into <code>ProjectD2\filters\local</code>. In the launcher open <i>Item Filter Profiles</i>, choose <i>Local Filter</i> and your file, then press <b>Numpad 0</b> in-game to
        reload after changes. Filters picked from the launcher's online list are re-downloaded on every Play, so edit a copy (Filter Forge always does).
      </p>
      {!hasDoc && <p>Open or create a filter from Home to start editing.</p>}
    </div>
  );
}
