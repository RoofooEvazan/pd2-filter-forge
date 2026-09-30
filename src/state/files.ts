// Opening and saving filters, shared by the home screen, top bar and command palette.
import { serializeFilter } from "../lib/document";
import {
  baseName,
  browserDownload,
  browserOpenFile,
  decodeFilter,
  detectPd2Dir,
  encodeFilter,
  isDesktop,
  joinPath,
  pickOpenPath,
  pickSavePath,
  readFileBytes,
  writeFileBytes,
} from "../lib/platform";
import { actions, getState } from "./store";

export function openBytes(name: string, bytes: Uint8Array, origin: string, path?: string, asCopy = false) {
  const { text, valid } = decodeFilter(bytes);
  actions.openText(text, { name, path: asCopy ? undefined : path, origin }, asCopy, !valid);
}

export async function openPath(path: string, origin = "Your PD2 folder") {
  try {
    openBytes(baseName(path), await readFileBytes(path), origin, path);
  } catch (e) {
    actions.toast(`Couldn't open ${path}: ${e}`, "err");
  }
}

export async function openDialog() {
  if (isDesktop) {
    const p = await pickOpenPath();
    if (p) await openPath(p, "Opened file");
  } else {
    const f = await browserOpenFile();
    if (f) openBytes(f.name, f.bytes, "Opened file");
  }
}

export async function pd2Dir(): Promise<string | null> {
  const s = getState().settings;
  if (s.pd2Dir) return s.pd2Dir;
  const d = await detectPd2Dir();
  if (d) actions.setSettings({ pd2Dir: d });
  return d;
}

function currentBytes() {
  const { doc, settings } = getState();
  return encodeFilter(serializeFilter(doc!), settings.encoding);
}

export async function save(): Promise<boolean> {
  const { doc, file, settings } = getState();
  if (!doc || !file) return false;
  if (!isDesktop) {
    browserDownload(file.name.endsWith(".filter") ? file.name : `${file.name}.filter`, currentBytes());
    actions.markSaved({});
    return true;
  }
  if (!file.path) return saveAs();
  try {
    const backup = await writeFileBytes(file.path, currentBytes(), settings.backupOnSave);
    actions.markSaved({});
    actions.toast(`Saved ${file.name}${backup ? " (previous version kept as .bak)" : ""}`);
    return true;
  } catch (e) {
    actions.toast(`Couldn't save: ${e}`, "err");
    return false;
  }
}

export async function saveAs(): Promise<boolean> {
  const { file } = getState();
  if (!file) return false;
  if (!isDesktop) return save();
  const dir = await pd2Dir();
  const suggested = dir ? joinPath(joinPath(dir, "filters\\local"), safeName(file.name)) : safeName(file.name);
  const p = await pickSavePath(suggested);
  if (!p) return false;
  try {
    await writeFileBytes(p, currentBytes(), getState().settings.backupOnSave);
    actions.markSaved({ path: p, name: baseName(p), origin: "Your files" });
    actions.toast(`Saved ${baseName(p)}`);
    return true;
  } catch (e) {
    actions.toast(`Couldn't save: ${e}`, "err");
    return false;
  }
}

/** Save straight into ProjectD2\filters\local so the launcher's "Local Filter" list shows it. */
export async function installToPd2(): Promise<boolean> {
  const { file } = getState();
  if (!file) return false;
  if (!isDesktop) return save();
  const dir = await pd2Dir();
  if (!dir) {
    actions.toast("Couldn't find your ProjectD2 folder. Set it in Settings.", "err");
    return false;
  }
  const p = joinPath(joinPath(dir, "filters\\local"), safeName(file.name));
  try {
    await writeFileBytes(p, currentBytes(), getState().settings.backupOnSave);
    actions.markSaved({ path: p, name: baseName(p), origin: "Your PD2 folder" });
    actions.toast(`Installed as ${baseName(p)}. In the launcher pick Item Filter Profiles → Local Filter, then press Numpad 0 in-game to reload.`, "info");
    return true;
  } catch (e) {
    actions.toast(`Couldn't write to the PD2 folder: ${e}`, "err");
    return false;
  }
}

export function safeName(name: string) {
  const n = name.replace(/[<>:"/\\|?*]+/g, "").trim() || "My Filter";
  return n.toLowerCase().endsWith(".filter") ? n : `${n}.filter`;
}

/**
 * PD2's drop sounds, read from the player's own install (ProjectD2\data\global\sfx\pd2\dropsounds)
 * so they don't have to ship with the app. A plain browser can't read them, so it stays silent.
 */
const soundCache = new Map<string, string>();
export async function soundUrl(name: string): Promise<string | null> {
  if (!isDesktop) return null;
  const hit = soundCache.get(name);
  if (hit) return hit;
  const dir = await pd2Dir();
  if (!dir) return null;
  try {
    const bytes = await readFileBytes(joinPath(dir, ["data", "global", "sfx", "pd2", "dropsounds", name].join("\\")));
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "audio/wav" }));
    soundCache.set(name, url);
    return url;
  } catch {
    return null;
  }
}
