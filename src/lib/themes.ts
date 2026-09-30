// App themes. Each is a handful of base colors; the in-between shades (hover, borders, faint text…)
// are derived, so custom themes only need five colors and still look consistent.

export interface ThemeColors {
  bg: string;
  panel: string;
  text: string;
  accent: string;
  line: string;
}

export interface Theme {
  id: string;
  name: string;
  dark: boolean;
  colors: ThemeColors;
  /** Built-in themes may pin exact shades instead of derived ones. */
  exact?: Partial<Record<"bg2" | "panel2" | "line2" | "muted" | "faint" | "hover", string>>;
  custom?: boolean;
}

export const BUILTIN_THEMES: Theme[] = [
  {
    id: "sanctuary",
    name: "Sanctuary",
    dark: true,
    colors: { bg: "#0f0d10", panel: "#1a171c", text: "#ebe4d6", accent: "#d9a441", line: "#2e2830" },
    exact: { bg2: "#151216", panel2: "#221e24", line2: "#3b3440", muted: "#a1978c", faint: "#6c645c", hover: "#262129" },
  },
  {
    id: "midnight",
    name: "Midnight",
    dark: true,
    colors: { bg: "#0b0f14", panel: "#141a22", text: "#e3e9f1", accent: "#4a9de0", line: "#242d39" },
    exact: { bg2: "#10151c", panel2: "#1a212b", line2: "#303b4a", muted: "#93a1b3", faint: "#5f6d80", hover: "#1c2430" },
  },
  { id: "graphite", name: "Graphite", dark: true, colors: { bg: "#111214", panel: "#1a1c1f", text: "#e6e7e9", accent: "#9aa7b8", line: "#2a2d31" } },
  { id: "nord", name: "Nord", dark: true, colors: { bg: "#1e222a", panel: "#262b34", text: "#e5e9f0", accent: "#88c0d0", line: "#353c48" } },
  { id: "ember", name: "Ember", dark: true, colors: { bg: "#130c0b", panel: "#1e1412", text: "#f1e6e1", accent: "#e2583e", line: "#33221e" } },
  { id: "verdant", name: "Verdant", dark: true, colors: { bg: "#0c1310", panel: "#142019", text: "#e3efe8", accent: "#5fbf8a", line: "#223328" } },
  {
    id: "parchment",
    name: "Parchment",
    dark: false,
    colors: { bg: "#efe8da", panel: "#f8f3e8", text: "#2b241b", accent: "#b7791f", line: "#d8ccb4" },
    exact: { bg2: "#e7dfcf", panel2: "#efe7d7", line2: "#c8b995", muted: "#6d604d", faint: "#9c8e76", hover: "#ebe2cf" },
  },
  { id: "snow", name: "Snow", dark: false, colors: { bg: "#f3f5f8", panel: "#ffffff", text: "#1c2230", accent: "#3b6fd8", line: "#dde2ea" } },
];

const mix = (a: string, b: string, pct: number) => `color-mix(in srgb, ${a} ${pct}%, ${b})`;

/** Every CSS variable the app uses, for one theme. */
export function themeVars(t: Theme, accent?: string): Record<string, string> {
  const c = t.colors;
  const e = t.exact ?? {};
  return {
    "--bg": c.bg,
    "--bg2": e.bg2 ?? mix(c.panel, c.bg, 45),
    "--panel": c.panel,
    "--panel2": e.panel2 ?? mix(c.text, c.panel, 5),
    "--line": c.line,
    "--line2": e.line2 ?? mix(c.text, c.line, 12),
    "--text": c.text,
    "--muted": e.muted ?? mix(c.text, c.bg, 64),
    "--faint": e.faint ?? mix(c.text, c.bg, 42),
    "--hover": e.hover ?? mix(c.text, c.panel, 7),
    "--accent": accent || c.accent,
    "--sel": mix(accent || c.accent, c.panel, t.dark ? 16 : 22),
    "--err": t.dark ? "#ff6b6b" : "#c53030",
    "--warn": t.dark ? "#f2b84b" : "#b7791f",
    "--info": t.dark ? "#7fb2ff" : "#2b6cb0",
    "--ok": t.dark ? "#68d391" : "#2f855a",
    // Item previews always sit on a dark "ground", like in game.
    "--ground": "radial-gradient(ellipse at 30% 20%, #2a2418 0%, #15120d 55%, #0b0a08 100%)",
    "color-scheme": t.dark ? "dark" : "light",
  };
}

/** Is a hex color dark? Used to pick dark/light for custom themes. */
export function isDarkColor(hex: string): boolean {
  const m = hex.replace("#", "").match(/.{2}/g);
  if (!m) return true;
  const [r, g, b] = m.map((x) => parseInt(x, 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.5;
}

export function findTheme(id: string, custom: Theme[]): Theme {
  return custom.find((t) => t.id === id) ?? BUILTIN_THEMES.find((t) => t.id === id) ?? BUILTIN_THEMES[0];
}

/** Share a theme as a short code, and read one back. */
export function exportTheme(t: Theme): string {
  return `ffthemes:${btoa(JSON.stringify({ name: t.name, colors: t.colors }))}`;
}
export function importTheme(code: string): Theme | null {
  try {
    const body = code.trim().replace(/^ffthemes:/, "");
    const j = JSON.parse(atob(body));
    const hex = /^#[0-9a-f]{6}$/i;
    const keys: (keyof ThemeColors)[] = ["bg", "panel", "text", "accent", "line"];
    if (typeof j.name !== "string" || !keys.every((k) => hex.test(j.colors?.[k]))) return null;
    return { id: `custom-${Date.now().toString(36)}`, name: j.name.slice(0, 30), dark: isDarkColor(j.colors.bg), colors: j.colors, custom: true };
  } catch {
    return null;
  }
}
