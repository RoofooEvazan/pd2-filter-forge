// Theme gallery (built-in + your own) and the custom theme builder.
import { useState } from "react";
import { actions, useStore } from "../state/store";
import { BUILTIN_THEMES, exportTheme, findTheme, importTheme, isDarkColor, type Theme, type ThemeColors } from "../lib/themes";
import { Icon } from "./icons";

function Swatch({ t }: { t: Theme }) {
  const c = t.colors;
  return (
    <span className="theme-mini" style={{ background: c.bg, borderColor: c.line }}>
      <span className="theme-mini-rail" style={{ background: c.panel }} />
      <span className="theme-mini-body">
        <span style={{ background: c.panel, borderColor: c.line }}>
          <i style={{ background: c.text }} />
          <i style={{ background: c.text, opacity: 0.45, width: "60%" }} />
        </span>
        <b style={{ background: c.accent }} />
      </span>
    </span>
  );
}

export function ThemePicker() {
  const s = useStore((x) => x.settings);
  const custom = s.customThemes ?? [];
  const [editing, setEditing] = useState<Theme | null>(null);
  const [code, setCode] = useState("");
  const pick = (t: Theme) => actions.setSettings({ theme: t.id, accent: t.colors.accent });
  const start = () => {
    const base = findTheme(s.theme, custom);
    setEditing({ id: `custom-${Date.now().toString(36)}`, name: "My theme", dark: base.dark, colors: { ...base.colors, accent: s.accent || base.colors.accent }, custom: true });
  };
  const saveCustom = (t: Theme) => {
    const next = custom.some((x) => x.id === t.id) ? custom.map((x) => (x.id === t.id ? t : x)) : [...custom, t];
    actions.setSettings({ customThemes: next, theme: t.id, accent: t.colors.accent });
    setEditing(null);
  };
  const remove = (t: Theme) => actions.setSettings({ customThemes: custom.filter((x) => x.id !== t.id), ...(s.theme === t.id ? { theme: "sanctuary", accent: "#d9a441" } : {}) });

  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="theme-grid">
        {[...BUILTIN_THEMES, ...custom].map((t) => (
          <div key={t.id} className={`theme-card ${s.theme === t.id ? "on" : ""}`}>
            <button className="theme-card-main" onClick={() => pick(t)}>
              <Swatch t={t} />
              <span className="row" style={{ gap: 6 }}>
                <b>{t.name}</b>
                <span className="small faint">{t.dark ? "dark" : "light"}</span>
              </span>
            </button>
            {t.custom && (
              <span className="theme-card-tools">
                <button className="btn sm icon ghost" title="Edit" onClick={() => setEditing(t)}>
                  <Icon name="settings" size={13} />
                </button>
                <button
                  className="btn sm icon ghost"
                  title="Copy a share code for this theme"
                  onClick={() => {
                    void navigator.clipboard.writeText(exportTheme(t));
                    actions.toast(`Copied a share code for “${t.name}”.`);
                  }}
                >
                  <Icon name="copy" size={13} />
                </button>
                <button className="btn sm icon ghost danger" title="Delete" onClick={() => remove(t)}>
                  <Icon name="trash" size={13} />
                </button>
              </span>
            )}
          </div>
        ))}
        <button className="theme-card theme-new" onClick={start}>
          <Icon name="plus" size={20} />
          <b>Make your own</b>
          <span className="small muted">Starts from the current theme</span>
        </button>
      </div>
      <div className="row small">
        <input className="input grow" placeholder="Paste a theme share code (ffthemes:…) to add it" value={code} onChange={(e) => setCode(e.target.value)} />
        <button
          className="btn sm"
          disabled={!code.trim()}
          onClick={() => {
            const t = importTheme(code);
            if (!t) return actions.toast("That isn't a valid theme code.", "err");
            actions.setSettings({ customThemes: [...custom, t], theme: t.id, accent: t.colors.accent });
            setCode("");
            actions.toast(`Added “${t.name}”.`);
          }}
        >
          Add theme
        </button>
      </div>
      {editing && <ThemeEditor initial={editing} onCancel={() => setEditing(null)} onSave={saveCustom} />}
    </div>
  );
}

const FIELDS: { key: keyof ThemeColors; label: string; hint: string }[] = [
  { key: "bg", label: "Background", hint: "Behind everything" },
  { key: "panel", label: "Panels", hint: "Cards, lists and the top bar" },
  { key: "text", label: "Text", hint: "Main text; muted text is derived from it" },
  { key: "accent", label: "Accent", hint: "Buttons, selections and highlights" },
  { key: "line", label: "Lines", hint: "Borders and dividers" },
];

function ThemeEditor({ initial, onCancel, onSave }: { initial: Theme; onCancel: () => void; onSave: (t: Theme) => void }) {
  const [t, setT] = useState(initial);
  const theme = useStore((x) => x.settings.theme);
  const accent = useStore((x) => x.settings.accent);
  const [before] = useState({ theme, accent });
  // Preview live by applying it as a temporary custom theme; Cancel restores the previous one.
  const preview = (next: Theme) => {
    setT(next);
    actions.previewTheme(next);
  };
  const setColor = (k: keyof ThemeColors, v: string) => preview({ ...t, colors: { ...t.colors, [k]: v }, dark: k === "bg" ? isDarkColor(v) : t.dark });
  return (
    <>
      <div
        className="scrim"
        onClick={() => {
          actions.previewTheme(null);
          actions.setSettings(before);
          onCancel();
        }}
      />
      <div className="dialog" style={{ width: "min(560px, 94vw)" }}>
        <div className="dialog-head">
          <Icon name="settings" />
          <h2>{initial.custom && initial.name !== "My theme" ? `Edit “${initial.name}”` : "Make your own theme"}</h2>
        </div>
        <div className="dialog-body">
          <label className="field">
            <span className="label">Name</span>
            <input className="input" maxLength={30} value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} />
          </label>
          {FIELDS.map((f) => (
            <label key={f.key} className="row theme-field">
              <input type="color" value={t.colors[f.key]} onChange={(e) => setColor(f.key, e.target.value)} />
              <span className="grow">
                <b>{f.label}</b>
                <span className="small muted"> — {f.hint}</span>
              </span>
              <span className="mono small faint">{t.colors[f.key]}</span>
            </label>
          ))}
          <div className="small faint">The whole app updates as you pick colors. Everything else (hover, faint text, borders) is worked out from these five.</div>
        </div>
        <div className="dialog-foot">
          <button
            className="btn"
            onClick={() => {
              actions.previewTheme(null);
              actions.setSettings(before);
              onCancel();
            }}
          >
            Cancel
          </button>
          <button
            className="btn primary"
            onClick={() => {
              actions.previewTheme(null);
              onSave({ ...t, name: t.name.trim() || "My theme" });
            }}
          >
            Save theme
          </button>
        </div>
      </div>
    </>
  );
}
