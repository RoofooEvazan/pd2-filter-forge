// Ctrl+K: jump to any section, rule, alias or keyword, or run a command.
import { checkForUpdates } from "../lib/updates";
import { useEffect, useMemo, useRef, useState } from "react";
import { actions, getState, type View } from "../state/store";
import { useAnalysis } from "../state/analysis";
import { save, saveAs, openDialog, installToPd2 } from "../state/files";
import { CONDITIONS, OUTPUTS } from "../lib/spec";
import { DATA } from "../lib/data";
import { makeItem } from "../lib/item";
import { confirmClose } from "../App";
import { Icon } from "./icons";

interface Cmd {
  group: string;
  title: string;
  sub?: string;
  run: () => void;
}

export function CommandPalette() {
  const a = useAnalysis();
  const [q, setQ] = useState("");
  const [cur, setCur] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const hasDoc = !!getState().doc;

  const cmds = useMemo(() => {
    const query = q.trim().toLowerCase();
    const m = (...s: (string | undefined)[]) => !query || s.some((x) => x?.toLowerCase().includes(query));
    const out: Cmd[] = [];
    const go = (v: View) => () => actions.setView(v);
    const base: Cmd[] = [
      { group: "Commands", title: "Open a filter file…", run: openDialog },
      ...(hasDoc
        ? [
            { group: "Commands", title: "Save", sub: "Ctrl+S", run: () => save() },
            { group: "Commands", title: "Save as…", sub: "Ctrl+Shift+S", run: () => saveAs() },
            { group: "Commands", title: "Install to PD2 (filters\\local)", run: () => installToPd2() },
            { group: "Commands", title: "Close filter", run: confirmClose },
            { group: "Go to", title: "Rules", run: go("rules") },
            { group: "Go to", title: "Test Lab", run: go("lab") },
            { group: "Go to", title: "Levels, Aliases & Formulas", run: go("definitions") },
            { group: "Go to", title: "Problems", run: go("problems") },
            { group: "Go to", title: "Source text", run: go("source") },
          ]
        : []),
      { group: "Go to", title: "Codex", run: go("codex") },
      { group: "Go to", title: "Settings", run: go("settings") },
      ...(hasDoc
        ? [
            { group: "Discord", title: "Ask for help on Discord (#filter-help)", run: () => actions.openDiscord("help") },
            { group: "Discord", title: "Share my filter on Discord (#share-your-filter)", run: () => actions.openDiscord("share") },
          ]
        : []),
      { group: "App", title: "Check for updates", run: () => { go("settings")(); void checkForUpdates(); } },
    ];
    out.push(...base.filter((c) => m(c.title)));
    if (hasDoc) {
      for (const s of a.sections)
        if (m(s.title))
          out.push({
            group: "Sections",
            title: s.title,
            sub: `${s.rules} rules`,
            run: () => {
              const l = a.lines.slice(Math.max(0, s.start), s.end).find((x) => x.kind === "rule") ?? a.lines[Math.max(0, s.start)];
              if (l) actions.goTo(l.id);
            },
          });
      for (const [name, v] of a.defs.aliases) if (query && m(name)) out.push({ group: "Aliases", title: name, sub: v.value, run: () => actions.goTo(v.id) });
      if (query.length >= 2) {
        let n = 0;
        for (const l of a.lines) {
          if (l.kind !== "rule" || !l.raw.toLowerCase().includes(query)) continue;
          out.push({ group: "Rules", title: l.raw.trim(), sub: `line ${(a.indexOf.get(l.id) ?? 0) + 1}`, run: () => actions.goTo(l.id) });
          if (++n >= 30) break;
        }
        for (const it of DATA.items) {
          if (!it.n.toLowerCase().includes(query)) continue;
          out.push({
            group: "Test an item",
            title: `Test ${it.n}`,
            sub: it.c,
            run: () => {
              actions.replaceTestItem(makeItem(it.c));
              actions.setView("lab");
            },
          });
          if (out.length > 200) break;
        }
      }
    }
    if (query.length >= 2) {
      for (const k of CONDITIONS) if (m(k.code, k.label)) out.push({ group: "Codex", title: `${k.code} — ${k.label}`, sub: k.desc, run: go("codex") });
      for (const k of OUTPUTS) if (m(k.code, k.label)) out.push({ group: "Codex", title: `%${k.code}% — ${k.label}`, sub: k.desc, run: go("codex") });
    }
    return out.slice(0, 250);
  }, [q, a, hasDoc]);

  useEffect(() => setCur(0), [q]);
  const close = () => actions.setPalette(false);
  const run = (c: Cmd) => {
    close();
    c.run();
  };
  let last = "";
  return (
    <>
      <div className="scrim" onClick={close} />
      <div
        className="pop"
        style={{ left: "50%", top: "10vh", transform: "translateX(-50%)", width: "min(680px, 92vw)", maxHeight: "70vh" }}
        onKeyDown={(e) => {
          if (e.key === "Escape") close();
          else if (e.key === "ArrowDown") {
            e.preventDefault();
            setCur((c) => Math.min(cmds.length - 1, c + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setCur((c) => Math.max(0, c - 1));
          } else if (e.key === "Enter" && cmds[cur]) run(cmds[cur]);
        }}
      >
        <div className="row" style={{ padding: 12, borderBottom: "1px solid var(--line)" }}>
          <Icon name="search" />
          <input ref={input} className="input grow" style={{ border: 0, background: "transparent" }} placeholder="Search sections, rules, items, keywords, commands…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="plist">
          {cmds.map((c, i) => {
            const head = c.group !== last ? (last = c.group) : null;
            return (
              <div key={i}>
                {head && <div className="pgroup">{head}</div>}
                <div className={`pitem ${i === cur ? "on" : ""}`} onMouseEnter={() => setCur(i)} onClick={() => run(c)}>
                  <div className="main-t">
                    <div className="ellipsis">{c.title}</div>
                    {c.sub && <div className="sub ellipsis">{c.sub}</div>}
                  </div>
                </div>
              </div>
            );
          })}
          {cmds.length === 0 && <div className="empty">Nothing found.</div>}
        </div>
      </div>
    </>
  );
}
