// File access. In the desktop build this goes through small Rust commands (see src-tauri); in a
// plain browser it falls back to file pickers and downloads so the app still works for testing.
import { invoke } from "@tauri-apps/api/core";

export const isDesktop = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export interface DirEntry {
  name: string;
  path: string;
  size: number;
  modified: number;
  isFile: boolean;
}

export type Encoding = "ansi" | "utf8";

/** Decode filter bytes: UTF-8 when valid (what PD2 reads since Season 13), else Windows-1252. */
export function decodeFilter(bytes: Uint8Array): { text: string; valid: boolean } {
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), valid: true };
  } catch {
    return { text: new TextDecoder("windows-1252").decode(bytes), valid: false };
  }
}

const CP1252_EXTRA: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89,
  0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95,
  0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};

export function encodeFilter(text: string, encoding: Encoding): Uint8Array {
  if (encoding === "utf8") return new TextEncoder().encode(text);
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    out[i] = c < 0x100 ? c : CP1252_EXTRA[c] ?? 0x3f; // "?" for characters ANSI can't hold
  }
  return out;
}

// ---------------------------------------------------------------- desktop commands

export async function detectPd2Dir(): Promise<string | null> {
  if (!isDesktop) return null;
  return invoke<string | null>("detect_pd2_dir");
}

export async function listDir(path: string): Promise<DirEntry[]> {
  if (!isDesktop) return [];
  return invoke<DirEntry[]>("list_dir", { path });
}

export async function readFileBytes(path: string): Promise<Uint8Array> {
  const data = await invoke<number[]>("read_file", { path });
  return new Uint8Array(data);
}

export async function writeFileBytes(path: string, bytes: Uint8Array, backup: boolean): Promise<string | null> {
  return invoke<string | null>("write_file", { path, data: Array.from(bytes), backup });
}

export async function pickOpenPath(): Promise<string | null> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const r = await open({ multiple: false, filters: [{ name: "Loot filter", extensions: ["filter", "txt"] }] });
  return typeof r === "string" ? r : null;
}

export async function pickSavePath(defaultPath?: string, filter = { name: "Loot filter", extensions: ["filter"] }): Promise<string | null> {
  const { save } = await import("@tauri-apps/plugin-dialog");
  return (await save({ defaultPath, filters: [filter] })) ?? null;
}

// ---------------------------------------------------------------- browser fallbacks

export function browserOpenFile(): Promise<{ name: string; bytes: Uint8Array } | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".filter,.txt";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      resolve({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) });
    };
    input.click();
  });
}

export function browserDownload(name: string, bytes: Uint8Array) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function joinPath(dir: string, name: string) {
  return dir.replace(/[\\/]+$/, "") + "\\" + name;
}
export function baseName(p: string) {
  return p.split(/[\\/]/).pop() ?? p;
}

/** Open a web page in the user's browser (the desktop webview can't follow target=_blank links). */
export async function openExternal(url: string) {
  if (!isDesktop) {
    window.open(url, "_blank", "noopener");
    return;
  }
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } catch (e) {
    // Never fail silently: hand the link over so it can be pasted into a browser.
    await navigator.clipboard.writeText(url).catch(() => {});
    const { actions } = await import("../state/store");
    actions.toast(`Couldn't open the link (${e instanceof Error ? e.message : String(e)}). It's been copied — paste it into your browser.`, "err");
  }
}
