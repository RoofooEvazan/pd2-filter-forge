// Update check: compares this build's version with the latest GitHub release and offers the download.
// Releases are published at https://github.com/RoofooEvazan/pd2-filter-forge/releases.
import { useSyncExternalStore } from "react";

export const REPO = "RoofooEvazan/pd2-filter-forge";
export const RELEASES_URL = `https://github.com/${REPO}/releases`;
/** The download page and how-to guide (GitHub Pages). */
export const SITE_URL = "https://roofooevazan.github.io/pd2-filter-forge/";
export const APP_VERSION: string = __APP_VERSION__;

export interface Release {
  version: string;
  name: string;
  notes: string;
  url: string;
  published: string;
  /** Direct download for the installer and the portable exe, when attached. */
  installer?: string;
  portable?: string;
}

export interface UpdateState {
  status: "idle" | "checking" | "current" | "available" | "error";
  latest?: Release;
  error?: string;
  checkedAt?: number;
  /** Download-and-install progress for the available release. */
  install?: "downloading" | "failed";
  installError?: string;
}

/** Compare dotted versions ("v0.10.1" > "0.9.3"); pre-release suffixes sort before the release. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const [core, pre] = v.replace(/^v/i, "").split("-", 2);
    return { nums: core.split(".").map((n) => Number.parseInt(n, 10) || 0), pre };
  };
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < Math.max(x.nums.length, y.nums.length); i++) {
    const d = (x.nums[i] ?? 0) - (y.nums[i] ?? 0);
    if (d) return Math.sign(d);
  }
  if (x.pre && !y.pre) return -1;
  if (!x.pre && y.pre) return 1;
  return (x.pre ?? "").localeCompare(y.pre ?? "");
}

let state: UpdateState = { status: "idle" };
const listeners = new Set<() => void>();
const set = (s: UpdateState) => {
  state = s;
  listeners.forEach((f) => f());
};

export function useUpdate(): UpdateState {
  return useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    () => state
  );
}

const LAST_CHECK = "ff.update.lastCheck";
const DISMISSED = "ff.update.dismissed";

export async function checkForUpdates(): Promise<UpdateState> {
  set({ ...state, status: "checking" });
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: "application/vnd.github+json" } });
    if (r.status === 404) {
      set({ status: "current", checkedAt: Date.now() });
      return state;
    }
    if (!r.ok) throw new Error(`GitHub answered ${r.status}`);
    const j = await r.json();
    const assets: { name: string; browser_download_url: string }[] = j.assets ?? [];
    const latest: Release = {
      version: String(j.tag_name ?? "").replace(/^v/i, ""),
      name: j.name || j.tag_name,
      notes: j.body ?? "",
      url: j.html_url ?? RELEASES_URL,
      published: j.published_at ?? "",
      installer: assets.find((a) => /setup\.exe$/i.test(a.name))?.browser_download_url,
      portable: assets.find((a) => /portable.*\.exe$/i.test(a.name))?.browser_download_url,
    };
    try {
      localStorage.setItem(LAST_CHECK, String(Date.now()));
    } catch {
      /* storage unavailable */
    }
    set({ status: compareVersions(latest.version, APP_VERSION) > 0 ? "available" : "current", latest, checkedAt: Date.now() });
  } catch (e) {
    set({ status: "error", error: e instanceof Error ? e.message : String(e), checkedAt: Date.now() });
  }
  return state;
}

/**
 * Download the new installer and run it. The installer shows a progress bar, closes this app,
 * updates it in place and starts it again. In a browser it just opens the download.
 */
export async function installUpdate(): Promise<void> {
  const r = state.latest;
  if (!r) return;
  const { isDesktop, openExternal } = await import("./platform");
  if (!isDesktop || !r.installer) {
    await openExternal(r.installer ?? r.url);
    return;
  }
  set({ ...state, install: "downloading", installError: undefined });
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("install_update", { url: r.installer });
    // The app quits once the installer has started.
  } catch (e) {
    set({ ...state, install: "failed", installError: e instanceof Error ? e.message : String(e) });
  }
}

/** Launch-time check, at most every 6 hours. */
export function checkOnLaunch() {
  let last = 0;
  try {
    last = Number(localStorage.getItem(LAST_CHECK) ?? 0);
  } catch {
    /* storage unavailable */
  }
  if (Date.now() - last > 6 * 3600_000) void checkForUpdates();
}

export function isDismissed(version: string): boolean {
  try {
    return localStorage.getItem(DISMISSED) === version;
  } catch {
    return false;
  }
}
export function dismiss(version: string) {
  try {
    localStorage.setItem(DISMISSED, version);
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((f) => f());
}
