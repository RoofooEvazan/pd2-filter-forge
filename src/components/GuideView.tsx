// The how-to guide, built in: contents on the left, search across every section, the guide on the right.
// The same docs/guide.md is published as the website (scripts/build-site.mjs).
import { useEffect, useMemo, useState } from "react";
import { actions } from "../state/store";
import guide from "../../docs/guide.md?raw";
import { Markdown } from "./Markdown";
import { Icon } from "./icons";
import { openExternal } from "../lib/platform";
import { SITE_URL } from "../lib/updates";

interface Section {
  id: string;
  title: string;
  level: number;
  body: string;
}

/** Split the guide at its <a id> anchors; each piece keeps its heading. */
function sections(md: string): Section[] {
  const out: Section[] = [];
  const parts = md.split(/(?=^<a id="[^"]+"><\/a>$)/m);
  for (const p of parts) {
    const m = p.match(/^<a id="([^"]+)"><\/a>\r?\n(#+)\s+(.*)/);
    if (m) out.push({ id: m[1], title: m[3].trim(), level: m[2].length, body: p });
  }
  return out;
}

const plain = (s: string) => s.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[`*#<>|]/g, " ").toLowerCase();

export function GuideView() {
  const all = useMemo(() => sections(guide), []);
  const intro = useMemo(() => guide.split(/^<a id=/m)[0], []);
  const [q, setQ] = useState("");
  useEffect(() => actions.markSeen("guide"), []);
  const [anchor, setAnchor] = useState<{ id: string; n: number } | null>(null);
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const hits = words.length ? all.filter((s) => words.every((w) => plain(s.body).includes(w))) : null;

  return (
    <div className="guide">
      <nav className="guide-toc">
        <div className="simple-search">
          <Icon name="search" size={16} />
          <input className="input grow" placeholder="Search the guide…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {(hits ?? all).map((s) => (
          <button
            key={s.id}
            className={`guide-link l${s.level}`}
            onClick={() => {
              setQ("");
              setAnchor({ id: s.id, n: Date.now() });
            }}
          >
            {s.title}
          </button>
        ))}
        {hits && hits.length === 0 && <div className="small muted" style={{ padding: 8 }}>Nothing matches “{q}”.</div>}
        <div className="divider" />
        <button className="guide-link" onClick={() => openExternal(SITE_URL)}>
          <Icon name="globe" size={14} /> Open the guide in your browser
        </button>
      </nav>
      <article className="guide-body">
        {hits ? (
          <>
            <div className="small muted" style={{ marginBottom: 12 }}>
              {hits.length} section{hits.length === 1 ? "" : "s"} about “{q}”
            </div>
            {hits.map((s) => (
              <Markdown key={s.id} source={s.body} className="guide-md" />
            ))}
          </>
        ) : (
          <Markdown source={intro + all.map((s) => s.body).join("")} anchor={anchor} className="guide-md" />
        )}
      </article>
    </div>
  );
}
