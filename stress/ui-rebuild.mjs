// Stress test through the real UI: for a sample of rules from several launcher filters, click
// New rule → Blank rule → Add rule, type the condition (Text mode), name and description, and flip
// "Continue" — exactly as a person would — then check PD2 reads the new rule like the original.
//
//   node stress/ui-rebuild.mjs <dev server url> <filters dir> [rules per filter]
// (Run from a folder where puppeteer-core is installed; the dev server must be running.)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";

const BASE = process.argv[2] ?? "http://localhost:1427/";
const DIR = process.argv[3];
const PER = Number(process.argv[4] ?? 12);
const EDGE = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find((p) => fs.existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const files = fs.readdirSync(DIR, { recursive: true }).map(String).filter((f) => f.endsWith(".filter")).sort();
// One filter per author keeps the sample varied.
const picked = [...new Map(files.map((f) => [f.split(/[\\/]/)[0], f])).values()];

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), "ff-ui-")), defaultViewport: { width: 1400, height: 900 } });
const page = await browser.newPage();
page.on("dialog", (d) => d.accept());
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

async function clickText(sel, text) {
  const ok = await page.evaluate((sel, text) => {
    const el = [...document.querySelectorAll(sel)].find((e) => e.textContent.trim().includes(text));
    if (el) el.click();
    return !!el;
  }, sel, text);
  if (!ok) throw new Error(`no ${sel} “${text}”`);
  await sleep(120);
}
async function typeInto(selector, text) {
  const el = await page.waitForSelector(selector, { timeout: 4000 });
  await el.click({ clickCount: 3 });
  await page.keyboard.down("Control");
  await page.keyboard.press("a");
  await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  await page.keyboard.type(text, { delay: 0 });
  await page.keyboard.press("Escape");
  await page.keyboard.press("Enter");
  await sleep(120);
}

const results = [];
for (const rel of picked) {
  const text = fs.readFileSync(path.join(DIR, rel), "latin1");
  await page.goto(`${BASE}?demo&blank&mode=advanced&view=rules`, { waitUntil: "domcontentloaded" });
  await sleep(1800);
  // Pick rules whose output uses only name, description and %CONTINUE% (no icons or sounds to set).
  const sample = await page.evaluate(async (text, per) => {
    const { parseFilter } = await import("/src/lib/document.ts");
    const { splitOutput } = await import("/src/lib/output.ts");
    const rules = parseFilter(text).lines.filter((l) => l.kind === "rule" && !l.disabled && (l.key ?? "").length < 220 && !/[\u0080-\uffff]/.test((l.key ?? "") + (l.value ?? "")));
    const ok = rules.filter((l) => {
      const p = splitOutput(l.value ?? "");
      const fx = Object.entries(p.effects).filter(([k, v]) => k !== "cont" && v != null && v !== false);
      return fx.length === 0;
    });
    const step = Math.max(1, Math.floor(ok.length / per));
    return ok.filter((_, i) => i % step === 0).slice(0, per).map((l) => ({ key: (l.key ?? "").trim(), value: l.value ?? "" }));
  }, text, PER);

  for (const r of sample) {
    try {
      await clickText("button", "New rule");
      await clickText(".dialog .seg button", "Blank rule");
      await clickText(".dialog button", "Add rule");
      await sleep(250);
      // Conditions in Text mode.
      await page.evaluate(() => [...document.querySelectorAll(".seg button")].find((b) => b.textContent.trim() === "Text")?.click());
      await sleep(150);
      await typeInto('input[placeholder="Empty = every item"]', r.key);
      const parts = await page.evaluate(async (v) => (await import("/src/lib/output.ts")).splitOutput(v), r.value);
      await typeInto('input[placeholder^="Empty hides the item"]', parts.name);
      if (parts.desc != null) {
        await page.click('button[title="Custom description"]');
        await sleep(150);
        await typeInto('input[placeholder^="%NAME% keeps"]', parts.desc);
      }
      if (parts.effects.cont) {
        await page.evaluate(() => {
          // The switch whose own row says "Continue to later rules".
          const row = [...document.querySelectorAll("label.row")].find((e) => e.textContent.includes("Continue to later rules"));
          row?.querySelector(":scope > .switch")?.click();
        });
        await sleep(150);
      }
      // Compare what PD2 would read.
      const verdict = await page.evaluate(async (orig) => {
        const { getState } = window.__ff;
        const { collectDefinitions } = await import("/src/lib/document.ts");
        const { compileCondition } = await import("/src/lib/conditions.ts");
        const { buildAction } = await import("/src/lib/output.ts");
        const s = getState();
        const l = s.doc.lines.find((x) => x.id === s.selected);
        const defs = collectDefinitions(s.doc.lines);
        const a = buildAction(orig.value, defs);
        const b = buildAction(l.value ?? "", defs);
        const sameOut = JSON.stringify([a.name, a.desc, a.effects]) === JSON.stringify([b.name, b.desc, b.effects]);
        const sameKey = (l.key ?? "").trim() === orig.key;
        const ca = compileCondition(orig.key, defs).bh;
        const cb = compileCondition(l.key ?? "", defs).bh;
        return { sameKey, sameOut, sameNever: ca.never === cb.never, got: `${l.key} => ${l.value}` };
      }, r);
      results.push({ file: rel, rule: `${r.key} => ${r.value}`.slice(0, 160), ...verdict });
    } catch (e) {
      results.push({ file: rel, rule: `${r.key} => ${r.value}`.slice(0, 160), error: String(e).slice(0, 200) });
      await page.keyboard.press("Escape");
    }
  }
  console.log(`${rel}: ${sample.length} rules`);
}
await browser.close();
const bad = results.filter((r) => r.error || !r.sameKey || !r.sameOut || !r.sameNever);
fs.writeFileSync(path.join(DIR, "..", "ui-report.json"), JSON.stringify({ total: results.length, bad, pageErrors: errors }, null, 1));
console.log(`UI rebuild: ${results.length} rules typed through the editor, ${bad.length} different, ${errors.length} page errors`);
for (const b of bad.slice(0, 15)) console.log(JSON.stringify(b));
