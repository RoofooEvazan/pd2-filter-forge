// Captures the how-to guide's screenshots and GIFs from the running dev server (npm run dev),
// using Microsoft Edge in headless mode. Output: public/guide/*.jpg|gif.
//
//   node scripts/capture-guide.mjs [http://localhost:1427/]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { PNG } from "pngjs";
import gifenc from "gifenc";

const { GIFEncoder, quantize, applyPalette } = gifenc;
const BASE = process.argv[2] ?? "http://localhost:1427/";
const OUT = path.resolve(process.env.FF_OUT ?? "public/guide");
const EDGE = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find((p) => fs.existsSync(p));
const W = 1280;
const H = 760;
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), "ff-capture-")),
  args: ["--no-first-run", "--hide-scrollbars", "--force-color-profile=srgb"],
  defaultViewport: { width: W, height: H, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
// Unsaved edits trigger "leave this page?"; always leave.
page.on("dialog", (d) => d.accept());

async function open(params) {
  await page.goto(`${BASE}?demo&${params}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(2200);
}
async function shot(name) {
  await page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: "jpeg", quality: 84 });
  console.log("saved", name);
}
/** Click the first element matching `sel` whose text contains `text`. */
async function click(sel, text = "") {
  const ok = await page.evaluate(
    (sel, text) => {
      const el = [...document.querySelectorAll(sel)].find((e) => e.textContent.includes(text));
      if (!el) return false;
      el.scrollIntoView({ block: "center" });
      el.click();
      return true;
    },
    sel,
    text
  );
  if (!ok) console.warn(`  (not found: ${sel} “${text}”)`);
  await sleep(450);
}
async function hover(sel) {
  const el = await page.$(sel);
  if (el) await el.hover();
  await sleep(300);
}

// ---- GIF recording: frames are PNG screenshots, scaled down, 128 colors each.
const SCALE = 0.72;
let frames = [];
async function frame(holdMs = 700) {
  const buf = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: W, height: H, scale: SCALE } });
  frames.push({ png: PNG.sync.read(buf), delay: holdMs });
}
function saveGif(name) {
  const gif = GIFEncoder();
  for (const f of frames) {
    const { width, height, data } = f.png;
    const palette = quantize(data, 128);
    gif.writeFrame(applyPalette(data, palette), width, height, { palette, delay: f.delay });
  }
  gif.finish();
  fs.writeFileSync(path.join(OUT, `${name}.gif`), gif.bytes());
  console.log("saved", `${name}.gif`, `${frames.length} frames`);
  frames = [];
}

// ---------------------------------------------------------------- screenshots
await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
await sleep(1500);
await shot("home");

await open("examples&mode=simple&cat=runes");
await shot("simple-items");

await open("mode=simple&cat=uniques");
await click(".unid-panel .switch");
await shot("unid");

await open("examples&mode=simple&view=preview");
await shot("preview");

await open("examples&mode=simple&view=shop");
await shot("shop");

await open("examples&mode=advanced&view=rules");
await shot("adv-rules");

await open("examples&mode=advanced&view=lab");
await shot("adv-lab");

await open("problems&mode=advanced&view=problems");
await click(".prow-main");
await page.evaluate(() => document.querySelector(".page")?.scrollTo(0, 250));
await sleep(300);
await shot("adv-problems");

await open("problems&mode=advanced&view=problems");
await click("button", "Ask on Discord");
await shot("discord");

await open("mode=simple&view=settings");
await shot("themes");

// ---------------------------------------------------------------- GIFs
// Changing an item in Simple mode.
await open("mode=simple&cat=runes");
await frame(900);
await click(".tile", "Ber (#30)");
await frame(900);
await click(".simple-editor .swatch-big[title='Red']");
await frame(700);
await click(".simple-editor label", "stars");
await frame(700);
await click(".simple-editor .choice-card", "Large");
await frame(700);
await click(".simple-editor .sound-btn", "5");
await frame(1600);
saveGif("simple-edit");

// Making a mystery drop and hiding an item behind it.
await open("mode=simple&cat=mys:new");
await frame(1200);
await click(".mystery-preset", "Lucky Bastard");
await frame(1200);
await click(".simple-tabs button", "Items");
await click(".simple-cat", "Runes");
await click(".tile", "Ber (#30)");
await frame(800);
await click(".mystery-pick", "Lucky Bastard");
await frame(1200);
await click(".simple-tabs button", "Mystery drops");
await frame(1800);
saveGif("mystery");

// Adding a shop target.
await open("mode=simple&view=shop");
await frame(1200);
await click(".shop-card button", "Add");
await frame(1200);
await click(".style-card", "Spotlight");
await frame(900);
await click(".style-card", "Alarm");
await frame(900);
await click(".shop-tabs button", "Vendor preview");
await hover(".vendor-item.match");
await frame(1800);
saveGif("shop-add");

await browser.close();
