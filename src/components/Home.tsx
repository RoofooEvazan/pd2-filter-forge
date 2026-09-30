// Start screen: new filter, public filters from the launcher list, and filters on this PC.
import { useEffect, useState } from "react";
import { actions, clearDraft, loadDraft, useStore } from "../state/store";
import { openBytes, openDialog, openPath, pd2Dir } from "../state/files";
import { blankFilter, starterFilter } from "../lib/templates";
import { authorPage, fetchAuthorFiles, fetchAuthors, fetchFilterBytes, type Author, type RemoteFile } from "../lib/launcher";
import { isDesktop, joinPath, listDir, openExternal, type DirEntry } from "../lib/platform";
import { DATA } from "../lib/data";
import { Icon } from "./icons";
import { VersionLine } from "./Updates";

export function Home() {
  const recent = useStore((s) => s.recent);
  const [name, setName] = useState("My Filter");
  const [draft, setDraft] = useState(loadDraft);

  const start = (kind: "blank" | "starter") => {
    const text = kind === "blank" ? blankFilter(name) : starterFilter(name);
    actions.openText(text, { name: `${name}.filter`, origin: kind === "blank" ? "New blank filter" : "New from starter" }, true);
  };

  return (
    <div className="home">
      <div className="home-hero">
        <img src="/icon.svg" width={64} height={64} alt="" />
        <div>
          <h1>PD2 Filter Forge</h1>
          <p>Build Project Diablo 2 loot filters visually, test them against any item, and install them straight into the game.</p>
          <VersionLine />
        </div>
        <button className="btn" style={{ marginLeft: "auto", alignSelf: "center" }} onClick={() => actions.setView("guide")}>
          <Icon name="help" size={16} /> How-to guide
        </button>
      </div>

      {draft && (
        <div className="card row" style={{ padding: "12px 16px", marginBottom: 22, borderColor: "var(--accent)" }}>
          <Icon name="undo" />
          <div className="grow">
            <b>Resume {draft.name}</b>
            <div className="small muted">
              Last edited {new Date(draft.t).toLocaleString()}
              {draft.dirty ? " · has changes that were never saved" : ""}
            </div>
          </div>
          <button className="btn ghost" onClick={() => { clearDraft(); setDraft(null); }}>
            Discard
          </button>
          <button className="btn primary" onClick={() => actions.openText(draft.text, { name: draft.name, path: draft.path, origin: draft.origin }, draft.dirty)}>
            Resume
          </button>
        </div>
      )}
      <div className="row" style={{ marginBottom: 12 }}>
        <span className="section-title">Start something new</span>
        <div className="grow" />
        <label className="row small muted">
          Name
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} style={{ width: 200 }} />
        </label>
      </div>
      <div className="start-grid">
        <button className="start-card" onClick={() => start("starter")}>
          <div className="ic">
            <Icon name="spark" />
          </div>
          <h3>Starter filter</h3>
          <p>A tidy, commented filter with 4 strictness levels, rune/currency highlights, sounds and junk hiding. The fastest way to learn.</p>
        </button>
        <button className="start-card" onClick={() => start("blank")}>
          <div className="ic">
            <Icon name="file" />
          </div>
          <h3>Blank filter</h3>
          <p>Just the essentials. Build every rule yourself with the visual editor.</p>
        </button>
        <button className="start-card" onClick={() => openDialog()}>
          <div className="ic">
            <Icon name="folder" />
          </div>
          <h3>Open a file…</h3>
          <p>Any .filter file on this PC. <span className="kbd">Ctrl O</span></p>
        </button>
      </div>

      <div className="home-cols">
        <div className="col" style={{ gap: 10 }}>
          <div className="row">
            <Icon name="globe" size={16} />
            <span className="section-title">Public filters from the PD2 launcher</span>
          </div>
          <LauncherBrowser />
        </div>
        <div className="col" style={{ gap: 10 }}>
          {recent.length > 0 && (
            <>
              <span className="section-title">Recent</span>
              <div className="card">
                {recent.map((r) => (
                  <div key={r.path} className="list-row" onClick={() => openPath(r.path, "Recent")}>
                    <Icon name="file" size={16} />
                    <div className="grow">
                      <div className="ellipsis">{r.name}</div>
                      <div className="small faint ellipsis">{r.path}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          <LocalFilters />
          <div className="card" style={{ padding: 14 }}>
            <div className="section-title" style={{ marginBottom: 6 }}>
              Game data
            </div>
            <div className="small muted">
              {DATA.items.length} item bases · {DATA.uniques.length} uniques · {DATA.sets.length} set items · {DATA.runewords.length} runewords · {DATA.stats.length} stats ·{" "}
              {DATA.skills.length} skills · {DATA.zones.length} zones, read from your installed pd2data.mpq (modified {new Date(DATA.meta.pd2dataModified).toLocaleDateString()}).
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LauncherBrowser() {
  const [authors, setAuthors] = useState<Author[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<Author | null>(null);
  const [files, setFiles] = useState<RemoteFile[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetchAuthors()
      .then((a) => setAuthors(a))
      .catch((e) => setErr(String(e.message ?? e)));
  }, []);

  useEffect(() => {
    if (!sel) return;
    setFiles(null);
    setErr(null);
    fetchAuthorFiles(sel)
      .then(setFiles)
      .catch((e) => setErr(String(e.message ?? e)));
  }, [sel]);

  const use = async (f: RemoteFile) => {
    setBusy(f.name);
    try {
      const bytes = await fetchFilterBytes(f);
      // Opened as an unsaved copy: the original stays untouched and auto-updating in the launcher.
      openBytes(`${f.name.replace(/\.filter$/i, "")} (custom).filter`, bytes, `Launcher · ${sel?.author}`, undefined, true);
      actions.toast(`Loaded ${f.name} by ${sel?.author} as your own copy. Save or Install to PD2 when ready.`, "info");
    } catch (e) {
      actions.toast(String((e as Error).message ?? e), "err");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="card launcher">
      <div className="authors">
        {!authors && !err && <div className="empty">Loading the launcher list…</div>}
        {authors?.map((a) => (
          <div key={a.url} className={`list-row ${sel === a ? "on" : ""}`} onClick={() => setSel(a)}>
            <div className="grow">
              <div className="ellipsis">{a.author}</div>
              <div className="small faint ellipsis">{a.name}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="files">
        {err && <div className="empty" style={{ color: "var(--err)" }}>{err}</div>}
        {!sel && !err && <div className="empty">Pick an author to see their filters. Anything you open becomes your own editable copy.</div>}
        {sel && !files && !err && <div className="empty">Loading {sel.author}'s filters…</div>}
        {sel && files && (
          <>
            <div className="row" style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)" }}>
              <b className="grow ellipsis">{sel.name}</b>
              <a
                href={authorPage(sel)}
                className="small"
                onClick={(e) => {
                  e.preventDefault();
                  openExternal(authorPage(sel));
                }}
              >
                Author page
              </a>
            </div>
            {files.length === 0 && <div className="empty">No .filter files found here.</div>}
            {files.map((f) => (
              <div key={f.path} className="list-row" onClick={() => use(f)}>
                <Icon name="file" size={16} />
                <div className="grow">
                  <div>{f.name}</div>
                  <div className="small faint">{(f.size / 1024).toFixed(0)} KB</div>
                </div>
                <button className="btn sm" disabled={!!busy}>
                  {busy === f.name ? "Loading…" : "Use as template"}
                </button>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function LocalFilters() {
  const [dir, setDir] = useState<string | null>(null);
  const [local, setLocal] = useState<DirEntry[]>([]);
  const [online, setOnline] = useState<DirEntry[]>([]);
  useEffect(() => {
    if (!isDesktop) return;
    pd2Dir().then(async (d) => {
      setDir(d);
      if (!d) return;
      const f = (e: DirEntry) => e.isFile && e.name.toLowerCase().endsWith(".filter");
      setLocal((await listDir(joinPath(d, "filters\\local"))).filter(f));
      setOnline((await listDir(joinPath(d, "filters\\online"))).filter(f));
    });
  }, []);
  if (!isDesktop) {
    return (
      <div className="card" style={{ padding: 14 }}>
        <div className="section-title" style={{ marginBottom: 6 }}>
          Your PD2 folder
        </div>
        <div className="small muted">Run the desktop app to browse ProjectD2\filters directly and install with one click. In the browser, use Open a file… and Save.</div>
      </div>
    );
  }
  return (
    <>
      <span className="section-title">In your PD2 folder</span>
      <div className="card">
        {!dir && <div className="empty">ProjectD2 folder not found. Set it in Settings.</div>}
        {dir && local.length + online.length === 0 && <div className="empty">No filters yet in {dir}\filters.</div>}
        {local.map((e) => (
          <div key={e.path} className="list-row" onClick={() => openPath(e.path, "Local filter")}>
            <Icon name="file" size={16} />
            <div className="grow ellipsis">{e.name}</div>
            <span className="badge accent">local</span>
          </div>
        ))}
        {online.map((e) => (
          <div
            key={e.path}
            className="list-row"
            title="Downloaded by the launcher. Opened as a copy, because the launcher overwrites this file on updates."
            onClick={async () => {
              const { readFileBytes } = await import("../lib/platform");
              openBytes(`${e.name.replace(/\.filter$/i, "")} (custom).filter`, await readFileBytes(e.path), "Launcher download", undefined, true);
            }}
          >
            <Icon name="globe" size={16} />
            <div className="grow ellipsis">{e.name}</div>
            <span className="badge">online copy</span>
          </div>
        ))}
      </div>
    </>
  );
}
