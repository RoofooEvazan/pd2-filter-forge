import { useEffect } from "react";
import { actions, getState, isDirty, useStore, type View } from "./state/store";
import { useAnalysis } from "./state/analysis";
import { save, saveAs, openDialog, installToPd2 } from "./state/files";
import { Icon } from "./components/icons";
import { Home } from "./components/Home";
import { RulesView } from "./components/RulesView";
import { LabView } from "./components/LabView";
import { DefinitionsView } from "./components/DefinitionsView";
import { ProblemsView } from "./components/ProblemsView";
import { CodexView } from "./components/CodexView";
import { SourceView } from "./components/SourceView";
import { SettingsView } from "./components/SettingsView";
import { CommandPalette } from "./components/CommandPalette";
import { LevelPicker } from "./components/LevelPicker";
import { SimpleView } from "./components/SimpleView";
import { PreviewView } from "./components/PreviewView";
import { UpdateBanner } from "./components/Updates";
import { ShopView } from "./components/ShopView";
import { DiscordDialog } from "./components/DiscordDialog";
import { checkOnLaunch } from "./lib/updates";
import { readMysteries } from "./lib/simple";

const SIMPLE_NAV: { view: View; icon: string; label: string; hk: string }[] = [
  { view: "simple", icon: "wand", label: "Items", hk: "1" },
  { view: "preview", icon: "eye", label: "Loot preview", hk: "2" },
  { view: "shop", icon: "spark", label: "Shop hunting", hk: "3" },
];
const NAV: { view: View; icon: string; label: string; hk: string }[] = [
  { view: "rules", icon: "rules", label: "Rules", hk: "1" },
  { view: "lab", icon: "lab", label: "Test Lab", hk: "2" },
  { view: "definitions", icon: "layers", label: "Levels, Aliases & Formulas", hk: "3" },
  { view: "problems", icon: "problems", label: "Problems", hk: "4" },
  { view: "codex", icon: "codex", label: "Codex (reference)", hk: "5" },
  { view: "source", icon: "source", label: "Source text", hk: "6" },
  { view: "shop", icon: "spark", label: "Shop hunting", hk: "7" },
];

export function App() {
  const settings = useStore((s) => s.settings);
  const hasDoc = useStore((s) => !!s.doc);
  const view = useStore((s) => s.view);
  const palette = useStore((s) => s.palette);
  const discord = useStore((s) => s.discord);
  const mode = settings.mode;
  const toast = useStore((s) => s.toast);

  useEffect(() => {
    const r = document.documentElement;
    r.dataset.theme = settings.theme;
    r.dataset.density = settings.density;
    r.style.setProperty("--accent", settings.accent);
    r.style.setProperty("--scale", String(settings.fontScale));
  }, [settings]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const inField = (e.target as HTMLElement)?.closest?.("input, textarea, select");
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        actions.setPalette(!getState().palette);
      } else if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (e.shiftKey) saveAs();
        else save();
      } else if (mod && e.key.toLowerCase() === "o") {
        e.preventDefault();
        openDialog();
      } else if (mod && !inField && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) actions.redo();
        else actions.undo();
      } else if (mod && !inField && e.key.toLowerCase() === "y") {
        e.preventDefault();
        actions.redo();
      } else if (e.altKey && /^[1-8]$/.test(e.key) && getState().doc) {
        e.preventDefault();
        const nav = getState().settings.mode === "simple" ? SIMPLE_NAV : NAV;
        const v = nav.find((n) => n.hk === e.key)?.view ?? "settings";
        actions.setView(v);
      }
    };
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty(getState())) e.preventDefault();
    };
    checkOnLaunch();
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, []);

  return (
    <div className="app">
      <TopBar />
      <Rail />
      <main className="main">
        <UpdateBanner />
        {hasDoc && mode === "simple" && (view === "simple" || view === "preview" || view === "shop") && <SimpleTabs />}
        {!hasDoc && view !== "settings" && view !== "codex" ? (
          <Home />
        ) : view === "simple" ? (
          <SimpleView />
        ) : view === "preview" ? (
          <PreviewView />
        ) : view === "shop" ? (
          <ShopView />
        ) : view === "rules" ? (
          <RulesView />
        ) : view === "lab" ? (
          <LabView />
        ) : view === "definitions" ? (
          <DefinitionsView />
        ) : view === "problems" ? (
          <ProblemsView />
        ) : view === "codex" ? (
          <CodexView />
        ) : view === "source" ? (
          <SourceView />
        ) : (
          <SettingsView />
        )}
      </main>
      {palette && <CommandPalette />}
      {discord && <DiscordDialog initial={discord} />}
      {toast && (
        <div className={`toast ${toast.kind}`} role="status">
          <Icon name={toast.kind === "err" ? "problems" : toast.kind === "info" ? "info" : "check"} />
          <span>{toast.msg}</span>
        </div>
      )}
    </div>
  );
}

function TopBar() {
  const file = useStore((s) => s.file);
  const dirty = useStore(isDirty);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const mode = useStore((s) => s.settings.mode);
  const hasDoc = !!file;
  return (
    <header className="topbar">
      <div className="brand" onClick={() => actions.setView(mode === "simple" ? "simple" : "rules")} title="PD2 Filter Forge">
        <img src="/icon.svg" alt="" />
        <span>
          Filter Forge <small>PD2</small>
        </span>
      </div>
      {hasDoc && (
        <>
          <div className="filename" title={file.path ?? file.origin}>
            <Icon name="file" size={15} />
            <span className="ellipsis" style={{ maxWidth: 260 }}>
              {file.name}
            </span>
            {dirty && <span className="dirty-dot" title="Unsaved changes" />}
          </div>
          <button className="btn icon ghost" disabled={!canUndo} onClick={actions.undo} title="Undo (Ctrl+Z)">
            <Icon name="undo" />
          </button>
          <button className="btn icon ghost" disabled={!canRedo} onClick={actions.redo} title="Redo (Ctrl+Y)">
            <Icon name="redo" />
          </button>
          {mode === "advanced" && <LevelPicker />}
        </>
      )}
      <div className="grow" />
      <div className="mode-toggle" title="Simple: pick items and styles visually. Advanced: edit every rule.">
        <button className={mode === "simple" ? "on" : ""} onClick={() => actions.setMode("simple")}>
          Simple
        </button>
        <button className={mode === "advanced" ? "on" : ""} onClick={() => actions.setMode("advanced")}>
          Advanced
        </button>
      </div>
      {mode === "advanced" && (
        <button className="btn ghost" onClick={() => actions.setPalette(true)} title="Search everything (Ctrl+K)">
          <Icon name="search" size={16} />
          <span className="muted">Search</span>
          <span className="kbd">Ctrl K</span>
        </button>
      )}
      {hasDoc && (
        <>
          <button className="btn ghost" onClick={() => actions.openDiscord("share")} title="Ask for help or share your filter on the Roofoo Discord">
            <Icon name="chat" size={16} /> Discord
          </button>
          <button className="btn" onClick={() => save()} title="Save (Ctrl+S)">
            <Icon name="save" size={16} /> Save
          </button>
          <button className="btn primary" onClick={() => installToPd2()} title="Save into ProjectD2\filters\local so the launcher can use it">
            <Icon name="install" size={16} /> Install to PD2
          </button>
        </>
      )}
    </header>
  );
}

function Rail() {
  const view = useStore((s) => s.view);
  const hasDoc = useStore((s) => !!s.doc);
  const mode = useStore((s) => s.settings.mode);
  const home = mode === "simple" ? "simple" : "rules";
  return (
    <nav className="rail">
      {hasDoc ? (
        (mode === "simple" ? SIMPLE_NAV : NAV).map((n) => <RailButton key={n.view} {...n} on={view === n.view} />)
      ) : (
        <>
          <button className={`tip ${view !== "codex" && view !== "settings" ? "on" : ""}`} data-tip="Home" onClick={() => actions.setView(home)}>
            <Icon name="home" />
          </button>
          {mode === "advanced" && (
            <button className={`tip ${view === "codex" ? "on" : ""}`} data-tip="Codex (reference)" onClick={() => actions.setView("codex")}>
              <Icon name="codex" />
            </button>
          )}
        </>
      )}
      <div className="spacer" />
      {hasDoc && (
        <button className="tip" data-tip="Close filter (back to Home)" onClick={() => confirmClose()}>
          <Icon name="home" />
        </button>
      )}
      <button className={`tip ${view === "settings" ? "on" : ""}`} data-tip="Settings & updates" onClick={() => actions.setView("settings")}>
        <Icon name="settings" />
      </button>
    </nav>
  );
}

function RailButton({ view, icon, label, hk, on }: { view: View; icon: string; label: string; hk: string; on: boolean }) {
  const a = useAnalysis();
  const count = view === "problems" ? a.counts.error : 0;
  const isNew = useStore((s) => view === "shop" && !s.seen.includes("shop"));
  return (
    <button className={`tip ${on ? "on" : ""}`} data-tip={`${label}${isNew ? " — new!" : ""} (Alt+${hk})`} onClick={() => actions.setView(view)}>
      <Icon name={icon} />
      {count > 0 && <span className="count">{count > 99 ? "99+" : count}</span>}
      {isNew && <span className="new-dot" />}
    </button>
  );
}

export function confirmClose() {
  if (isDirty(getState()) && !window.confirm("Close this filter? Unsaved changes will be lost.")) return;
  actions.close();
  actions.setView(getState().settings.mode === "simple" ? "simple" : "rules");
}

/** Labeled tabs across the top of Simple mode, so every part of it is easy to find. */
function SimpleTabs() {
  const view = useStore((s) => s.view);
  const cat = useStore((s) => s.simpleCat);
  const seen = useStore((s) => s.seen);
  const lines = useStore((s) => s.doc?.lines);
  const mystery = view === "simple" && cat.startsWith("mys:");
  const tabs = [
    { id: "items", label: "Items", icon: "wand", on: view === "simple" && !mystery, go: () => { if (mystery) actions.setSimpleCat("runes"); actions.setView("simple"); } },
    {
      id: "mystery",
      label: "Mystery drops",
      icon: "gift",
      on: mystery,
      isNew: !seen.includes("mystery"),
      go: () => {
        const ms = lines ? readMysteries(lines) : [];
        actions.setSimpleCat(ms.length ? `mys:${ms[0].id}` : "mys:new");
        actions.setView("simple");
      },
    },
    { id: "preview", label: "Loot preview", icon: "eye", on: view === "preview", go: () => actions.setView("preview") },
    { id: "shop", label: "Shop hunting", icon: "spark", on: view === "shop", isNew: !seen.includes("shop"), go: () => actions.setView("shop") },
  ];
  return (
    <div className="simple-tabs">
      {tabs.map((t) => (
        <button key={t.id} className={t.on ? "on" : ""} onClick={t.go}>
          <Icon name={t.icon} size={15} /> {t.label}
          {t.isNew && !t.on && <span className="new-badge">NEW</span>}
        </button>
      ))}
    </div>
  );
}
