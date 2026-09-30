import { actions, useStore, DEFAULT_SETTINGS } from "../state/store";
import { isDesktop } from "../lib/platform";
import { pd2Dir, saveAs } from "../state/files";
import { DATA } from "../lib/data";
import { UpdatesSettings } from "./Updates";

const ACCENTS = ["#d9a441", "#c7b377", "#e0603a", "#b04ad9", "#4a9de0", "#3fbf8a", "#e04a6a", "#9aa7b8"];

export function SettingsView() {
  const s = useStore((x) => x.settings);
  const set = actions.setSettings;
  const hasDoc = useStore((x) => !!x.doc);
  return (
    <div className="page">
      <h2>Settings</h2>
      <p className="lead">Saved on this computer.</p>
      <div className="settings-grid">
        <UpdatesSettings />
        <div className="divider" style={{ gridColumn: "1 / -1" }} />
        <span>Theme</span>
        <div className="seg">
          {(
            [
              ["sanctuary", "Sanctuary (dark)"],
              ["midnight", "Midnight"],
              ["parchment", "Parchment (light)"],
            ] as const
          ).map(([t, label]) => (
            <button key={t} className={s.theme === t ? "on" : ""} onClick={() => set({ theme: t })}>
              {label}
            </button>
          ))}
        </div>
        <span>Accent color</span>
        <div className="row">
          {ACCENTS.map((c) => (
            <button key={c} className={`swatch ${s.accent === c ? "on" : ""}`} style={{ background: c }} onClick={() => set({ accent: c })} />
          ))}
          <input type="color" value={s.accent} onChange={(e) => set({ accent: e.target.value })} style={{ width: 36, height: 26, border: 0, background: "transparent" }} />
        </div>
        <span>Density</span>
        <div className="seg">
          {(["comfortable", "compact"] as const).map((d) => (
            <button key={d} className={s.density === d ? "on" : ""} onClick={() => set({ density: d })}>
              {d[0].toUpperCase() + d.slice(1)}
            </button>
          ))}
        </div>
        <span>Text size</span>
        <div className="row">
          <input type="range" min={0.85} max={1.3} step={0.05} value={s.fontScale} onChange={(e) => set({ fontScale: Number(e.target.value) })} />
          <span className="small muted">{Math.round(s.fontScale * 100)}%</span>
        </div>
        <span>Show blank lines in the rule list</span>
        <button className={`switch ${s.showBlankLines ? "on" : ""}`} onClick={() => set({ showBlankLines: !s.showBlankLines })} />
        <span>Show engine-only keywords</span>
        <div className="row">
          <button className={`switch ${s.showUndocumented ? "on" : ""}`} onClick={() => set({ showUndocumented: !s.showUndocumented })} />
          <span className="help">Keywords PD2's engine supports that the wiki doesn't list yet (e.g. %LINE-xx%, %PERCENT%, GOODSK).</span>
        </div>

        <div className="divider" style={{ gridColumn: "1 / -1" }} />
        <span>ProjectD2 folder</span>
        <div className="row">
          <input className="input grow mono" value={s.pd2Dir} placeholder={isDesktop ? "Auto-detected" : "Desktop app only"} onChange={(e) => set({ pd2Dir: e.target.value })} />
          {isDesktop && (
            <button
              className="btn"
              onClick={async () => {
                set({ pd2Dir: "" });
                const d = await pd2Dir();
                actions.toast(d ? `Found ${d}` : "Couldn't find it automatically", d ? "ok" : "err");
              }}
            >
              Detect
            </button>
          )}
        </div>
        <span>Keep a .bak when overwriting</span>
        <button className={`switch ${s.backupOnSave ? "on" : ""}`} onClick={() => set({ backupOnSave: !s.backupOnSave })} />
        <span>Save encoding</span>
        <div className="row">
          <div className="seg">
            <button className={s.encoding === "utf8" ? "on" : ""} onClick={() => set({ encoding: "utf8" })}>
              UTF-8 (recommended)
            </button>
            <button className={s.encoding === "ansi" ? "on" : ""} onClick={() => set({ encoding: "ansi" })}>
              ANSI (pre-Season 13)
            </button>
          </div>
          <span className="help">Since Season 13 PD2 reads filters as UTF-8; ANSI only matters for older game versions.</span>
        </div>
        {hasDoc && (
          <>
            <span>Save a copy elsewhere</span>
            <div>
              <button className="btn" onClick={() => saveAs()}>
                Save as… <span className="kbd">Ctrl Shift S</span>
              </button>
            </div>
          </>
        )}
        <div className="divider" style={{ gridColumn: "1 / -1" }} />
        <span>Reset</span>
        <div>
          <button className="btn danger" onClick={() => set({ ...DEFAULT_SETTINGS, pd2Dir: s.pd2Dir })}>
            Restore default appearance
          </button>
        </div>
        <span>Game data</span>
        <span className="small muted">
          Built {new Date(DATA.meta.built).toLocaleString()} from {DATA.meta.source} (modified {new Date(DATA.meta.pd2dataModified).toLocaleDateString()}). After a PD2 patch, run <span className="mono">npm run data</span> to refresh.
        </span>
      </div>
    </div>
  );
}
