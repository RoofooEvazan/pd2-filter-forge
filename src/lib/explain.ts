// Plain-English descriptions of conditions and outputs, so every rule explains itself.
import type { Leaf, Node, Op } from "./conditions";
import { SKILL_BY_ID, STAT_BY_ID, ZONE_BY_ID, tierName } from "./data";
import { CLASS_NAMES, DIFF_NAMES, MAPTIER_NAMES, TAB_NAMES } from "./spec";
import { splitOutput, segmentOutput } from "./output";
import { PALETTE } from "./data";

const opWord = (op: Op | undefined, v?: number, v2?: number) => {
  switch (op) {
    case "=":
      return `is ${v}`;
    case ">":
      return `above ${v}`;
    case "<":
      return `below ${v}`;
    case "~":
      return `${v}–${v2}`;
    default:
      return "(no comparison)";
  }
};

function valueName(code: string, v?: number): string | null {
  if (v == null) return null;
  switch (code) {
    case "DIFF":
      return DIFF_NAMES[v] ?? null;
    case "MAPID":
      return ZONE_BY_ID.get(v)?.n ?? null;
    case "MAPTIER":
      return MAPTIER_NAMES[v] ?? null;
    case "RUNE":
      return ["", "El", "Eld", "Tir", "Nef", "Eth", "Ith", "Tal", "Ral", "Ort", "Thul", "Amn", "Sol", "Shael", "Dol", "Hel", "Io", "Lum", "Ko", "Fal", "Lem", "Pul", "Um", "Mal", "Ist", "Gul", "Vex", "Ohm", "Lo", "Sur", "Ber", "Jah", "Cham", "Zod"][v] ?? null;
  }
  return null;
}

export function describeLeaf(l: Leaf): string {
  switch (l.cls) {
    case "item": {
      const b = l.base;
      return b ? `${b.n}${b.tier ? ` (${tierName(b.tier).toLowerCase()})` : ""}` : `item "${l.key}"`;
    }
    case "flag":
      return l.kw!.label;
    case "value": {
      const named = valueName(l.kw!.code, l.v);
      const base = `${l.kw!.label} ${opWord(l.op, l.v, l.v2)}`;
      return named && l.op === "=" ? `${l.kw!.label}: ${named}` : named && (l.op === ">" || l.op === "<") ? `${base} (${named})` : base;
    }
    case "param": {
      const [a, b] = l.params ?? [];
      let what = l.key;
      switch (l.prefix) {
        case "STAT":
        case "CHARSTAT":
          what = `${l.prefix === "CHARSTAT" ? "Character " : ""}stat ${a} (${STAT_BY_ID.get(a)?.d ?? "unknown"})`;
          break;
        case "SK":
          what = `+skills to ${SKILL_BY_ID.get(a)?.n ?? `skill ${a}`}`;
          break;
        case "OS":
          what = `oskill ${SKILL_BY_ID.get(a)?.n ?? a}`;
          break;
        case "CHSK":
          what = `${SKILL_BY_ID.get(a)?.n ?? `skill ${a}`} charges`;
          break;
        case "CLSK":
          what = `+${CLASS_NAMES[a] ?? a} skills`;
          break;
        case "TABSK":
          what = `+${TAB_NAMES[a] ?? `tab ${a}`} skills`;
          break;
        case "MULTI":
          what = `stat ${a} layer ${b} (${STAT_BY_ID.get(a)?.d ?? "?"})`;
          break;
      }
      return `${what} ${opWord(l.op, l.v, l.v2)}`;
    }
    case "add":
      return `${l.key.split("+").join(" + ")} ${opWord(l.op, l.v, l.v2)}`;
    case "alias":
      return `alias ${l.key}`;
    case "formula":
      return `formula ${l.formula}${l.op ? " " + opWord(l.op, l.v, l.v2) : " is true"}`;
    case "inline":
      return `formula (${l.formula})${l.op ? " " + opWord(l.op, l.v, l.v2) : " is true"}`;
    default:
      return `"${l.key}" (ignored)`;
  }
}

export function describeTree(n: Node | null, top = true): string {
  if (!n) return "every item";
  switch (n.t) {
    case "leaf":
      return describeLeaf(n.leaf);
    case "not":
      return `not ${describeTree(n.item, false)}`;
    case "and": {
      // "Always true" parts (switch aliases set to TRUE) add nothing to the description.
      const parts = n.items.filter((c) => !(c.t === "leaf" && c.leaf.kw?.code === "TRUE"));
      if (parts.length === 0) return "every item";
      const s = parts.map((c) => describeTree(c, false)).join(" · ");
      return top ? s : `(${s})`;
    }
    case "or": {
      const parts = n.items.map((c) => describeTree(c, false));
      const s = parts.length === 2 ? `${parts[0]} or ${parts[1]}` : `any of: ${parts.join(", ")}`;
      return top ? s : `(${s})`;
    }
  }
}

export function describeOutput(value: string): string[] {
  const out: string[] = [];
  const { name, desc, effects } = splitOutput(value);
  const segs = segmentOutput(name);
  const visible = segs.filter((s) => s.kind !== "color" && !(s.kind === "text" && !s.raw.trim()));
  if (!name.trim() || visible.length === 0) out.push("Hides the item");
  else {
    const colors = segs.filter((s) => s.kind === "color").map((s) => s.code!.toLowerCase().replace("_", " "));
    const keepsName = segs.some((s) => s.kind === "value" && s.code === "NAME");
    const extra = visible.filter((s) => !(s.kind === "value" && s.code === "NAME"));
    if (keepsName && extra.length === 0) out.push(colors.length ? `Shows the name in ${colors[colors.length - 1]}` : "Shows the normal name");
    else if (keepsName) out.push(`Shows the name with extra text${colors.length ? ` (${[...new Set(colors)].join(", ")})` : ""}`);
    else out.push(`Renames it${colors.length ? ` (${[...new Set(colors)].join(", ")})` : ""}`);
  }
  if (desc != null) out.push(desc.trim() ? "Changes the description" : "Clears the description");
  const icon = (["border", "map", "dot", "px"] as const).find((k) => effects[k]);
  if (icon) out.push(`${{ border: "Large", map: "Medium", dot: "Small", px: "Tiny" }[icon]} minimap icon (color ${effects[icon]})`);
  if (effects.line) out.push(`Minimap line (color ${effects.line})`);
  if (effects.sound != null) out.push(`Plays sound ${effects.sound}`);
  if (effects.tier != null) out.push(`Text notification up to filter level ${effects.tier}`);
  if (effects.notify) out.push(effects.notify === "DEAD" ? "No text notification" : `Notification color ${effects.notify}`);
  if (effects.cont) out.push("Then keeps checking later rules");
  return out;
}

export function paletteCss(hex: string | undefined): string {
  if (!hex) return "transparent";
  const i = parseInt(hex, 16);
  return Number.isNaN(i) ? "transparent" : PALETTE[i] ?? "transparent";
}
