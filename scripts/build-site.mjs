// Builds the GitHub Pages site into site/: a download page (index.html) and the how-to guide
// (guide.html), both from docs/guide.md and the images in public/guide.
//
//   npm run site         → site/
//   npm run site:deploy  → pushes site/ to the gh-pages branch
import fs from "node:fs";
import path from "node:path";
import { marked } from "marked";

const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")));
const OUT = path.join(ROOT, "site");
const REPO = "RoofooEvazan/pd2-filter-forge";
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const guideMd = fs.readFileSync(path.join(ROOT, "docs", "guide.md"), "utf8");

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, "guide"), { recursive: true });
for (const f of fs.readdirSync(path.join(ROOT, "public", "guide"))) fs.copyFileSync(path.join(ROOT, "public", "guide", f), path.join(OUT, "guide", f));
fs.copyFileSync(path.join(ROOT, "public", "icon.svg"), path.join(OUT, "icon.svg"));

// ---- guide: split at <a id> anchors for the table of contents
const toc = [...guideMd.matchAll(/^<a id="([^"]+)"><\/a>\r?\n(#+)\s+(.*)$/gm)].map((m) => ({ id: m[1], level: m[2].length, title: m[3] }));
const guideHtml = marked.parse(guideMd.replace(/^# .*\r?\n/, ""));

const CSS = `
:root{--bg:#0f0d10;--bg2:#151216;--panel:#1a171c;--line:#2e2830;--text:#ebe4d6;--muted:#a1978c;--faint:#6c645c;--accent:#d9a441;color-scheme:dark}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.6 "Segoe UI",system-ui,sans-serif}
a{color:var(--accent)}code{font-family:"Cascadia Mono",Consolas,monospace;background:var(--bg2);border:1px solid var(--line);border-radius:4px;padding:0 4px;font-size:.9em}
header.top{display:flex;align-items:center;gap:12px;padding:14px 24px;border-bottom:1px solid var(--line);background:var(--bg2);position:sticky;top:0;z-index:5}
header.top img{width:30px;height:30px}header.top b{font-size:17px}header.top nav{margin-left:auto;display:flex;gap:18px}
header.top nav a{color:var(--muted);text-decoration:none;font-weight:600}header.top nav a:hover,header.top nav a.on{color:var(--text)}
.btn{display:inline-flex;align-items:center;gap:8px;padding:11px 18px;border-radius:9px;border:1px solid var(--line);background:var(--panel);color:var(--text);text-decoration:none;font-weight:600}
.btn.primary{background:var(--accent);border-color:var(--accent);color:#1a1206}.btn:hover{filter:brightness(1.08)}
.hero{max-width:1100px;margin:0 auto;padding:56px 24px 28px;display:grid;grid-template-columns:1.1fr 1fr;gap:36px;align-items:center}
.hero h1{font-size:40px;line-height:1.15;margin:0 0 12px}.hero p{color:var(--muted);font-size:17px;margin:0 0 22px}
.hero img.shot{width:100%;border-radius:12px;border:1px solid var(--line);box-shadow:0 20px 60px rgba(0,0,0,.5)}
.dl{display:flex;flex-wrap:wrap;gap:10px;align-items:center}.ver{color:var(--faint);font-size:13px;margin-top:10px}
.features{max-width:1100px;margin:0 auto;padding:10px 24px 60px;display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px}.card h3{margin:0 0 6px}.card p{color:var(--muted);margin:0 0 12px}
.card img{width:100%;border-radius:8px;border:1px solid var(--line)}
.doc{display:grid;grid-template-columns:250px minmax(0,1fr);max-width:1250px;margin:0 auto}
.doc nav{position:sticky;top:60px;align-self:start;max-height:calc(100vh - 60px);overflow:auto;padding:20px 12px;border-right:1px solid var(--line)}
.doc nav a{display:block;color:var(--muted);text-decoration:none;padding:4px 8px;border-radius:6px}.doc nav a:hover{background:var(--panel);color:var(--text)}
.doc nav a.l2{color:var(--text);font-weight:600;margin-top:8px}.doc nav a.l3{padding-left:20px;font-size:14px}
.doc nav input{width:100%;padding:8px 10px;border-radius:8px;border:1px solid var(--line);background:var(--bg2);color:var(--text);margin-bottom:10px}
.doc article{padding:28px 40px 80px;max-width:920px}.doc article h2{border-top:1px solid var(--line);padding-top:26px;margin-top:34px;color:var(--accent)}
.doc article img{max-width:100%;border-radius:10px;border:1px solid var(--line);margin:10px 0 18px;box-shadow:0 10px 30px rgba(0,0,0,.35)}
table{border-collapse:collapse}td,th{border:1px solid var(--line);padding:6px 10px;text-align:left}th{background:var(--panel)}
footer{border-top:1px solid var(--line);color:var(--faint);text-align:center;padding:22px;font-size:13px}
@media(max-width:860px){.hero,.features{grid-template-columns:1fr}.doc{grid-template-columns:1fr}.doc nav{display:none}.doc article{padding:20px}}
`;

const head = (title) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><meta name="description" content="Build Project Diablo 2 loot filters visually, test them against any item, and install them into the game.">
<link rel="icon" href="icon.svg"><style>${CSS}</style></head><body>`;
const top = (on) => `<header class="top"><img src="icon.svg" alt=""><b>PD2 Filter Forge</b><nav>
<a href="./" class="${on === "home" ? "on" : ""}">Download</a><a href="guide.html" class="${on === "guide" ? "on" : ""}">How-to guide</a>
<a href="https://github.com/${REPO}/releases">Releases</a><a href="https://github.com/${REPO}">GitHub</a></nav></header>`;
const foot = `<footer>PD2 Filter Forge is a fan-made tool for Project Diablo 2 and isn't affiliated with the PD2 team or Blizzard Entertainment.</footer>`;

// Download links point at the latest release; a small script fills in the exact files and version.
const download = `<div class="dl">
<a class="btn primary" id="dl-installer" href="https://github.com/${REPO}/releases/latest">⬇ Download for Windows</a>
<a class="btn" id="dl-portable" href="https://github.com/${REPO}/releases/latest">Portable .exe</a>
<a class="btn" href="guide.html">How-to guide</a></div>
<div class="ver" id="dl-ver">Latest version: ${pkg.version} · Windows 10/11 · free</div>
<script>
fetch("https://api.github.com/repos/${REPO}/releases/latest").then(r=>r.json()).then(j=>{
  const a=(re)=>(j.assets||[]).find(x=>re.test(x.name));
  const i=a(/setup\\.exe$/i), p=a(/portable.*\\.exe$/i);
  if(i) document.getElementById("dl-installer").href=i.browser_download_url;
  if(p) document.getElementById("dl-portable").href=p.browser_download_url;
  if(j.tag_name) document.getElementById("dl-ver").textContent="Latest version: "+j.tag_name.replace(/^v/,"")+" · released "+new Date(j.published_at).toLocaleDateString()+" · Windows 10/11 · free";
}).catch(()=>{});
</script>`;

const features = [
  ["Simple mode", "Pick any item and choose its color, stars, name, minimap icon and drop sound — no filter code.", "guide/simple-edit.gif", "guide.html#simple-items"],
  ["Mystery drops", "Hide your best drops behind your own “Lucky Bastard” banner until you pick them up.", "guide/mystery.gif", "guide.html#mystery"],
  ["Shop hunting", "Make +3 skill orbs, 4-socket bases and fast boots jump out in vendor windows.", "guide/shop-add.gif", "guide.html#shop"],
  ["Advanced editor", "Every rule with a live preview, a visual condition builder and an output editor.", "guide/adv-rules.jpg", "guide.html#rules"],
  ["Problems that PD2 hides", "Finds rules PD2 silently misreads, explains why, and fixes them.", "guide/adv-problems.jpg", "guide.html#problems"],
  ["Test Lab", "Build any item and see exactly which rules match and how it looks.", "guide/adv-lab.jpg", "guide.html#lab"],
];

const index = `${head("PD2 Filter Forge — loot filter editor for Project Diablo 2")}${top("home")}
<section class="hero"><div>
<h1>Build your PD2 loot filter — visually.</h1>
<p>Start from scratch or any public filter, change how every item looks, hunt shops, and install it straight into Project Diablo 2. Simple mode needs no filter code at all.</p>
${download}
</div><img class="shot" src="guide/simple-items.jpg" alt="PD2 Filter Forge"></section>
<section class="features">${features
  .map(([t, d, img, href]) => `<a class="card" href="${href}" style="text-decoration:none;color:inherit"><h3>${t}</h3><p>${d}</p><img src="${img}" alt="${t}" loading="lazy"></a>`)
  .join("")}</section>${foot}</body></html>`;

const guidePage = `${head("How-to guide — PD2 Filter Forge")}${top("guide")}
<div class="doc"><nav><input id="q" placeholder="Search the guide…">${toc.map((t) => `<a class="l${t.level}" href="#${t.id}">${t.title}</a>`).join("")}</nav>
<article><h1>How-to guide</h1>${guideHtml}</article></div>${foot}
<script>
// Filter the contents list as you type; Enter jumps to the first match.
const q=document.getElementById("q"),links=[...document.querySelectorAll(".doc nav a")];
const text=(id)=>{let el=document.getElementById(id),out="";el=el&&el.parentElement&&el.nextElementSibling;
  for(let n=document.getElementById(id);n;n=n.nextElementSibling){if(n!==document.getElementById(id)&&n.tagName==="A"&&n.id)break;out+=" "+(n.textContent||"")}return out.toLowerCase()};
q.addEventListener("input",()=>{const w=q.value.toLowerCase().split(/\\s+/).filter(Boolean);
  links.forEach(a=>{const id=a.getAttribute("href").slice(1);a.style.display=!w.length||w.every(x=>(a.textContent+" "+text(id)).toLowerCase().includes(x))?"":"none"})});
q.addEventListener("keydown",e=>{if(e.key==="Enter"){const a=links.find(a=>a.style.display!=="none");if(a)location.hash=a.getAttribute("href")}});
</script></body></html>`;

fs.writeFileSync(path.join(OUT, "index.html"), index);
fs.writeFileSync(path.join(OUT, "guide.html"), guidePage);
fs.writeFileSync(path.join(OUT, ".nojekyll"), "");
console.log(`site/ built: index.html, guide.html, ${fs.readdirSync(path.join(OUT, "guide")).length} images`);
