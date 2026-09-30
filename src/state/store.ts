// App state: the open filter, selection, undo history and settings. A tiny external store read
// through useSyncExternalStore, so components subscribe to just the slice they use.
import { useSyncExternalStore } from "react";
import { editLine, parseFilter, serializeFilter, type FilterDoc, type Line } from "../lib/document";
import { DEFAULT_CTX, makeItem, type TestItem, type ViewContext } from "../lib/item";
import type { Encoding } from "../lib/platform";

export type View = "simple" | "preview" | "shop" | "rules" | "lab" | "definitions" | "problems" | "codex" | "source" | "settings";
export type Mode = "simple" | "advanced";

export interface Settings {
  mode: Mode;
  /** Rule list rows show plain words or filter code. */
  ruleText: "plain" | "code";
  theme: "sanctuary" | "midnight" | "parchment";
  accent: string;
  density: "comfortable" | "compact";
  fontScale: number;
  pd2Dir: string;
  backupOnSave: boolean;
  encoding: Encoding;
  showUndocumented: boolean;
  showBlankLines: boolean;
  confirmDelete: boolean;
  /** Problem checks the user turned off. */
  disabledChecks: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  mode: "simple",
  ruleText: "plain",
  theme: "sanctuary",
  accent: "#d9a441",
  density: "comfortable",
  fontScale: 1,
  pd2Dir: "",
  backupOnSave: true,
  encoding: "utf8",
  showUndocumented: true,
  showBlankLines: false,
  confirmDelete: false,
  disabledChecks: [],
};

export interface OpenFile {
  name: string;
  /** Absolute path in the desktop app; undefined for new or browser-opened files. */
  path?: string;
  /** Where it came from, shown on the home screen (e.g. "Launcher · Kryszard"). */
  origin: string;
  /** The lines array as last saved; undo back to it and the file is clean again. */
  savedLines: Line[];
}

export interface State {
  doc: FilterDoc | null;
  file: OpenFile | null;
  view: View;
  selected: string | null;
  /** Lines to scroll into view on next render. */
  reveal: { id: string; n: number } | null;
  past: Line[][];
  future: Line[][];
  settings: Settings;
  testItem: TestItem;
  ctx: ViewContext;
  toast: { msg: string; kind: "ok" | "err" | "info"; n: number } | null;
  palette: boolean;
  /** Open Discord post dialog, if any. */
  discord: "help" | "share" | null;
  /** Simple mode sidebar selection: a catalog category, "changes", or "mys:<id>" / "mys:new". */
  simpleCat: string;
  /** Features the user has opened at least once (hides their NEW badges). */
  seen: string[];
  recent: { name: string; path: string; t: number }[];
  /** Facts about the file as loaded, for file-level checks. */
  fileFacts: { bom: boolean; nonUtf8: boolean };
  /** Engine reference section to show in the Codex. */
  refAnchor: { id: string; n: number } | null;
  /** Results of the (slow) deep checks, tied to the lines they were run on. */
  deep: { forLines: Line[] | null; issues: import("../lib/lint").Issue[]; done: number; total: number; running: boolean };
}

const load = <T,>(k: string, d: T): T => {
  try {
    const v = localStorage.getItem(k);
    return v ? { ...d, ...JSON.parse(v) } : d;
  } catch {
    return d;
  }
};
const loadArr = <T,>(k: string): T[] => {
  try {
    return JSON.parse(localStorage.getItem(k) ?? "[]");
  } catch {
    return [];
  }
};

/** One-time upgrades of saved settings. v2: PD2 reads UTF-8 since Season 13, so ANSI is no longer the default. */
function migrateSettings(s: Settings & { v?: number }): Settings {
  if ((s.v ?? 1) < 2) {
    s = { ...s, encoding: "utf8", v: 2 } as Settings & { v: number };
    try {
      localStorage.setItem("ff.settings", JSON.stringify(s));
    } catch {
      /* ignore */
    }
  }
  return s;
}

let state: State = {
  doc: null,
  file: null,
  view: load("ff.settings", DEFAULT_SETTINGS).mode === "advanced" ? "rules" : "simple",
  selected: null,
  reveal: null,
  past: [],
  future: [],
  settings: migrateSettings(load("ff.settings", DEFAULT_SETTINGS)),
  testItem: makeItem("r30"),
  ctx: load("ff.ctx", DEFAULT_CTX),
  toast: null,
  palette: false,
  discord: null,
  simpleCat: "runes",
  seen: loadArr<string>("ff.seen"),
  recent: loadArr("ff.recent"),
  fileFacts: { bom: false, nonUtf8: false },
  refAnchor: null,
  deep: { forLines: null, issues: [], done: 0, total: 0, running: false },
};

const subs = new Set<() => void>();
export const getState = () => state;
function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  subs.forEach((f) => f());
}
export function subscribe(f: () => void) {
  subs.add(f);
  return () => subs.delete(f);
}
export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => sel(state));
}

// ---------------------------------------------------------------- document edits

const MAX_UNDO = 300;
function commit(lines: Line[], extra: Partial<State> = {}) {
  if (!state.doc) return;
  set({
    doc: { ...state.doc, lines },
    past: [...state.past.slice(-MAX_UNDO + 1), state.doc.lines],
    future: [],
    ...extra,
  });
}

export const actions = {
  openText(text: string, file: Omit<OpenFile, "savedLines">, dirty = false, nonUtf8 = false) {
    const doc = parseFilter(text);
    set({ fileFacts: { bom: !!doc.bom, nonUtf8 } });
    const firstRule = doc.lines.find((l) => l.kind === "rule");
    set({ doc, file: { ...file, savedLines: dirty ? [] : doc.lines }, past: [], future: [], selected: firstRule?.id ?? null, view: state.settings.mode === "simple" ? "simple" : "rules" });
    if (file.path) {
      const recent = [{ name: file.name, path: file.path, t: Date.now() }, ...state.recent.filter((r) => r.path !== file.path)].slice(0, 8);
      set({ recent });
      try {
        localStorage.setItem("ff.recent", JSON.stringify(recent));
      } catch {
        /* ignore */
      }
    }
  },
  close() {
    set({ doc: null, file: null, selected: null, past: [], future: [] });
    clearDraft();
  },
  markSaved(patch: Partial<OpenFile>) {
    if (!state.doc || !state.file) return;
    set({ file: { ...state.file, ...patch, savedLines: state.doc.lines } });
  },
  setView(view: View) {
    set({ view });
  },
  /** Open the engine reference at a section (Advanced mode Codex). */
  openReference(id: string) {
    if (state.settings.mode !== "advanced") actions.setSettings({ mode: "advanced" });
    set({ view: "codex", refAnchor: { id, n: Date.now() } });
  },
  setDeep(patch: Partial<State["deep"]>) {
    set({ deep: { ...state.deep, ...patch } });
  },
  setMode(mode: Mode) {
    actions.setSettings({ mode });
    const v = state.view;
    if (mode === "simple" && !["simple", "preview", "shop", "settings"].includes(v)) set({ view: "simple" });
    if (mode === "advanced" && (v === "simple" || v === "preview")) set({ view: v === "preview" ? "lab" : "rules" });
  },
  select(id: string | null, reveal = false) {
    set({ selected: id, ...(reveal && id ? { reveal: { id, n: Date.now() } } : {}) });
  },
  goTo(id: string) {
    // Jumping to a rule is an Advanced mode action.
    if (state.settings.mode !== "advanced") actions.setSettings({ mode: "advanced" });
    set({ view: "rules", selected: id, reveal: { id, n: Date.now() } });
  },
  updateLine(id: string, patch: Partial<Line>) {
    if (!state.doc) return;
    commit(state.doc.lines.map((l) => (l.id === id ? editLine(l, patch) : l)));
  },
  replaceLine(id: string, next: Line) {
    if (!state.doc) return;
    commit(state.doc.lines.map((l) => (l.id === id ? next : l)));
  },
  insertAfter(id: string | null, lines: Line[], select = true) {
    if (!state.doc) return;
    const all = state.doc.lines;
    let i = id ? all.findIndex((l) => l.id === id) : all.length - 1;
    if (i < 0) i = all.length - 1;
    const next = [...all.slice(0, i + 1), ...lines, ...all.slice(i + 1)];
    const first = lines.find((l) => l.kind === "rule") ?? lines[0];
    commit(next, select && first ? { selected: first.id, reveal: { id: first.id, n: Date.now() } } : {});
  },
  insertAt(index: number, lines: Line[]) {
    if (!state.doc) return;
    const all = state.doc.lines;
    commit([...all.slice(0, index), ...lines, ...all.slice(index)], { selected: lines[0]?.id ?? null, reveal: lines[0] ? { id: lines[0].id, n: Date.now() } : null });
  },
  remove(ids: string[]) {
    if (!state.doc) return;
    const set_ = new Set(ids);
    const all = state.doc.lines;
    const idx = all.findIndex((l) => set_.has(l.id));
    const next = all.filter((l) => !set_.has(l.id));
    const neighbour = next.slice(Math.max(0, idx)).find((l) => l.kind === "rule") ?? next[idx - 1];
    commit(next, { selected: neighbour?.id ?? null });
  },
  move(id: string, delta: number) {
    if (!state.doc) return;
    const all = [...state.doc.lines];
    const i = all.findIndex((l) => l.id === id);
    if (i < 0) return;
    // Skip over blank lines so a move always passes a visible line.
    let j = i + delta;
    while (j > 0 && j < all.length - 1 && all[j].kind === "blank") j += Math.sign(delta);
    if (j < 0 || j >= all.length) return;
    const [l] = all.splice(i, 1);
    all.splice(j, 0, l);
    commit(all, { reveal: { id, n: Date.now() } });
  },
  setLines(lines: Line[]) {
    commit(lines);
  },
  undo() {
    if (!state.doc || !state.past.length) return;
    const prev = state.past[state.past.length - 1];
    set({ doc: { ...state.doc, lines: prev }, past: state.past.slice(0, -1), future: [state.doc.lines, ...state.future] });
  },
  redo() {
    if (!state.doc || !state.future.length) return;
    const [next, ...rest] = state.future;
    set({ doc: { ...state.doc, lines: next }, past: [...state.past, state.doc.lines], future: rest });
  },
  setSettings(patch: Partial<Settings>) {
    const settings = { ...state.settings, ...patch };
    set({ settings });
    try {
      localStorage.setItem("ff.settings", JSON.stringify(settings));
    } catch {
      /* ignore */
    }
  },
  setTestItem(patch: Partial<TestItem>) {
    set({ testItem: { ...state.testItem, ...patch } });
  },
  replaceTestItem(it: TestItem) {
    set({ testItem: it });
  },
  setCtx(patch: Partial<ViewContext>) {
    const ctx = { ...state.ctx, ...patch };
    set({ ctx });
    try {
      localStorage.setItem("ff.ctx", JSON.stringify(ctx));
    } catch {
      /* ignore */
    }
  },
  toast(msg: string, kind: "ok" | "err" | "info" = "ok") {
    const n = Date.now();
    set({ toast: { msg, kind, n } });
    setTimeout(() => {
      if (state.toast?.n === n) set({ toast: null });
    }, kind === "err" ? 7000 : 3500);
  },
  setPalette(open: boolean) {
    set({ palette: open });
  },
  openDiscord(kind: "help" | "share" | null) {
    set({ discord: kind });
  },
  setSimpleCat(cat: string) {
    set({ simpleCat: cat });
  },
  markSeen(feature: string) {
    if (state.seen.includes(feature)) return;
    const seen = [...state.seen, feature];
    set({ seen });
    try {
      localStorage.setItem("ff.seen", JSON.stringify(seen));
    } catch {
      /* storage unavailable */
    }
  },
};

export function isDirty(s: State) {
  return !!s.doc && !!s.file && s.doc.lines !== s.file.savedLines;
}

// ---------------------------------------------------------------- draft autosave
// The open filter is mirrored to local storage a moment after each change, so a crash or an
// accidental close never loses work. Home offers to resume it.

export interface Draft {
  name: string;
  path?: string;
  origin: string;
  text: string;
  t: number;
  dirty: boolean;
}
const DRAFT_KEY = "ff.draft";
let draftTimer: ReturnType<typeof setTimeout> | undefined;
let lastLines: Line[] | null = null;
subscribe(() => {
  const s = state;
  if (!s.doc || !s.file || s.doc.lines === lastLines) return;
  lastLines = s.doc.lines;
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    if (!state.doc || !state.file) return;
    const d: Draft = { name: state.file.name, path: state.file.path, origin: state.file.origin, text: serializeFilter(state.doc), t: Date.now(), dirty: isDirty(state) };
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    } catch {
      /* too big for storage: skip */
    }
  }, 800);
});

export function loadDraft(): Draft | null {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null");
  } catch {
    return null;
  }
}
export function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}
