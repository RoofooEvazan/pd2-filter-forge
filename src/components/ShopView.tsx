// Shop hunting: pick what you're hunting for in vendor windows, give it a look that jumps out,
// and see it in a mock vendor tab exactly as the filter will label it.
import { useMemo, useState } from "react";
import { actions, getState, useStore } from "../state/store";
import { useAnalysis } from "../state/analysis";
import { compileDoc, runFilter, type FilterResult } from "../lib/engine";
import { DEFAULT_CTX, type ViewContext } from "../lib/item";
import { COLOR_CSS, CLASS_NAMES, TAB_NAMES } from "../lib/spec";
import { DATA, ITEM_BY_CODE } from "../lib/data";
import {
  SHOP_COLORS,
  SHOP_ITEMS,
  SHOP_QUALITIES,
  SHOP_STATS,
  SHOP_STYLES,
  blankTarget,
  classTabs,
  needLabel,
  readShop,
  sampleForTarget,
  shopTemplates,
  targetIdOf,
  vendorStock,
  writeShop,
  modLines,
  type ShopLook,
  type ShopNeed,
  type ShopTarget,
  type StockItem,
} from "../lib/shop";
import { D2Label } from "./D2Label";
import { Icon } from "./icons";

const SHOP_CTX = (ctx: ViewContext): ViewContext => ({ ...ctx, location: "SHOP", filtlvl: ctx.filtlvl });

/** How a target looks on its own sample item, independent of the rest of the filter. */
function isolatedPreview(t: ShopTarget, cls: number): { r: FilterResult; stock: StockItem } {
  const lines = writeShop([], [{ ...t, on: true }], { dimOthers: false });
  const c = compileDoc({ lines, eol: "\n" });
  const item = sampleForTarget(t, cls);
  return { r: runFilter(c, item, { ...DEFAULT_CTX, cls, location: "SHOP" }), stock: { item, mods: modLines(item), x: 0, y: 0 } };
}

export function ShopView() {
  const a = useAnalysis();
  const ctx = useStore((s) => s.ctx);
  const cls = ctx.cls;
  const { targets, options } = useMemo(() => readShop(a.lines), [a.lines]);
  const [sel, setSel] = useState<string | null>(null);
  const [gallery, setGallery] = useState(targets.length === 0);
  const selected = targets.find((t) => t.id === sel) ?? targets[0];

  const save = (ts: ShopTarget[], opts = options) => actions.setLines(writeShop(getState().doc!.lines, ts, opts));
  const update = (t: ShopTarget) => save(targets.map((x) => (x.id === t.id ? t : x)));
  const add = (t: ShopTarget) => {
    save([...targets, t]);
    setSel(t.id);
  };

  return (
    <div className="page shop-page">
      <div className="row wrap" style={{ alignItems: "flex-start", marginBottom: 14 }}>
        <div className="grow" style={{ minWidth: 280 }}>
          <h2>Shop hunting</h2>
          <p className="lead" style={{ marginBottom: 0 }}>
            Tell the filter what you're hunting for in vendor windows. Matching items get a label that's impossible to miss when you hover them, and everything else can fade into gray.
          </p>
        </div>
        <label className="field" style={{ width: 180 }}>
          <span className="label">I'm playing</span>
          <select className="select" value={cls} onChange={(e) => actions.setCtx({ cls: Number(e.target.value) })}>
            {CLASS_NAMES.map((n, i) => (
              <option key={i} value={i}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="row small" style={{ alignSelf: "flex-end", paddingBottom: 6 }} title="Every other item in vendor windows is shown in plain gray">
          <button className={`switch ${options.dimOthers ? "on" : ""}`} onClick={() => save(targets, { ...options, dimOthers: !options.dimOthers })} />
          Gray out everything else in shops
        </label>
        <button className={`btn ${gallery ? "" : "primary"}`} style={{ alignSelf: "flex-end" }} onClick={() => setGallery(!gallery)}>
          <Icon name="spark" size={15} /> {gallery ? "Hide suggestions" : "Suggestions"}
        </button>
      </div>

      {gallery && <Gallery cls={cls} onAdd={add} have={targets} />}

      <div className="shop-body">
        <div className="shop-list">
          <div className="section-title">What you're hunting ({targets.length})</div>
          {targets.map((t) => (
            <TargetRow key={t.id} t={t} cls={cls} on={selected?.id === t.id} onClick={() => setSel(t.id)} onToggle={() => update({ ...t, on: !t.on })} />
          ))}
          {targets.length === 0 && <div className="small muted">Nothing yet. Pick a suggestion above, or start from scratch.</div>}
          <button className="btn" onClick={() => add(blankTarget(cls))}>
            <Icon name="plus" size={15} /> New target
          </button>
          {targets.length > 1 && <div className="small faint">When an item fits several targets, the most specific one (more requirements) labels it.</div>}
        </div>

        <VendorWindow targets={targets} cls={cls} ctx={ctx} onPick={(id) => id && setSel(id)} />

        <aside className="shop-editor">
          {selected ? (
            <TargetEditor
              key={selected.id}
              t={selected}
              cls={cls}
              onChange={update}
              onDelete={() => {
                save(targets.filter((x) => x.id !== selected.id));
                setSel(null);
              }}
            />
          ) : (
            <div className="empty" style={{ padding: "40px 20px" }}>
              <Icon name="spark" size={28} />
              <p className="muted">Add a target to style it here.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- suggestions

function Gallery({ cls, onAdd, have }: { cls: number; onAdd: (t: ShopTarget) => void; have: ShopTarget[] }) {
  const templates = useMemo(() => shopTemplates(cls).map((tp) => ({ tp, t: tp.make() })), [cls]);
  return (
    <div className="shop-gallery">
      {templates.map(({ tp, t }) => {
        const p = isolatedPreview(t, cls);
        const added = have.some((h) => h.name === t.name);
        return (
          <div key={tp.key} className="shop-card">
            <div className="shop-card-stage">
              <Tooltip r={p.r} s={p.stock} look={t.look} />
            </div>
            <div className="row" style={{ alignItems: "flex-start" }}>
              <div className="grow">
                <b>{tp.name}</b>
                <div className="small muted">{tp.blurb}</div>
              </div>
              <button className={`btn sm ${added ? "" : "primary"}`} onClick={() => onAdd(tp.make())}>
                <Icon name={added ? "check" : "plus"} size={13} /> {added ? "Add again" : "Add"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- list

function TargetRow({ t, cls, on, onClick, onToggle }: { t: ShopTarget; cls: number; on: boolean; onClick: () => void; onToggle: () => void }) {
  const p = isolatedPreview(t, cls);
  return (
    <div className={`shop-target ${on ? "on" : ""} ${t.on ? "" : "off"}`} onClick={onClick}>
      <div className="row">
        <b className="grow ellipsis">{t.name}</b>
        <button
          className={`switch ${t.on ? "on" : ""}`}
          title={t.on ? "Hunting — click to pause" : "Paused — click to hunt again"}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        />
      </div>
      <div className="small muted ellipsis">
        {SHOP_ITEMS.find((x) => x.id === t.items)?.label} · {t.needs.map(needLabel).join(", ") || "no requirements"}
      </div>
      <div className="shop-target-label">
        <D2Label r={p.r.display} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- vendor window

function VendorWindow({ targets, cls, ctx, onPick }: { targets: ShopTarget[]; cls: number; ctx: ViewContext; onPick: (id?: string) => void }) {
  const a = useAnalysis();
  const [hover, setHover] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(0);
  const [mark, setMark] = useState(true);
  const [all, setAll] = useState(false);
  const stock = useMemo(() => vendorStock(targets, cls), [targets, cls]);
  const shopCtx = SHOP_CTX({ ...ctx, cls });
  const results = useMemo(() => stock.map((s) => runFilter(a.compiled, s.item, shopCtx)), [stock, a.compiled, shopCtx.cls, shopCtx.filtlvl]);
  const hit = (k: number) => targetIdOf(a.lines[results[k].final ?? -1]);
  const show = hover ?? pinned;
  const CELL = 30;
  return (
    <div className="vendor">
      <div className="row wrap" style={{ marginBottom: 8 }}>
        <div className="section-title grow">Vendor preview</div>
        <label className="row small" title="The glow is only here, to help you check. In game you hover each item.">
          <button className={`switch ${mark ? "on" : ""}`} onClick={() => setMark(!mark)} />
          Mark matches
        </label>
        <label className="row small">
          <button className={`switch ${all ? "on" : ""}`} onClick={() => setAll(!all)} />
          Show every tooltip
        </label>
      </div>
      <div className="vendor-row">
        <div className="vendor-frame">
          <div className="vendor-tabs">
            <span className="on">Armor</span>
            <span>Weapons</span>
            <span>Misc</span>
          </div>
          <div className="vendor-grid" style={{ width: CELL * 10, height: CELL * 10 }} onMouseLeave={() => setHover(null)}>
            {stock.map((s, k) => {
              const b = ITEM_BY_CODE.get(s.item.code);
              const matched = !!hit(k);
              return (
                <button
                  key={k}
                  className={`vendor-item q-${s.item.quality} ${mark && matched ? "match" : ""} ${show === k ? "on" : ""}`}
                  style={{ left: s.x * CELL, top: s.y * CELL, width: (b?.w ?? 1) * CELL - 2, height: (b?.h ?? 1) * CELL - 2 }}
                  onMouseEnter={() => setHover(k)}
                  onClick={() => {
                    setPinned(k);
                    onPick(hit(k));
                  }}
                  title={b?.n}
                >
                  <span>{abbrev(b?.n ?? s.item.code)}</span>
                  {s.item.sockets > 0 && <i className="sock">{s.item.sockets}</i>}
                </button>
              );
            })}
          </div>
        </div>
        <div className="vendor-tip">
          {show != null && stock[show] ? (
            <>
              <Tooltip r={results[show]} s={stock[show]} look={targets.find((t) => t.id === hit(show))?.look} />
              <div className="small faint" style={{ marginTop: 8 }}>
                {hit(show) ? (
                  <>
                    Labelled by <b>{targets.find((t) => t.id === hit(show))?.name}</b>
                  </>
                ) : (
                  "Not one of your targets — this is how your filter shows it."
                )}
              </div>
            </>
          ) : (
            <div className="small muted">Hover an item to see its tooltip.</div>
          )}
        </div>
      </div>
      {all && (
        <div className="vendor-all">
          {stock.map((s, k) => (
            <div key={k} className={`vendor-all-cell ${hit(k) ? "match" : ""}`}>
              <Tooltip r={results[k]} s={s} look={targets.find((t) => t.id === hit(k))?.look} compact />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function abbrev(n: string) {
  const w = n.split(/\s+/);
  return w.length > 1 ? w.map((x) => x[0]).join("").slice(0, 3) : n.slice(0, 3);
}

function Tooltip({ r, s, look, compact }: { r: FilterResult; s: StockItem; look?: ShopLook; compact?: boolean }) {
  const price = look?.price ? COLOR_CSS[look.price] : undefined;
  return (
    <div className={`shop-tip ${compact ? "compact" : ""}`}>
      <D2Label r={r.display} showDesc hiddenText="(no name)" />
      {/* Rares, sets and uniques show their base type under the name; magic and white items don't. */}
      {!compact && ["rare", "set", "unique", "crafted"].includes(s.item.quality) && <div className="tt-base">{ITEM_BY_CODE.get(s.item.code)?.n}</div>}
      {s.mods.map((m, i) => (
        <div key={i} className="tt-mod">
          {m}
        </div>
      ))}
      <div className="tt-price" style={price ? { color: price } : undefined}>
        Cost: {s.item.price.toLocaleString()}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- editor

function TargetEditor({ t, cls, onChange, onDelete }: { t: ShopTarget; cls: number; onChange: (t: ShopTarget) => void; onDelete: () => void }) {
  const set = (patch: Partial<ShopTarget>) => onChange({ ...t, ...patch });
  const setLook = (patch: Partial<ShopLook>) => set({ look: { ...t.look, ...patch } });
  const p = isolatedPreview(t, cls);
  const [name, setName] = useState(t.name);
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="row">
        <input className="input grow" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== t.name && set({ name: name.trim() })} />
        <button className="btn sm icon ghost danger" title="Delete this target" onClick={onDelete}>
          <Icon name="trash" size={15} />
        </button>
      </div>
      <div className="shop-card-stage big">
        <Tooltip r={p.r} s={p.stock} look={t.look} />
      </div>

      <div className="col" style={{ gap: 8 }}>
        <div className="section-title">Look for</div>
        <select className="select" value={t.items} onChange={(e) => set({ items: e.target.value })}>
          {SHOP_ITEMS.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </select>
        <div className="chip-row">
          {SHOP_QUALITIES.map((q) => {
            const on = t.qualities.includes(q.id);
            return (
              <button key={q.id} className={`chip ${on ? "on" : ""}`} onClick={() => set({ qualities: on ? t.qualities.filter((x) => x !== q.id) : [...t.qualities, q.id] })}>
                {q.label}
              </button>
            );
          })}
          <span className="small faint">{t.qualities.length ? "" : "any quality"}</span>
        </div>
      </div>

      <div className="col" style={{ gap: 8 }}>
        <div className="section-title">It must have</div>
        {t.needs.map((n, i) => (
          <NeedRow key={i} n={n} cls={cls} onChange={(m) => set({ needs: t.needs.map((x, j) => (j === i ? m : x)) })} onRemove={() => set({ needs: t.needs.filter((_, j) => j !== i) })} />
        ))}
        <select
          className="select"
          value=""
          onChange={(e) => {
            const k = e.target.value;
            const n: ShopNeed | null =
              k === "tab" ? { k: "tab", tab: classTabs(cls)[0], min: 3 }
              : k === "class" ? { k: "class", cls, min: 2 }
              : k === "skill" ? { k: "skill", skill: DATA.skills.find((s) => s.cls === CLASS_NAMES[cls])?.id ?? 54, min: 3 }
              : k === "stat" ? { k: "stat", stat: "FCR", min: 20 }
              : k === "sockets" ? { k: "sockets", min: 4, max: 6 }
              : null;
            if (n) set({ needs: [...t.needs, n] });
          }}
        >
          <option value="">+ Add a requirement…</option>
          <option value="tab">+ to a skill tree</option>
          <option value="class">+ to all class skills</option>
          <option value="skill">+ to one skill</option>
          <option value="stat">A stat (FCR, IAS, run speed, resists…)</option>
          <option value="sockets">Sockets</option>
        </select>
      </div>

      <div className="col" style={{ gap: 8 }}>
        <div className="section-title">Make it stand out</div>
        <div className="style-cards">
          {SHOP_STYLES.map((st) => {
            const pv = isolatedPreview({ ...t, look: { ...t.look, style: st.id } }, cls);
            return (
              <button key={st.id} className={`style-card ${t.look.style === st.id ? "on" : ""}`} onClick={() => setLook({ style: st.id })} title={st.blurb}>
                <span className="style-card-stage">
                  <D2Label r={pv.r.display} />
                </span>
                <b>{st.label}</b>
              </button>
            );
          })}
        </div>
        <ColorRow label="Name color" value={t.look.color} onPick={(c) => setLook({ color: c! })} />
        <ColorRow label={t.look.style === "tag" ? "Tag & values color" : "Markers & values color"} value={t.look.accent} onPick={(c) => setLook({ accent: c! })} />
        {t.look.style === "tag" && (
          <label className="field">
            <span className="label">Tag text</span>
            <input className="input" maxLength={12} value={t.look.tag} onChange={(e) => setLook({ tag: e.target.value })} />
          </label>
        )}
        {t.look.style !== "readout" && (
          <label className="row small">
            <button className={`switch ${t.look.values ? "on" : ""}`} onClick={() => setLook({ values: !t.look.values })} />
            Show the values you're hunting for on a line above the name
          </label>
        )}
        <NoteField value={t.look.note} onCommit={(note) => setLook({ note })} />
        <ColorRow label="Price color" value={t.look.price} onPick={(c) => setLook({ price: c })} allowNone />
      </div>

      <details className="small muted">
        <summary style={{ cursor: "pointer" }}>What this writes in the filter</summary>
        <div className="mono" style={{ marginTop: 6, wordBreak: "break-all" }}>
          {writeShop([], [{ ...t, on: true }], { dimOthers: false }).find((l) => l.kind === "rule")?.raw.replace(/\s*\/\/@ffs.*$/, "")}
        </div>
      </details>
    </div>
  );
}

function NeedRow({ n, cls, onChange, onRemove }: { n: ShopNeed; cls: number; onChange: (n: ShopNeed) => void; onRemove: () => void }) {
  const num = (v: number, set: (x: number) => void, max = 99) => (
    <input className="input num" type="number" min={1} max={max} value={v} onChange={(e) => set(Math.max(1, Math.min(max, Number(e.target.value) || 1)))} />
  );
  return (
    <div className="need-row">
      {n.k === "tab" && (
        <>
          <span className="small">+</span>
          {num(n.min, (min) => onChange({ ...n, min }), 6)}
          <select className="select grow" value={n.tab} onChange={(e) => onChange({ ...n, tab: Number(e.target.value) })}>
            {Object.entries(TAB_NAMES).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </>
      )}
      {n.k === "class" && (
        <>
          <span className="small">+</span>
          {num(n.min, (min) => onChange({ ...n, min }), 6)}
          <select className="select grow" value={n.cls} onChange={(e) => onChange({ ...n, cls: Number(e.target.value) })}>
            {CLASS_NAMES.map((c, i) => (
              <option key={i} value={i}>
                all {c} skills
              </option>
            ))}
          </select>
        </>
      )}
      {n.k === "skill" && (
        <>
          <span className="small">+</span>
          {num(n.min, (min) => onChange({ ...n, min }), 6)}
          <select className="select grow" value={n.skill} onChange={(e) => onChange({ ...n, skill: Number(e.target.value) })}>
            {[...CLASS_NAMES].sort((x, y) => Number(y === CLASS_NAMES[cls]) - Number(x === CLASS_NAMES[cls])).map((c) => (
              <optgroup key={c} label={c}>
                {DATA.skills
                  .filter((s) => s.cls === c && !s.gray)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.n}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </>
      )}
      {n.k === "stat" && (
        <>
          {num(n.min, (min) => onChange({ ...n, min }), 500)}
          <span className="small">or more</span>
          <select className="select grow" value={n.stat} onChange={(e) => onChange({ ...n, stat: e.target.value })}>
            {SHOP_STATS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </>
      )}
      {n.k === "sockets" && (
        <>
          {num(n.min, (min) => onChange({ ...n, min, max: Math.max(min, n.max) }), 6)}
          <span className="small">to</span>
          {num(n.max, (max) => onChange({ ...n, max: Math.max(max, n.min) }), 6)}
          <span className="small grow">sockets</span>
        </>
      )}
      <button className="btn sm icon ghost" title="Remove" onClick={onRemove}>
        <Icon name="x" size={14} />
      </button>
    </div>
  );
}

function ColorRow({ label, value, onPick, allowNone }: { label: string; value?: string; onPick: (c: string | undefined) => void; allowNone?: boolean }) {
  return (
    <div className="col" style={{ gap: 4 }}>
      <span className="small muted">{label}</span>
      <div className="swatch-row">
        {allowNone && (
          <button className={`swatch-big none ${!value ? "on" : ""}`} onClick={() => onPick(undefined)} title="Game default">
            <Icon name="x" size={12} />
          </button>
        )}
        {SHOP_COLORS.map((c) => (
          <button key={c} className={`swatch-big ${value === c ? "on" : ""}`} style={{ background: COLOR_CSS[c] }} title={c} onClick={() => onPick(c)} />
        ))}
      </div>
    </div>
  );
}

function NoteField({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value);
  return (
    <label className="field">
      <span className="label">Note in the tooltip (optional)</span>
      <input
        className="input"
        placeholder="e.g. Hydra orb — buy!"
        maxLength={40}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => v !== value && onCommit(v)}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
    </label>
  );
}
