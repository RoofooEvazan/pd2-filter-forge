// A .filter file as a list of lines. Untouched lines keep their original text byte-for-byte, so
// opening and saving a filter never reformats it; only lines the user edits are re-serialised.
//
// Line parsing follows PD2's BH Config reader: everything from the first "//" is a comment, the
// key is the text before the first ":", and the value is the trimmed text after it.

export type DirectiveKind = "rule" | "alias" | "formula" | "level";
export type LineKind = DirectiveKind | "comment" | "blank" | "other";

export interface Line {
  id: string;
  kind: LineKind;
  /** Original text. Emitted verbatim unless `dirty`. */
  raw: string;
  dirty?: boolean;
  /** A directive commented out with a leading // (a disabled rule). */
  disabled?: boolean;
  /** Spaces between the // and the directive of a disabled line ("// ItemDisplay…"), kept when it's edited. */
  disabledGap?: string;
  /** Whitespace before a trailing "// note" (kept when the line is edited; a space by default). */
  noteSep?: string;
  /** Text inside the [brackets]. */
  key?: string;
  /** Text after the colon, trimmed. */
  value?: string;
  /** Trailing "// note" text, without the slashes. */
  note?: string;
  /** Comment body for comment lines, without the leading //. */
  text?: string;
  indent?: string;
}

export interface Section {
  id: string;
  title: string;
  /** Index of the header comment line (or -1 for the implicit top section). */
  start: number;
  /** Exclusive end index. */
  end: number;
  rules: number;
  depth: number;
}

export interface FilterDoc {
  lines: Line[];
  eol: "\r\n" | "\n";
  /** The file started with a UTF-8 byte-order mark (PD2 doesn't strip it). */
  bom?: boolean;
  /** The last line had no line ending (saved back the same way). */
  noFinalEol?: boolean;
}

let nextId = 1;
export const newId = () => `L${nextId++}`;

const DIRECTIVES: Record<string, DirectiveKind> = {
  ItemDisplay: "rule",
  Alias: "alias",
  Formula: "formula",
  ItemDisplayFilterName: "level",
};

interface Parsed {
  kind: DirectiveKind;
  key: string;
  value: string;
}

/** Parse the part of a line before any comment as a directive, the way BH does. */
function parseDirective(body: string): Parsed | null {
  const colon = body.indexOf(":");
  if (colon < 0) return null;
  const head = body.slice(0, colon).trim();
  const m = head.match(/^([A-Za-z]+)\[(.*)\]$/s);
  if (!m) return null;
  const kind = DIRECTIVES[m[1]];
  if (!kind) return null;
  return { kind, key: m[2], value: body.slice(colon + 1).trim() };
}

export function parseLine(raw: string): Line {
  const id = newId();
  const indent = raw.match(/^[ \t]*/)![0];
  const trimmed = raw.trim();
  if (!trimmed) return { id, kind: "blank", raw };

  const ci = raw.indexOf("//");
  if (ci >= 0 && raw.slice(0, ci).trim() === "") {
    // Whole-line comment. It may be a disabled directive: //ItemDisplay[...]: ...
    const body = raw.slice(ci + 2);
    const inner = body.indexOf("//");
    const d = parseDirective(inner >= 0 ? body.slice(0, inner) : body);
    if (d && /^\s*[A-Za-z]+\[/.test(body)) {
      const gap = body.match(/^[ \t]*/)![0];
      return { id, kind: d.kind, raw, disabled: true, ...(gap ? { disabledGap: gap } : {}), key: d.key, value: d.value, note: inner >= 0 ? body.slice(inner + 2) : undefined, indent };
    }
    return { id, kind: "comment", raw, text: body };
  }

  const body = ci >= 0 ? raw.slice(0, ci) : raw;
  const note = ci >= 0 ? raw.slice(ci + 2) : undefined;
  const sep = ci >= 0 ? body.match(/[ \t]*$/)![0] : "";
  const d = parseDirective(body);
  if (d) return { id, kind: d.kind, raw, key: d.key, value: d.value, note, ...(note != null && sep !== " " ? { noteSep: sep } : {}), indent };
  return { id, kind: "other", raw };
}

export function parseFilter(text: string): FilterDoc {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const bom = text.charCodeAt(0) === 0xfeff;
  const src = bom ? text.slice(1) : text;
  const parts = src.split(/\r?\n/);
  const noFinalEol = src.length > 0 && !src.endsWith("\n");
  if (parts.length > 1 && parts[parts.length - 1] === "") parts.pop();
  return { lines: parts.map(parseLine), eol, bom, ...(noFinalEol ? { noFinalEol } : {}) };
}

const HEAD: Record<DirectiveKind, string> = { rule: "ItemDisplay", alias: "Alias", formula: "Formula", level: "ItemDisplayFilterName" };

export function lineText(l: Line): string {
  if (!l.dirty) return l.raw;
  switch (l.kind) {
    case "rule":
    case "alias":
    case "formula":
    case "level": {
      const v = l.value ?? "";
      let s = `${l.indent ?? ""}${l.disabled ? `//${l.disabledGap ?? ""}` : ""}${HEAD[l.kind]}[${l.key ?? ""}]:${v ? " " + v : ""}`;
      // An empty note is a bare "//" the author left at the end of the line; keep it.
      if (l.note != null) s += `${l.noteSep ?? " "}//${l.note}`;
      return s;
    }
    case "comment":
      return `//${l.text ?? ""}`;
    case "blank":
      return "";
    default:
      return l.raw;
  }
}

export function serializeFilter(doc: FilterDoc): string {
  return doc.lines.map(lineText).join(doc.eol) + (doc.noFinalEol ? "" : doc.eol);
}

/** Return a copy of a line with changes applied and marked for re-serialisation. */
export function editLine(l: Line, patch: Partial<Line>): Line {
  const next = { ...l, ...patch, dirty: true };
  next.raw = lineText(next);
  return next;
}

export function makeRule(key: string, value: string, note?: string): Line {
  return editLine({ id: newId(), kind: "rule", raw: "" }, { key, value, note });
}
export function makeComment(text: string): Line {
  return editLine({ id: newId(), kind: "comment", raw: "" }, { text });
}
export function makeBlank(): Line {
  return { id: newId(), kind: "blank", raw: "" };
}
export function makeDirective(kind: DirectiveKind, key: string, value: string): Line {
  return editLine({ id: newId(), kind, raw: "" }, { key, value });
}

// ---------------------------------------------------------------- sections

const DECOR = "=\\-#*~_+|<>\\[\\]/\\\\.:"; // characters used to draw comment banners
const bannerRe = new RegExp(`^[\\s${DECOR}]{3,}$`);
const decoratedRe = new RegExp(`^\\s*[${DECOR}]{2,}\\s*(.*?[A-Za-z0-9].*?)\\s*[${DECOR}]*\\s*$`);

function isBanner(l: Line | undefined) {
  return !!l && l.kind === "comment" && bannerRe.test(l.text ?? "") && (l.text ?? "").replace(/\s/g, "").length >= 3;
}

/** Title for a comment line if it looks like a section header, else null. */
export function headerTitle(lines: Line[], i: number): string | null {
  const l = lines[i];
  if (l.kind !== "comment") return null;
  const t = (l.text ?? "").trim();
  const forge = t.match(/^@section\s+(.+)$/i);
  if (forge) return forge[1].trim();
  if (!/[A-Za-z0-9]/.test(t) || t.length > 80) return null;
  const m = t.match(decoratedRe);
  if (m && m[1] && m[1].length >= 2) return m[1].replace(new RegExp(`[${DECOR}]+$`), "").trim();
  if (t.length > 60) return null;
  const clean = () => t.replace(new RegExp(`^[${DECOR}\\s]+|[${DECOR}\\s]+$`, "g"), "");
  // A plain comment boxed in by banner lines: // ====  /  // RUNES  /  // ====
  if (isBanner(lines[i - 1]) && isBanner(lines[i + 1])) return clean();
  // A title under a single banner, unless it's the blurb right after a boxed title.
  if (isBanner(lines[i - 1]) && !isBanner(lines[i - 3]) && !(lines[i - 2]?.kind === "comment" && /[A-Za-z0-9]/.test(lines[i - 2].text ?? ""))) return clean();
  return null;
}

/** A plain "// Title" comment after a blank line and directly above a directive: a sub-section. */
export function subheadTitle(lines: Line[], i: number): string | null {
  const l = lines[i];
  if (l.kind !== "comment" || l.disabled) return null;
  const prev = lines[i - 1];
  if (prev && prev.kind !== "blank") return null;
  const next = lines[i + 1];
  if (!next || next.kind === "blank" || next.kind === "comment" || next.kind === "other") return null;
  const t = (l.text ?? "").trim();
  if (t.length < 3 || t.length > 70 || !/^[A-Za-z0-9]/.test(t)) return null;
  return t;
}

export function headingAt(lines: Line[], i: number): { title: string; depth: number } | null {
  const h = headerTitle(lines, i);
  if (h) return { title: h, depth: 0 };
  const s = subheadTitle(lines, i);
  return s ? { title: s, depth: 1 } : null;
}

export function computeSections(lines: Line[]): Section[] {
  const out: Section[] = [];
  let cur: Section = { id: "top", title: "Top of file", start: -1, end: 0, rules: 0, depth: 0 };
  const push = (end: number) => {
    cur.end = end;
    if (cur.start >= 0 || cur.rules > 0 || end > 0) out.push(cur);
  };
  for (let i = 0; i < lines.length; i++) {
    const h = headingAt(lines, i);
    if (h) {
      // Merge a header directly following another (e.g. banner title + subtitle) into one section.
      if (cur.start >= 0 && cur.rules === 0 && i - cur.start <= 2 && h.depth >= cur.depth) {
        continue;
      }
      push(i);
      cur = { id: lines[i].id, title: h.title, start: i, end: i, rules: 0, depth: h.depth };
    } else if (lines[i].kind === "rule") cur.rules++;
  }
  push(lines.length);
  return out.filter((s) => !(s.id === "top" && s.end === 0));
}

// ---------------------------------------------------------------- definitions

export interface Definitions {
  aliases: Map<string, { value: string; id: string }>;
  formulas: Map<string, { value: string; id: string }>;
  levels: { name: string; id: string }[];
}

export function collectDefinitions(lines: Line[]): Definitions {
  const aliases = new Map<string, { value: string; id: string }>();
  const formulas = new Map<string, { value: string; id: string }>();
  const levels: { name: string; id: string }[] = [];
  for (const l of lines) {
    if (l.disabled) continue;
    if (l.kind === "alias") {
      // BH keeps only the first word of an alias key.
      const k = (l.key ?? "").trim().split(/\s+/)[0];
      if (k && !aliases.has(k)) aliases.set(k, { value: l.value ?? "", id: l.id });
    } else if (l.kind === "formula") {
      const k = (l.key ?? "").trim().toUpperCase();
      if (k) formulas.set(k, { value: l.value ?? "", id: l.id });
    } else if (l.kind === "level") {
      levels.push({ name: l.value ?? "", id: l.id });
    }
  }
  return { aliases, formulas, levels };
}

/** Expand aliases the way BH does: plain substring replacement in conditions, %NAME% in output. */
export function expandAliases(text: string, aliases: Definitions["aliases"], side: "cond" | "out"): string {
  let s = text;
  for (const [name, { value }] of aliases) {
    if (!name) continue;
    if (side === "cond") {
      let guard = 0;
      while (s.includes(name) && guard++ < 50) s = s.replace(name, value);
    } else {
      // BH uppercases the alias name and looks for %NAME% before it normalises keyword case.
      const tok = `%${name.toUpperCase()}%`;
      let guard = 0;
      while (s.includes(tok) && guard++ < 50) s = s.replace(tok, value);
    }
  }
  return s;
}
