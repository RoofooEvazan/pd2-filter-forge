// Searchable picker for adding a condition: items by name, keywords by category, stats, skills,
// zones, aliases and formulas. Returns the condition text(s) to add.
import { useEffect, useMemo, useRef, useState } from "react";
import { CONDITIONS, COND_CATEGORIES, CLASS_NAMES, TAB_NAMES } from "../lib/spec";
import { DATA, ITEM_BY_CODE, searchItems, tierName } from "../lib/data";
import type { Definitions } from "../lib/document";
import { useStore } from "../state/store";

export interface Pick {
  texts: string[];
  /** Multiple texts that should be OR-ed (e.g. all tiers of a base). */
  any?: boolean;
}

interface Entry {
  group: string;
  title: string;
  sub: string;
  code: string;
  pick: Pick;
  extra?: { label: string; pick: Pick };
}

const TABS = ["Everything", "Items", "Keywords", "Stats", "Skills", "Zones", "Defined here"] as const;
type Tab = (typeof TABS)[number];

function defaultText(code: string) {
  const k = CONDITIONS.find((c) => c.code === code);
  if (!k) return code;
  if (k.kind === "value") return `${code}>0`;
  if (k.kind === "param") return k.example ?? `${code}1>0`;
  return code;
}

export function ConditionPicker({ defs, onPick, onClose, anchor }: { defs: Definitions; onPick: (p: Pick) => void; onClose: () => void; anchor: DOMRect | null }) {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<Tab>("Everything");
  const [cursor, setCursor] = useState(0);
  const showUndoc = useStore((s) => s.settings.showUndocumented);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);

  const entries = useMemo(() => {
    const query = q.trim().toLowerCase();
    const out: Entry[] = [];
    const want = (t: Tab) => tab === "Everything" || tab === t;
    const match = (...s: (string | undefined)[]) => !query || s.some((x) => x?.toLowerCase().includes(query));

    if (want("Keywords")) {
      for (const cat of COND_CATEGORIES) {
        for (const k of CONDITIONS.filter((c) => c.cat === cat && c.kind !== "logic")) {
          if (k.undocumented && !showUndoc) continue;
          if (!match(k.code, k.label, k.desc, ...(k.alt ?? []))) continue;
          out.push({ group: `Keywords · ${cat}`, title: k.label, sub: k.desc, code: defaultText(k.code), pick: { texts: [defaultText(k.code)] } });
        }
      }
    }
    if (want("Items")) {
      const hits = query ? searchItems(query, tab === "Items" ? 80 : 25) : [];
      for (const h of hits) {
        if (h.kind === "runeword") {
          out.push({ group: "Items", title: h.name, sub: `Runeword · ${h.detail}`, code: "RW", pick: { texts: ["RW"] } });
          continue;
        }
        const base = ITEM_BY_CODE.get(h.code);
        const quality = h.kind === "unique" ? "UNI" : h.kind === "set" ? "SET" : null;
        const e: Entry = {
          group: "Items",
          title: h.name,
          sub: h.kind === "base" ? `${[tierName(base?.tier), base?.cat].filter(Boolean).join(" ")} base` : h.detail,
          code: h.code,
          pick: { texts: quality ? [h.code, quality] : [h.code] },
        };
        if (base?.fam && h.kind === "base") e.extra = { label: "all 3 tiers", pick: { texts: base.fam, any: true } };
        out.push(e);
      }
    }
    if (want("Stats") && (query || tab === "Stats")) {
      for (const s of DATA.stats) {
        if (!match(s.d, s.key, `stat${s.id}`)) continue;
        out.push({ group: "Stats", title: s.d, sub: `STAT${s.id} · ${s.key}`, code: `STAT${s.id}>0`, pick: { texts: [`STAT${s.id}>0`] } });
        if (out.length > 400) break;
      }
    }
    if (want("Skills") && (query || tab === "Skills")) {
      CLASS_NAMES.forEach((c, i) => {
        if (match(c, "class skills")) out.push({ group: "Skills", title: `+${c} skills`, sub: `CLSK${i}`, code: `CLSK${i}>0`, pick: { texts: [`CLSK${i}>0`] } });
      });
      for (const [id, n] of Object.entries(TAB_NAMES)) if (match(n, "tab")) out.push({ group: "Skills", title: `+${n} skills`, sub: `TABSK${id}`, code: `TABSK${id}>0`, pick: { texts: [`TABSK${id}>0`] } });
      for (const s of DATA.skills) {
        if (!match(s.n, s.cls)) continue;
        out.push({
          group: "Skills",
          title: `+ ${s.n}`,
          sub: `${s.cls} · SK${s.id}`,
          code: `SK${s.id}>0`,
          pick: { texts: [`SK${s.id}>0`] },
          extra: { label: "charges", pick: { texts: [`CHSK${s.id}>0`] } },
        });
      }
    }
    if (want("Zones") && (query || tab === "Zones")) {
      for (const z of DATA.zones) if (match(z.n, String(z.id))) out.push({ group: "Zones", title: z.n, sub: `MAPID=${z.id}`, code: `MAPID=${z.id}`, pick: { texts: [`MAPID=${z.id}`] } });
    }
    if (want("Defined here")) {
      for (const [name, v] of defs.aliases) if (match(name, v.value)) out.push({ group: "Aliases in this filter", title: name, sub: v.value, code: name, pick: { texts: [name] } });
      for (const [name, v] of defs.formulas) if (match(name, v.value)) out.push({ group: "Formulas in this filter", title: `FORMULA${name}`, sub: v.value, code: `FORMULA${name}`, pick: { texts: [`FORMULA${name}`] } });
    }
    // A raw token typed by the user is always offered first.
    if (query && /^[!(]*[A-Za-z0-9_+,$<>=~-]+$/.test(q.trim())) out.unshift({ group: "Type it yourself", title: q.trim(), sub: "Add exactly this text", code: q.trim(), pick: { texts: [q.trim()] } });
    return out.slice(0, 500);
  }, [q, tab, defs, showUndoc]);

  useEffect(() => setCursor(0), [q, tab]);

  const style: React.CSSProperties = anchor
    ? { left: Math.min(anchor.left, window.innerWidth - 620), top: Math.min(anchor.bottom + 6, window.innerHeight - 520), width: 600, height: 500 }
    : { left: "50%", top: "12vh", transform: "translateX(-50%)", width: 600, height: 500 };

  let lastGroup = "";
  return (
    <>
      <div className="scrim clear" onClick={onClose} />
      <div className="pop" style={style} onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
        else if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(entries.length - 1, c + 1)); }
        else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
        else if (e.key === "Enter" && entries[cursor]) { e.preventDefault(); onPick(entries[cursor].pick); }
      }}>
        <div style={{ padding: 10, borderBottom: "1px solid var(--line)" }} className="col">
          <input ref={inputRef} className="input" placeholder="Search: item names (Shako, Ber), keywords (ethereal, sockets), stats (life leech), skills (teleport)…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="row wrap" style={{ gap: 4 }}>
            {TABS.map((t) => (
              <button key={t} className={`chip ${tab === t ? "on" : ""}`} onClick={() => setTab(t)}>
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="plist">
          {entries.length === 0 && <div className="empty">{q ? "No matches." : "Type to search, or pick a tab."}</div>}
          {entries.map((e, i) => {
            const head = e.group !== lastGroup ? (lastGroup = e.group) : null;
            return (
              <div key={i}>
                {head && <div className="pgroup">{head}</div>}
                <div className={`pitem ${i === cursor ? "on" : ""}`} onMouseEnter={() => setCursor(i)} onClick={() => onPick(e.pick)}>
                  <div className="main-t">
                    <div className="ellipsis">{e.title}</div>
                    <div className="sub ellipsis">{e.sub}</div>
                  </div>
                  <span className="tok item" style={{ flex: "none" }}>
                    {e.code}
                  </span>
                  {e.extra && (
                    <button
                      className="btn sm"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onPick(e.extra!.pick);
                      }}
                    >
                      + {e.extra.label}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="row small faint" style={{ padding: "6px 12px", borderTop: "1px solid var(--line)" }}>
          <span className="kbd">↑↓</span> move <span className="kbd">Enter</span> add <span className="kbd">Esc</span> close
        </div>
      </div>
    </>
  );
}
