// Downloads every public launcher filter through the app's own launcher code into the stress corpus.
// Run: FF_STRESS_DIR=... GITHUB_TOKEN=... npx vitest run stress/download.test.ts
import { it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fetchAuthors, fetchAuthorFiles, fetchFilterBytes } from "../src/lib/launcher";

const DIR = process.env.FF_STRESS_DIR ?? "S:/pd2-filter-forge-build/stress/filters";

it.skipIf(!process.env.FF_STRESS_DIR)("downloads the launcher's public filters", async () => {
  const token = process.env.GITHUB_TOKEN;
  const real = globalThis.fetch;
  globalThis.fetch = ((url: string, init: RequestInit = {}) =>
    real(url, String(url).startsWith("https://api.github.com") && token ? { ...init, headers: { ...(init.headers as object), Authorization: `Bearer ${token}` } } : init)) as typeof fetch;
  const authors = await fetchAuthors();
  const index: { author: string; file: string; bytes: number }[] = [];
  for (const a of authors) {
    let files;
    try {
      files = await fetchAuthorFiles(a);
    } catch (e) {
      console.log(`! ${a.name}: ${(e as Error).message}`);
      continue;
    }
    for (const f of files) {
      const bytes = await fetchFilterBytes(f);
      const out = path.join(DIR, a.name.replace(/[^\w.-]+/g, "_"), f.name);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, bytes);
      index.push({ author: a.name, file: f.name, bytes: bytes.length });
    }
  }
  fs.writeFileSync(path.join(DIR, "index.json"), JSON.stringify(index, null, 1));
  console.log(`${authors.length} authors, ${index.length} filters, ${(index.reduce((n, x) => n + x.bytes, 0) / 1e6).toFixed(1)} MB`);
}, 600000);
