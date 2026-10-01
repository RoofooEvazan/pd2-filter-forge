// Dev-only screen presets: ?demo&mode=simple|advanced&view=<view>&cat=<simple category>&theme=<theme>&cls=<0-6>
// Opens the starter filter (with a few example choices) so every screen has something to show.
import { actions, type View } from "./store";
import { blankFilter, starterFilter } from "../lib/templates";
import { parseFilter } from "../lib/document";
import { MYSTERY_PRESETS, applyChoice, saveMystery } from "../lib/simple";
import { shopTemplates, writeShop } from "../lib/shop";

export function applyDemoParams(p: URLSearchParams) {
  if (!p.has("demo")) return;
  const cls = Number(p.get("cls") ?? 1);
  let lines = parseFilter(p.has("blank") ? blankFilter("My Filter") : starterFilter("My Filter")).lines;
  if (p.has("examples")) {
    lines = saveMystery(lines, { ...MYSTERY_PRESETS[1], id: "m1" });
    lines = applyChoice(lines, "rune.r30", { mystery: "m1" });
    lines = applyChoice(lines, "rune.r31", { mystery: "m1" });
    lines = applyChoice(lines, "rune.r33", { color: "RED", stars: true, icon: { size: "border", hex: "62" }, sound: 4722 });
    lines = writeShop(lines, shopTemplates(cls).slice(0, 4).map((t) => t.make()), { dimOthers: false });
  }
  if (p.has("problems")) {
    // A few classic mistakes, for showing the Problems tab.
    const bad = [
      "// Examples with mistakes",
      "ItemDisplay[RARE ILVL>=80 BARARIAN]: %NAME%%TIER-5%",
      "ItemDisplay[t60 OR t61 OR t62 OR t69]: %NAME%{PvP Arena}",
      "ItemDisplay[aqv OR aq2]: %GOLD%%NAME%",
      "ItemDisplay[GEM=4 AND GEMTYPE=1 OR gpv]: %PURPLE%%NAME%",
    ];
    const at = lines.findIndex((l) => l.kind === "rule");
    lines = [...lines.slice(0, at), ...parseFilter(bad.join("\n")).lines, ...lines.slice(at)];
  }
  const mode = p.get("mode");
  if (mode === "simple" || mode === "advanced") actions.setSettings({ mode });
  actions.openText(lines.map((l) => l.raw).join("\n"), { name: "My Filter.filter", origin: "Demo" }, false);
  const theme = p.get("theme");
  if (theme) actions.setSettings({ theme: theme as never });
  actions.setCtx({ cls });
  const cat = p.get("cat");
  if (cat) actions.setSimpleCat(cat);
  const view = p.get("view");
  if (view) actions.setView(view as View);
}
