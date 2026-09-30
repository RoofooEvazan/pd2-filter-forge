// The public filter list the PD2 launcher shows ("Item Filter Profiles"). The launcher reads
// Project-Diablo-2/LootFilters/filters.json, then each author's GitHub contents API URL.
export const REGISTRY_URL = "https://raw.githubusercontent.com/Project-Diablo-2/LootFilters/main/filters.json";

export interface Author {
  name: string;
  url: string;
  author: string;
}
export interface RemoteFile {
  name: string;
  size: number;
  download_url: string;
  html_url: string;
  path: string;
}

const TTL = 60 * 60 * 1000; // GitHub allows 60 unauthenticated API calls an hour; cache for one.

async function cachedJson<T>(url: string): Promise<T> {
  const key = `ff.cache:${url}`;
  try {
    const hit = JSON.parse(localStorage.getItem(key) ?? "null");
    if (hit && Date.now() - hit.t < TTL) return hit.v as T;
  } catch {
    /* ignore bad cache */
  }
  const res = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
  if (res.status === 403) throw new Error("GitHub's hourly limit for anonymous requests was reached. Try again later, or use a filter already in your PD2 folder.");
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  const v = (await res.json()) as T;
  try {
    localStorage.setItem(key, JSON.stringify({ t: Date.now(), v }));
  } catch {
    /* storage full: skip caching */
  }
  return v;
}

export function fetchAuthors(): Promise<Author[]> {
  return cachedJson<Author[]>(REGISTRY_URL);
}

export async function fetchAuthorFiles(a: Author): Promise<RemoteFile[]> {
  const list = await cachedJson<RemoteFile[] | { message: string }>(a.url);
  if (!Array.isArray(list)) throw new Error((list as { message: string }).message ?? "Unexpected response");
  return list.filter((f) => f.name.toLowerCase().endsWith(".filter")).sort((x, y) => x.name.localeCompare(y.name));
}

export async function fetchFilterBytes(f: RemoteFile): Promise<Uint8Array> {
  const res = await fetch(f.download_url);
  if (!res.ok) throw new Error(`${res.status} downloading ${f.name}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** github.com page for an author entry, for the "Author page" link. */
export function authorPage(a: Author) {
  const m = a.url.match(/repos\/([^/]+)\/([^/]+)\/contents\/?(.*)$/);
  if (!m) return a.url;
  return `https://github.com/${m[1]}/${m[2]}${m[3] ? `/tree/HEAD/${m[3]}` : ""}`;
}
