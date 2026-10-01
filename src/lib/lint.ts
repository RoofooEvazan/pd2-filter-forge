// Problems PD2 won't tell you about. Every check is grounded in the engine research documented in
// docs/PD2-Filter-Engine-Reference.md; `ref` points at the section that explains it.
import type { FilterDoc, Line, Definitions } from "./document";
import { collectDefinitions, editLine, expandAliases } from "./document";
import { tokenize, buildTree, serializeTree, compileCondition } from "./conditions";
import { segmentOutput, descSpan, buildAction, classifyKeyword, ICON_KINDS } from "./output";
import { tryCompile, type FNode } from "./formula";
import { requiredLeaves, type BhEvent, type BhLeaf, type BhNode } from "./bh";
import type { Compiled, CompiledRule } from "./engine";
import { COND_BY_CODE, MAX_FILTER_LEVELS, NAME_DISPLAY_LIMIT } from "./spec";
import { DATA, ITEM_BY_CODE, SOUND_BY_ID } from "./data";
import { suggestItemCode, suggestKeyword, suggestOutputKeyword } from "./suggest";
import { makeItem, mapTier } from "./item";
import { evalLeaf } from "./conditions";
import { DEFAULT_CTX } from "./item";

export type Severity = "error" | "warn" | "info";
export type Impact = "breaks" | "broadens" | "misleads" | "display" | "tidy";

export const IMPACTS: Record<Impact, { label: string; blurb: string; sev: Severity }> = {
  breaks: { label: "Never works", blurb: "The rule (or part of it) can never match, or the file itself misbehaves.", sev: "error" },
  broadens: { label: "Matches too much", blurb: "PD2 throws part of the conditions away, so the rule catches more items than written.", sev: "error" },
  misleads: { label: "Works differently than it reads", blurb: "Valid, but PD2 interprets it in a way that's easy to misread.", sev: "warn" },
  display: { label: "Shows the wrong text", blurb: "Names, descriptions, icons or sounds won't look the way the output suggests.", sev: "warn" },
  tidy: { label: "Tidy-up", blurb: "Harmless, but worth cleaning up.", sev: "info" },
};

export interface CheckDef {
  id: string;
  title: string;
  impact: Impact;
  /** What PD2 actually does, in plain words. */
  why: string;
  /** Reference doc anchor. */
  ref: string;
  /** Only found by the deeper, slower analysis. */
  deep?: boolean;
  /** General advice: how to fix this kind of problem. */
  advice?: string;
}

export interface Fix {
  label: string;
  key?: string;
  value?: string;
  remove?: boolean;
  /** Mechanical and certain (not a guess): safe to apply in bulk with "Fix all". */
  safe?: boolean;
  /** Move a line (by id) to just after another line. */
  move?: { id: string; after?: string; before?: string };
}

export interface Issue {
  check: string;
  line: number;
  id: string;
  sev: Severity;
  /** The problem, in one sentence. */
  msg: string;
  /** What PD2 does with this exact text, when it says more than the check's general explanation. */
  detail?: string;
  /** What to do about it, when there's no one-click fix (or to explain the fix). */
  advice?: string;
  token?: string;
  fixes: Fix[];
  /** An unknown item code the user can replace with one of their own (see tryItemCode). */
  swap?: { token: string; code: string };
  /** Back-compat for callers that only understand one condition fix. */
  fixCond?: string;
  fixLabel?: string;
}

const C = (id: string, title: string, impact: Impact, why: string, ref: string, deep = false): CheckDef => ({ id, title, impact, why, ref, deep });

export const CHECKS: CheckDef[] = [
  // file & lines
  C("file.bom", "Byte-order mark on the first line", "breaks", "PD2 doesn't strip the UTF-8 BOM, so a directive on line 1 isn't recognised.", "file-loading"),
  C("file.encoding", "File isn't UTF-8", "display", "Since Season 13 PD2 reads filters as UTF-8. ANSI accented characters and ÿ color codes turn into �.", "file-loading"),
  C("line.no-colon", "Directive without a colon", "breaks", "PD2 treats the whole line as both key and value: a rule shows the line itself as the name, and an alias can hang the game.", "line-syntax"),
  C("line.bracket", "Missing or misplaced ]", "broadens", "PD2 takes everything after [ and drops the key's last character, whatever it is — often leaving a rule that matches everything.", "line-syntax"),
  C("line.comment-cut", "// inside a rule", "breaks", "Everything from the first // is a comment, even inside [conditions], {descriptions} or URLs.", "line-syntax"),
  C("line.directive-case", "Misspelled directive", "breaks", "Directive names are case-sensitive and must be followed directly by [ — this line is ignored.", "line-syntax"),
  C("line.unknown-directive", "Unknown directive", "breaks", "Only ItemDisplay, Alias, Formula and ItemDisplayFilterName are read; anything else is ignored.", "line-syntax"),
  C("line.indent", "Tab-then-space indent", "breaks", "PD2 trims spaces before tabs, so a line starting with tab then space keeps the space and the directive isn't recognised.", "line-syntax"),
  // aliases
  C("alias.self", "Alias contains its own name", "breaks", "Aliases are replaced with a find-and-replace loop that never ends if the value contains the name: the game hangs while loading the filter.", "aliases"),
  C("alias.clobber", "Alias name is part of other words", "misleads", "Aliases replace raw text, not whole words, so this alias also rewrites every longer word that contains it.", "aliases"),
  C("alias.shadow", "Alias hides a built-in keyword", "misleads", "The alias replaces the keyword everywhere it appears.", "aliases"),
  C("alias.space", "Space in alias name", "misleads", "Alias names stop at the first space.", "aliases"),
  C("alias.dup", "Alias defined twice", "misleads", "All definitions run in file order; the first one usually wins.", "aliases"),
  C("alias.order", "Alias inside an alias that expands too late", "broadens", "PD2 expands aliases once each, top to bottom. If alias B's value contains alias A, A must be defined below B — otherwise A's turn has already passed when B inserts it, and A stays as plain text.", "aliases"),
  C("cond.alias-text", "Alias name left unexpanded in a rule", "broadens", "This word is an alias, but it only reaches the rule through another alias that PD2 expands later, so it's left as plain text and PD2 drops it as an unknown word.", "aliases"),
  C("alias.output-case", "Alias in output isn't upper case", "display", "In output an alias must be written %UPPERCASE%; otherwise it prints literally.", "aliases"),
  C("alias.unused", "Unused alias", "tidy", "Nothing references this alias.", "aliases"),
  // formulas
  C("formula.compile", "Formula doesn't compile", "breaks", "PD2 silently skips formulas with errors; every condition using it is dropped and output shows the raw text.", "formulas"),
  C("formula.key", "Formula name can't be referenced", "misleads", "Names with spaces can never be referenced; names with digits can't be printed with %FORMULA…% or used in A+B sums.", "formulas"),
  C("formula.dup", "Formula defined twice", "misleads", "The last definition that compiles wins.", "formulas"),
  C("formula.chain", "Chained comparison", "misleads", "All comparisons share one precedence level: 1<X<5 means (1<X)<5, which is always 1.", "formulas"),
  C("formula.unused", "Unused formula", "tidy", "Nothing references this formula.", "formulas"),
  // levels
  C("levels.max", "More than 12 filter levels", "misleads", "Only the first 12 ItemDisplayFilterName lines are used.", "filter-levels"),
  C("levels.hotkey", "More than 9 filter levels", "tidy", "Ctrl+Numpad hotkeys only reach levels 0–9; higher levels need the menu.", "filter-levels"),
  // conditions
  C("cond.match-all", "Rule matches every item", "broadens", "Every condition was dropped, and a rule with no conditions matches everything.", "conditions"),
  C("cond.never", "Rule can never match", "breaks", "After PD2 drops what it doesn't understand, an operator is left without its condition, so the rule is disabled.", "conditions"),
  C("cond.unknown", "Unknown word in conditions", "broadens", "PD2 silently ignores words it doesn't know, so the rule matches more than intended.", "conditions"),
  C("cond.lowercase", "Keyword written in lower case", "breaks", "Anything with no capitals in its first 3 letters is read as an item code; no item has that code, so it never matches.", "conditions"),
  C("cond.item-unknown", "No item has this code", "breaks", "The comparison is an exact 4-character code match, so this can never be true.", "conditions"),
  C("cond.odd-code", "Item code that doesn't fit the list", "misleads", "Among codes of one kind (like PvP arena maps) sits a real item of another kind — often a typo in the number — so the rule also applies to it.", "item-codes"),
  C("cond.item-long", "Item code longer than 4 characters", "misleads", "Only the first 4 characters are compared.", "conditions"),
  C("cond.two-char-op", ">=, <=, == or != in conditions", "broadens", "Conditions only support one-character operators; the whole condition is dropped (and its parentheses with it).", "conditions"),
  C("cond.bad-value", "Value isn't a number", "broadens", "When the value can't be read the condition is dropped, and its closing ) and ! go with it.", "conditions"),
  C("cond.value-junk", "Text after the number", "misleads", "Only the leading whole number is read: ILVL>5.9 means ILVL>5.", "conditions"),
  C("cond.empty-value", "Comparison without a number", "misleads", "An empty value counts as 0: ILVL> means ILVL>0.", "conditions"),
  C("cond.no-operator", "Value condition without a comparison", "breaks", "A value code on its own (ILVL, SOCK, SK54…) never matches — and !ILVL always matches.", "conditions"),
  C("cond.spaces-op", "Spaces around the comparison", "breaks", "Tokens are split on spaces: ILVL > 80 becomes ILVL (never true), > (ignored) and 80 (an item code).", "conditions"),
  C("cond.op-ignored", "Comparison on a yes/no condition", "misleads", "Flags and item codes ignore comparisons: ETH=0 still means ethereal.", "conditions"),
  C("cond.param", "Bad number after STAT/SK/CLSK…", "broadens", "Out-of-range or missing numbers make PD2 drop the condition.", "conditions"),
  C("cond.formula-ref", "Formula reference is dropped", "broadens", "Formula references are case-sensitive and must name a formula that compiles; otherwise they're dropped.", "conditions"),
  C("cond.range", "Range that can't match", "breaks", "~a-b needs a dash and a ≤ b; ~ on a sum with a formula (or on GOODSK) never matches.", "conditions"),
  C("cond.add-part", "Part of a sum is ignored", "misleads", "A+B sums only understand LIFE MANA STR DEX CRES FRES LRES PRES MINDMG MAXDMG EDEF EDAM FCR AR REPLIFE, STATn, MULTIa,b and formulas; other parts add 0.", "conditions"),
  C("cond.paren-mid", "Parenthesis inside a word", "breaks", "!, ( and ) are only recognised at the start or end of a word.", "conditions"),
  C("cond.stray-close", "Extra )", "broadens", "An unmatched ) makes PD2 stop reading: everything after it is thrown away.", "conditions"),
  C("cond.unclosed", "Unclosed (", "misleads", "PD2 discards the operators before an unclosed (.", "conditions"),
  C("cond.island", "Inline $f(…) doesn't compile", "breaks", "A failed island stays as raw text and turns into junk item codes.", "formulas"),
  C("cond.byte", "Number out of range", "misleads", "This value is stored as 0–255, so larger or negative numbers wrap around.", "conditions"),
  C("cond.mixed", "AND and OR mixed without parentheses", "misleads", "AND and OR have equal priority and are read left to right: A OR B C means (A OR B) AND C.", "conditions"),
  // semantics
  C("sem.conflict", "Conditions that can't all be true", "breaks", "The rule requires things that exclude each other, so no item can ever match.", "condition-reference"),
  C("sem.range-conflict", "Contradictory ranges", "breaks", "The same value is required to be in ranges that don't overlap.", "condition-reference"),
  C("sem.domain", "Value outside what's possible", "breaks", "No item or character can have this value.", "condition-reference"),
  C("sem.affix-op", "PREFIX/SUFFIX with < or >", "breaks", "Affix ids only support = and ~; with < or > the condition is always false. They're also always false on uniques and sets.", "condition-reference"),
  C("sem.res", "RES compares all four resists", "misleads", "RES<30 means every resistance is below 30, not the lowest one.", "condition-reference"),
  C("sem.maptier", "MAPTIER< also matches non-maps", "misleads", "Non-maps have map tier −1, so MAPTIER<n is true for every other item.", "condition-reference"),
  C("sem.stacked", "Unstacked rune or gem code only", "misleads", "Runes (and flawless/perfect gems) usually drop as the stacked item (r30s, gpws), which this code doesn't match.", "item-codes"),
  C("sem.gold", "GOLD combined with other items", "breaks", "GOLD is only true for gold piles.", "condition-reference"),
  // output
  C("out.unknown", "Unknown %KEYWORD%", "display", "PD2 prints unknown keywords literally.", "output-keywords"),
  C("out.params", "Keyword with the wrong numbers", "display", "A keyword with the wrong number of parameters prints literally.", "output-keywords"),
  C("out.lowercase", "Lower-case keyword after a %", "display", "PD2 only upper-cases keywords at even % positions; a lone % earlier flips that, so this keyword prints literally.", "output-keywords"),
  C("out.percent", "Lone % in text", "display", "Write %PERCENT% for a literal percent sign.", "output-keywords"),
  C("out.duplicate", "Keyword used twice", "display", "Only the first icon/sound/tier/continue keyword counts; later ones print literally.", "notifications"),
  C("out.continue-desc", "%CONTINUE% inside { }", "breaks", "%CONTINUE% only works outside the description; inside it prints literally and the rule stops.", "continue"),
  C("out.braces", "Braces PD2 reads differently", "display", "The description runs from the first { to the first }; other braces print literally. Use %LBRACE% / %RBRACE%.", "descriptions"),
  C("out.notify-syntax", "Icon/sound/tier keyword not understood", "display", "Colors are 1–4 hex digits, SOUNDID up to 4 digits, TIER a single digit 0–9; anything else prints literally.", "notifications"),
  C("out.tier-no-effect", "%TIER% without an icon or sound", "tidy", "TIER only affects rules that have a minimap icon or sound.", "notifications"),
  C("out.notify-noop", "%NOTIFY% has no effect", "tidy", "PD2 parses %NOTIFY-x% but never uses it.", "notifications"),
  C("out.sound", "Sound that won't play", "display", "SOUNDID must be a valid, non-looping sound; otherwise nothing plays and the rule may not notify at all.", "notifications"),
  C("out.hide-with-icon", "Hidden item with an icon or sound", "misleads", "Rules with an icon or sound don't hide the item's sprite, and the notification fires with an empty name.", "hiding"),
  C("out.blank-label", "Label that isn't really hidden", "misleads", "Only an exactly empty output hides; colors or spaces alone show an empty label.", "hiding"),
  C("out.name-length", "Name longer than 56 characters", "display", "PD2 cuts names at 56 visible characters (512 in shops).", "limits"),
  C("out.newline", "%NL% where it doesn't work", "display", "In names, %NL% only works for identified magic+ items, runewords and shop items; elsewhere the lines run together.", "newlines"),
  C("out.formula", "%FORMULA…% that doesn't exist", "display", "Missing or broken formulas print literally.", "formulas"),
  C("out.island", "Inline $f(…) doesn't compile", "display", "Shows the raw $f(…) text.", "formulas"),
  C("out.item-keyword", "Item-specific keyword on other items", "misleads", "%RUNENAME%, %RUNENUM%, %GEMLEVEL% and %GEMTYPE% are empty on other items — an output made only of them hides those items.", "output-keywords"),
  C("out.builtin-color", "Color has no effect on this item", "display", "Runes and some PD2 items carry their color inside %NAME%, overriding colors before it. Use %BASENAME% to recolor them.", "colors"),
  // flow
  C("flow.unreachable", "Rule after a catch-all", "breaks", "An earlier rule matches every item and stops, so nothing below it is ever reached.", "evaluation"),
  C("flow.duplicate", "Same conditions as an earlier rule", "breaks", "The earlier rule stops first, so this one never applies.", "evaluation"),
  C("flow.shadowed", "Earlier rule decides first", "misleads", "For the items this rule targets, an earlier rule without %CONTINUE% already decides how they look.", "evaluation", true),
  C("flow.notify-shadowed", "Icon/sound never used", "misleads", "Only the first matching icon/sound rule notifies; for these items an earlier one wins.", "notifications", true),
  C("flow.desc-wiped", "Description cleared by a later rule", "display", "Every matching rule replaces the description; a later rule without { } clears it. End it with {%NAME%} to keep it.", "descriptions", true),
];

const ADVICE: Record<string, string> = {
  "file.bom": "Save the file from Filter Forge (it drops the mark), or start the file with a // comment line.",
  "file.encoding": "Save the file as UTF-8 (Settings → Save encoding).",
  "line.no-colon": "Add “:” right after the ] and put the output after it.",
  "line.bracket": "End the key with ] directly before the “:”.",
  "line.comment-cut": "Remove the // or move it to the end of the line.",
  "line.directive-case": "Spell the directive exactly: ItemDisplay[, Alias[, Formula[ or ItemDisplayFilterName[.",
  "line.unknown-directive": "Fix the directive name, or turn the line into a // comment.",
  "line.indent": "Remove the spaces after the tab.",
  "alias.self": "Rename the alias so its name doesn't appear in its own value.",
  "alias.clobber": "Rename the alias to something that isn't part of other words (for example add a MY_ prefix).",
  "alias.shadow": "Rename the alias so it doesn't replace the built-in keyword.",
  "alias.space": "Use an underscore instead of the space.",
  "alias.dup": "Delete or rename one of the definitions.",
  "alias.order": "Move the inner alias below the alias that uses it.",
  "cond.alias-text": "Move the inner alias's definition below the alias that inserts it.",
  "alias.output-case": "Write the alias in upper case between % signs.",
  "alias.unused": "Delete it if you don't need it.",
  "formula.compile": "Fix the expression at the position the message names.",
  "formula.key": "Use only letters in formula names.",
  "formula.dup": "Keep one definition.",
  "formula.chain": "Combine comparisons with AND(…), or multiply them: (X>1)*(X<5).",
  "formula.unused": "Delete it if you don't need it.",
  "levels.max": "Merge or remove levels so there are 12 or fewer.",
  "levels.hotkey": "Fine if you pick levels from the menu; otherwise keep 9 or fewer.",
  "cond.match-all": "Fix the dropped words on this line (they're listed as separate problems).",
  "cond.never": "Fix the dropped words so every !, AND and OR has a condition next to it.",
  "cond.unknown": "Fix the spelling, or remove the word.",
  "cond.lowercase": "Write the keyword in upper case.",
  "cond.item-unknown": "Use a real item code (Codex → Items lists them all).",
  "cond.odd-code": "Remove it if it's there by mistake.",
  "cond.item-long": "Item codes are at most 4 characters.",
  "cond.two-char-op": "Use a one-character comparison: ILVL>=80 becomes ILVL>79.",
  "cond.bad-value": "Use a whole number.",
  "cond.value-junk": "Remove what follows the number. For a range write KEY~low-high.",
  "cond.empty-value": "Write the number you mean, e.g. >0.",
  "cond.no-operator": "Add a comparison such as >0.",
  "cond.spaces-op": "Remove the spaces: ILVL>80.",
  "cond.op-ignored": "Drop the comparison; use ! in front for “not”.",
  "cond.param": "Use a number in the valid range.",
  "cond.formula-ref": "Write FORMULA plus the name exactly as defined, in capitals, and make sure the formula compiles.",
  "cond.range": "Write ranges as KEY~low-high with low ≤ high.",
  "cond.add-part": "Wrap the sum in an inline formula: $f(A+B)>n. Formulas understand every stat.",
  "cond.paren-mid": "Put a space between words and !, ( or ).",
  "cond.stray-close": "Remove the extra ), or add the ( it was meant to close.",
  "cond.unclosed": "Add the missing ).",
  "cond.island": "Fix the formula inside $f(…).",
  "cond.byte": "Use a value from 0 to 255.",
  "cond.mixed": "Add parentheses so the grouping is explicit.",
  "sem.conflict": "Remove one of the conflicting conditions, or join them with OR.",
  "sem.range-conflict": "Fix the numbers so the ranges overlap.",
  "sem.domain": "Use a value that can actually occur.",
  "sem.affix-op": "Use = or ~ with affix ids, and don't combine PREFIX/SUFFIX with UNI or SET.",
  "sem.res": "If you mean one resistance, use FRES, CRES, LRES or PRES instead.",
  "sem.maptier": "Add MAP (or map codes) so it only applies to maps.",
  "sem.stacked": "Also match the stacked code.",
  "sem.gold": "Give GOLD its own rule.",
  "out.unknown": "Fix the spelling. For a literal percent sign write %PERCENT%.",
  "out.params": "Check the keyword's numbers in Codex → Output.",
  "out.lowercase": "Write the keyword in upper case and fix the lone % before it.",
  "out.percent": "Write %PERCENT% wherever you mean a literal percent sign.",
  "out.duplicate": "Remove the extra keyword.",
  "out.continue-desc": "Move %CONTINUE% outside the { }.",
  "out.braces": "Write %LBRACE% / %RBRACE% for literal braces.",
  "out.notify-syntax": "Colors are 1–4 hex digits, SOUNDID up to 4 digits, TIER one digit 0–9.",
  "out.tier-no-effect": "Remove %TIER%, or add the minimap icon or sound it should tier.",
  "out.notify-noop": "Remove it.",
  "out.sound": "Pick a sound from Codex → Sounds.",
  "out.hide-with-icon": "Remove the icon/sound, or show a label.",
  "out.blank-label": "Leave the output completely empty to hide the item.",
  "out.name-length": "Shorten the text, or move part of it into the { } description.",
  "out.newline": "Move the line break into the { } description, where it always works.",
  "out.formula": "Define the formula, or fix the name.",
  "out.island": "Fix the formula inside $f(…).",
  "out.item-keyword": "Add %NAME%, or limit the rule to runes/gems.",
  "out.builtin-color": "Use %BASENAME% if you want to recolor it.",
  "flow.unreachable": "Give the catch-all rule conditions or %CONTINUE%, or move it to the end.",
  "flow.duplicate": "Delete this rule, or merge what it does into the earlier one.",
  "flow.shadowed": "Move this rule above the earlier one, or add %CONTINUE% to the earlier one.",
  "flow.notify-shadowed": "Move this rule above the earlier icon/sound rule.",
  "flow.desc-wiped": "Give the later rule a { } description (e.g. {%NAME%}) to keep text.",
};
for (const c of CHECKS) c.advice = ADVICE[c.id];

export const CHECK_BY_ID = new Map(CHECKS.map((c) => [c.id, c]));

// ------------------------------------------------------------------ helpers

interface Extra {
  detail?: string;
  advice?: string;
}

function issue(check: string, l: Line, line: number, msg: string, fixes: Fix[] = [], token?: string, extra: Extra = {}): Issue {
  const def = CHECK_BY_ID.get(check)!;
  return { check, line, id: l.id, sev: IMPACTS[def.impact].sev, msg, token, fixes, ...(extra.detail ? { detail: extra.detail } : {}), ...(extra.advice ? { advice: extra.advice } : {}) };
}

/** Replace a whole token in the rule's own condition text. */
function replaceToken(cond: string, token: string, next: string): string | undefined {
  const re = new RegExp(`(^|[\\s(!])${escapeRe(token)}(?=$|[\\s)!])`);
  if (!re.test(cond)) return undefined;
  return cond.replace(re, (_, pre) => pre + next);
}
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Long tokens (sums, run-together words) are shortened for messages; the full text is highlighted in the rule. */
const short = (s: string, n = 42) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

const QUALITY = ["NMAG", "MAG", "RARE", "SET", "UNI", "CRAFT"];
const safe = (fixes: Fix[]): Fix[] => fixes.map((f) => ({ ...f, safe: true }));
const TIERS = ["NORM", "EXC", "ELT"];
const PARAM_PREFIXES = ["CHARSTAT", "STAT", "CHSK", "TABSK", "CLSK", "SK", "OS"];

/** Shared per-lint-pass context. */
interface LintCtx {
  defs: Definitions;
  lines: Line[];
  /** Alias name → line index of the definition PD2 uses. */
  aliasAt: Map<string, number>;
  /** "B>A": alias B's value contains alias A, which is defined earlier (so A isn't expanded there). */
  orderPairs: Set<string>;
  moveCache: Map<string, Fix[]>;
}

function aliasList(lines: Line[]): { name: string; value: string; index: number }[] {
  const seen = new Set<string>();
  const out: { name: string; value: string; index: number }[] = [];
  lines.forEach((l, index) => {
    if (l.kind !== "alias" || l.disabled) return;
    const name = (l.key ?? "").trim().split(/\s+/)[0];
    if (!name || seen.has(name)) return;
    seen.add(name);
    out.push({ name, value: l.value ?? "", index });
  });
  return out;
}

const containsWord = (text: string, word: string) => {
  let at = text.indexOf(word);
  while (at >= 0) {
    const before = text[at - 1];
    const after = text[at + word.length];
    if (!(before && /[A-Za-z0-9_]/.test(before)) && !(after && /[A-Za-z0-9_]/.test(after))) return true;
    at = text.indexOf(word, at + 1);
  }
  return false;
};

function aliasOrderPairs(lines: Line[]): Set<string> {
  const as = aliasList(lines);
  const out = new Set<string>();
  for (let j = 0; j < as.length; j++) for (let k = 0; k < j; k++) if (containsWord(as[j].value, as[k].name)) out.add(`${as[j].name}>${as[k].name}`);
  return out;
}

function makeCtx(doc: FilterDoc, defs: Definitions): LintCtx {
  const aliasAt = new Map(aliasList(doc.lines).map((a) => [a.name, a.index]));
  return { defs, lines: doc.lines, aliasAt, orderPairs: aliasOrderPairs(doc.lines), moveCache: new Map() };
}

/**
 * Fixes for "alias B contains alias A, but A is defined first": move A down to just below B, or B up
 * to just above A. Each is checked by re-running the order analysis; a move is only "certain" when
 * it fixes this pair without breaking another one, and otherwise says what it would break.
 */
function aliasMoveFix(ctx: LintCtx, inner: string, outer: string): Fix[] {
  const k = `${outer}>${inner}`;
  const hit = ctx.moveCache.get(k);
  if (hit) return hit;
  const ia = ctx.aliasAt.get(inner);
  const ib = ctx.aliasAt.get(outer);
  let out: Fix[] = [];
  if (ia != null && ib != null && ia < ib) {
    const L = ctx.lines;
    const judge = (moved: Line[], label: string, move: Fix["move"]): Fix => {
      const after = aliasOrderPairs(moved);
      const broken = [...after].filter((p) => !ctx.orderPairs.has(p)).map((p) => p.split(">"));
      const note = broken.length ? ` — but then ${list(broken.slice(0, 2).map(([b, a]) => `${a} stops expanding inside ${b}`))}` : "";
      return { label: label + note, move, safe: broken.length === 0 && !after.has(k) };
    };
    const down = [...L];
    down.splice(ib, 0, ...down.splice(ia, 1));
    const up = [...L];
    const [o] = up.splice(ib, 1);
    up.splice(ia, 0, o);
    const fixes = [
      judge(down, `Move Alias[${inner}] down below Alias[${outer}] (line ${ib + 1})`, { id: L[ia].id, after: L[ib].id }),
      judge(up, `Move Alias[${outer}] up above Alias[${inner}] (line ${ia + 1})`, { id: L[ib].id, before: L[ia].id }),
    ];
    out = fixes.sort((x, y) => Number(!!y.safe) - Number(!!x.safe));
  }
  ctx.moveCache.set(k, out);
  return out;
}

/** The later alias that inserts `inner` into this rule, preferring one written in the rule itself. */
function inserterOf(ctx: LintCtx, inner: string, cond: string): string | undefined {
  const cands = [...ctx.orderPairs].filter((p) => p.endsWith(`>${inner}`)).map((p) => p.slice(0, p.indexOf(">")));
  return cands.find((b) => cond.includes(b)) ?? cands[0];
}

/** For "ASNTREE 13": the joined name, if that's something PD2 knows. */
function spacedJoin(cond: string, key: string, defs: Definitions): { from: string; to: string } | undefined {
  const m = cond.match(new RegExp(`(?:^|[\\s(!])(${escapeRe(key)})(\\s+)(\\d+)(?=$|[\\s)!<>=~])`));
  if (!m) return undefined;
  const to = m[1] + m[3];
  return defs.aliases.has(to) || COND_BY_CODE.has(to) ? { from: m[1] + m[2] + m[3], to } : undefined;
}

/**
 * After removing a word from conditions, drop the AND/OR it leaves dangling ("( OR t61" → "(t61"):
 * an operator with nothing on one side would make PD2 disable the whole rule.
 */
export function tidyOperators(cond: string): string {
  const OP = "(?:OR|AND|&&|\\|\\|)";
  let s = cond.replace(/\s+/g, " ").trim();
  let prev = "";
  while (prev !== s) {
    prev = s;
    s = s
      .replace(new RegExp(`(^|\\s)${OP}\\s+(${OP})(?=\\s|$)`, "g"), "$1$2")
      .replace(new RegExp(`\\(\\s*${OP}\\s+`, "g"), "(")
      .replace(new RegExp(`\\s+${OP}\\s*\\)`, "g"), ")")
      .replace(new RegExp(`^${OP}\\s+`), "")
      .replace(new RegExp(`\\s+${OP}$`), "")
      .replace(/\(\s*\)/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }
  return s;
}

// ------------------------------------------------------------------ item kinds

/** A code's kind: maps by tier (so the two PvP arena types count as one), everything else by item type. */
export function kindOf(code: string): string | undefined {
  const b = ITEM_BY_CODE.get(code);
  if (!b) return undefined;
  const tier = mapTier(b);
  return tier >= 0 ? `map${tier}` : b.t;
}

function majorityKind(codes: string[]): string | undefined {
  const n = new Map<string, number>();
  for (const c of codes) {
    const k = kindOf(c);
    if (k) n.set(k, (n.get(k) ?? 0) + 1);
  }
  const [k, count] = [...n.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
  return k && count! >= 2 && count! * 2 > codes.length ? k : undefined;
}

function kindLabel(kind: string): string {
  const MAPS: Record<string, string> = { map0: "PvP arena maps", map1: "tier 1 maps", map2: "tier 2 maps", map3: "tier 3 maps", map4: "dungeon maps", map5: "unique maps" };
  return MAPS[kind] ?? `the same kind of item`;
}

/** Comment lines directly above a rule plus its trailing note, lower-cased: what the author says it's for. */
function contextText(lines: Line[], i: number): string {
  const parts: string[] = [];
  for (let k = i - 1, n = 0; k >= 0 && n < 3 && lines[k].kind === "comment"; k--, n++) parts.push(lines[k].text ?? "");
  if (lines[i]?.note) parts.push(lines[i].note!);
  return parts.join(" ").toLowerCase();
}

/** "t61 OR t62 OR t69": one code of a different kind among codes that otherwise agree. */
function oddCodeIssues(l: Line, i: number, tree: BhNode | null): Issue[] {
  const out: Issue[] = [];
  const chains: string[][] = [];
  const walk = (n: BhNode | null, chain?: string[]) => {
    if (!n) return;
    if (n.t === "or") {
      const c = chain ?? [];
      walk(n.a, c);
      walk(n.b, c);
      if (!chain) chains.push(c);
    } else if (n.t === "leaf") {
      if (chain && n.leaf.cls === "item" && n.leaf.base) chain.push(n.leaf.code!);
    } else if (n.t === "not") walk(n.a);
    else {
      walk(n.a);
      walk(n.b);
    }
  };
  walk(tree);
  for (const codes of chains) {
    const kind = majorityKind(codes);
    if (!kind || !kind.startsWith("map")) continue; // maps are where a stray number changes the meaning
    for (const c of codes) {
      const k = kindOf(c);
      if (k === kind || !codes.some((o) => kindOf(o) === kind && o.slice(0, 2) === c.slice(0, 2))) continue;
      const others = codes.filter((o) => kindOf(o) === kind).slice(0, 3).map((o) => `${o} ${ITEM_BY_CODE.get(o)!.n}`);
      out.push(issue("cond.odd-code", l, i, `${c} is ${ITEM_BY_CODE.get(c)!.n} (${kindLabel(k!).replace(/s$/, "")}), but the other codes here are ${kindLabel(kind)}.`, replaceInRaw(l, c, "", `Remove ${c}`).map((f) => ({ ...f, key: f.key != null ? tidyOperators(f.key) : f.key })), c, {
        detail: `The codes next to it are ${list(others)}. This rule's look (and any note in it) also applies to ${ITEM_BY_CODE.get(c)!.n}, which is probably not intended.`,
        advice: `If it's there by mistake, remove ${c}.`,
      }));
    }
  }
  return out;
}

// ------------------------------------------------------------------ rule checks

const DROPPED: BhEvent["kind"][] = ["dropped-unknown", "dropped-bad-value", "dropped-param", "dropped-formula", "two-char-op"];

function eventIssues(l: Line, i: number, ev: BhEvent, cond: string, ctx: LintCtx, all: BhEvent[]): Issue[] {
  const defs = ctx.defs;
  const tokenInRaw = cond.includes(ev.token);
  const from = tokenInRaw ? "" : " (it comes from an alias)";
  const fixTok = (next: string, label: string): Fix[] => {
    const k = tokenInRaw ? replaceToken(cond, ev.token, next) : undefined;
    return k != null ? [{ label, key: k }] : [];
  };
  const drop = (): Fix[] => fixTok("", `Remove “${short(ev.token, 24)}”`).map((f) => ({ ...f, key: f.key != null ? tidyOperators(f.key) : f.key }));
  const never = all.some((e) => e.kind === "never-matches");
  const tk = short(ev.token);
  switch (ev.kind) {
    case "dropped-unknown": {
      const key = ev.detail ?? ev.token;
      // An alias whose name survived expansion: it was inserted by an alias PD2 expands later.
      if (ctx.aliasAt.has(key) && !cond.includes(key)) {
        const outer = inserterOf(ctx, key, cond);
        const ia = ctx.aliasAt.get(key)!;
        const ib = outer ? ctx.aliasAt.get(outer) : undefined;
        return [
          issue("cond.alias-text", l, i, `${key} is an alias, but it isn't expanded in this rule, so PD2 drops it.`, outer ? aliasMoveFix(ctx, key, outer) : [], key, {
            detail: outer
              ? `Alias[${key}] is defined on line ${ia + 1}, and it reaches this rule inside Alias[${outer}] (line ${ib! + 1}). PD2 expands each alias once, top to bottom — by the time ${outer} inserts “${key}”, ${key}'s turn has passed, so the plain word “${key}” is left in the conditions and ignored.`
              : `Alias[${key}] is defined on line ${ia + 1}, before the alias that inserts it, so PD2 has already expanded it by the time the word appears.`,
            advice: outer ? moveAdvice(aliasMoveFix(ctx, key, outer), `${outer} must be defined above ${key} for ${key} to expand inside it.`) : undefined,
          }),
        ];
      }
      // "ASNTREE 13": a stray space splits a name; the number half is reported with it.
      if (/^\d+$/.test(key) && new RegExp(`[A-Za-z_]\\s+${key}(?=$|[\\s)!<>=~])`).test(cond)) {
        const word = cond.match(new RegExp(`([A-Za-z0-9_]+)\\s+${key}(?=$|[\\s)!<>=~])`))?.[1];
        if (word && spacedJoin(cond, word, defs)) return [];
      }
      const joined = tokenInRaw ? spacedJoin(cond, key, defs) : undefined;
      if (joined)
        return [
          issue("cond.unknown", l, i, `“${joined.from}” has a space in the middle, so PD2 reads two unknown words instead of ${joined.to}.`, [{ label: `Change to ${joined.to}`, key: cond.replace(joined.from, joined.to), safe: true }], joined.from, {
            detail: "Conditions are split on spaces. Neither half is something PD2 knows, so both are dropped and the rule matches more than written.",
          }),
        ];
      const sugg = suggestKeyword(key, defs).filter((s) => s.text !== key);
      const fixes = sugg.flatMap((s) => {
        const f = fixTok(ev.token.replace(key, s.text), `Use ${s.text}`);
        return s.text === key.toUpperCase() ? safe(f) : f;
      });
      const bang = new RegExp(`!\\(?${escapeRe(ev.token)}`).test(cond);
      return [
        issue("cond.unknown", l, i, `“${short(key)}” isn't a condition PD2 knows, so it's dropped${from}.`, [...fixes, ...drop()], ev.token, {
          detail:
            never && bang
              ? `PD2 skips the word but keeps the ! in front of it. That ! has nothing left to negate, which makes the whole rule invalid — it never matches.`
              : `PD2 skips words it doesn't recognise and checks the rule without them, so the rule matches more items than written.`,
          advice: sugg.length ? `Did you mean ${sugg.map((s) => `${s.text} (${s.why})`).join(" or ")}?` : undefined,
        }),
      ];
    }
    case "item-looks-like-keyword":
      return [
        issue("cond.lowercase", l, i, `“${tk}” is read as an item code, not the ${ev.detail} keyword${from}.`, safe(fixTok(ev.token.toUpperCase(), `Change to ${ev.token.toUpperCase()}`)), ev.token, {
          detail: "A word with no capital letter in its first three characters is treated as an item code. No item has this code, so this part never matches.",
        }),
      ];
    case "item-unknown": {
      const code = ev.detail ?? ev.token;
      if (/^\d+$/.test(code)) {
        // "SK263>0 OR 264>0": a prefix was left off. Use the nearest prefix before it.
        const at = cond.indexOf(ev.token);
        const before = [...cond.slice(0, Math.max(0, at)).matchAll(new RegExp(`\\b(${PARAM_PREFIXES.join("|")})\\d+`, "g"))];
        const prefix = before.length ? before[before.length - 1][1] : cond.match(new RegExp(`\\b(${PARAM_PREFIXES.join("|")})\\d+`))?.[1];
        return [
          issue("cond.item-unknown", l, i, `“${tk}” starts with a number, so PD2 reads it as an item code — and no item has the code “${code}”${from}.`, prefix ? fixTok(`${prefix}${ev.token}`, `Change to ${prefix}${ev.token}`) : drop(), ev.token, {
            detail: "Words whose first three characters have no capital letter are compared against item codes. This one can never match, so inside an OR it's harmless dead text, and inside an AND it disables the rule.",
            advice: prefix ? `It sits among ${prefix} conditions — did you mean ${prefix}${ev.token}?` : undefined,
          }),
        ];
      }
      const neighbours = [...cond.matchAll(/(?:^|[\s(!])([a-z0-9]{3,4})(?=$|[\s)!])/g)].map((m) => m[1]).filter((c) => c !== code && ITEM_BY_CODE.has(c));
      // What kind of item the rule is about, when its other codes agree (PvP maps, bolts…).
      const kind = majorityKind(neighbours);
      let sugg = suggestItemCode(code, neighbours).filter((s) => !neighbours.includes(s.text) && (!kind || kindOf(s.text) === kind));
      // An item named in the comment above the rule is the best hint ("// Hide rare Heavy Bolts").
      const note = contextText(ctx.lines, i);
      const named = note ? DATA.items.find((it) => it.n.length >= 4 && note.includes(it.n.toLowerCase()) && (it.c.slice(0, 2) === code.slice(0, 2) || kindOf(it.c) === kind)) : undefined;
      const kw = COND_BY_CODE.get(code.toUpperCase());
      let advice: string | undefined;
      if (named && neighbours.includes(named.c)) {
        sugg = [];
        advice = `The comment above says “${named.n}”, which is ${named.c} — already in this list. “${code}” looks like a leftover, so remove it.`;
      } else if (named) {
        sugg = [{ text: named.c, why: `${named.n}, as the comment above says` }, ...sugg.filter((s) => s.text !== named.c)];
      }
      if (!advice && kind && !sugg.length) {
        const eg = neighbours.slice(0, 2).map((c) => `${c} ${ITEM_BY_CODE.get(c)!.n}`);
        advice = `The other codes here are ${kindLabel(kind)} (${list(eg)}). No such item has a code like “${code}”, so it's probably a leftover — remove it.`;
      }
      if (!advice && (sugg.length || kw)) advice = `Did you mean ${[...(kw && kw.kind !== "logic" ? [`${code.toUpperCase()} (${kw.label})`] : []), ...sugg.map((s) => `${s.text} (${s.why})`)].join(", ")}?`;
      const fixes = [...(kw && kw.kind !== "logic" ? fixTok(ev.token.replace(code, code.toUpperCase()), `Use ${code.toUpperCase()} (${kw.label})`) : []), ...sugg.flatMap((s) => fixTok(ev.token.replace(code, s.text), `Use ${s.text} — ${s.why}`)), ...drop()];
      const found = issue("cond.item-unknown", l, i, `No item has the code “${code}”, so this part never matches${from}.`, fixes, ev.token, {
        detail: "PD2 compares item codes exactly. Inside an OR a wrong code is dead text; inside an AND it disables the rule.",
        advice,
      });
      if (tokenInRaw && ev.token.includes(code)) found.swap = { token: ev.token, code };
      return [found];
    }
    case "item-truncated":
      return [issue("cond.item-long", l, i, `“${tk}” is compared as “${ev.detail}”${from}.`, fixTok(ev.detail!, `Shorten to ${ev.detail}`), ev.token, { detail: "Only the first 4 characters of an item code are compared; the rest is ignored." })];
    case "two-char-op": {
      const m = ev.token.match(/^([!(]*)([A-Z0-9_,+]+)(>=|<=|==|!=|<>)(-?\d+)([)!]*)$/);
      const fixes: Fix[] = [];
      let next = "";
      if (m) {
        const [, pre, k, op, num, post] = m;
        const n = Number(num);
        next = op === ">=" ? `${k}>${n - 1}` : op === "<=" ? `${k}<${n + 1}` : op === "==" ? `${k}=${n}` : `!${k}=${n}`;
        fixes.push(...safe(fixTok(`${pre}${next}${post}`, `Change to ${next}`)));
      }
      return [
        issue("cond.two-char-op", l, i, `“${tk}” uses ${ev.detail}, which conditions don't support${from}.`, fixes, ev.token, {
          detail: `PD2 only reads one-character comparisons (<, >, =, ~). With ${ev.detail} it throws the whole condition away — along with any ( or ) attached to it — so the rule matches more than written.`,
          advice: next ? `Write ${next}; it means the same thing.` : undefined,
        }),
      ];
    }
    case "dropped-bad-value":
      return [
        issue("cond.bad-value", l, i, `“${tk}” compares against “${short(ev.detail ?? "", 20)}”, which isn't a whole number, so PD2 drops the condition${from}.`, drop(), ev.token, {
          detail: "Any ) or ! attached to a dropped condition is lost with it, which can also change the grouping of the rest of the rule.",
          advice: /^[A-Z]/.test(ev.detail ?? "") ? "Conditions only compare against numbers. To compare two stats with each other, use a formula: $f(A>B)." : undefined,
        }),
      ];
    case "value-junk": {
      const m = ev.token.match(/^([!(]*)([A-Z0-9_,+]+)([<>=])(\d+)[~-](\d+)([)!]*)$/);
      const range = m && m[3] === "=" ? `${m[2]}~${m[4]}-${m[5]}` : undefined;
      const lead = (ev.detail ?? "").match(/^-?\d+/)?.[0];
      const paren = /\)\(/.test(ev.token);
      const fixes = range ? fixTok(`${m![1]}${range}${m![6]}`, `Change to ${range}`) : paren ? fixTok(ev.token.replace(/\)\(/g, ") ("), "Add the missing space before (") : [];
      const readAs = /^[A-Z]+\d+$/.test(ev.detail ?? "") ? ev.detail : lead != null ? `${ev.token.replace(/^[!(]*/, "").split(/[<>=~]/)[0]}${ev.token.match(/[<>=~]/)?.[0] ?? ""}${lead}` : undefined;
      return [
        issue("cond.value-junk", l, i, `“${tk}” is read as ${readAs ?? "just its leading number"}${from}.`, fixes, ev.token, {
          detail: paren
            ? "There's no space before the (, so PD2 reads everything up to the next space as one word and only uses the first number in it; the rest of that word — including the ( — is thrown away."
            : "PD2 reads the number up to the first character that isn't a digit and ignores the rest.",
          advice: range ? `For “between ${m![4]} and ${m![5]}” write ${range}.` : undefined,
        }),
      ];
    }
    case "empty-value":
      return [issue("cond.empty-value", l, i, `“${tk}” has no number, so it compares against 0${from}.`, fixTok(`${ev.token}0`, `Make it ${ev.token}0`), ev.token)];
    case "no-operator":
      return [
        issue("cond.no-operator", l, i, `“${tk}” has no comparison, so it's always false${from}.`, fixTok(`${ev.token}>0`, `Change to ${ev.token}>0`), ev.token, {
          detail: `${ev.token} is a number, not a yes/no condition. On its own PD2 treats it as never true (and !${ev.token} as always true).`,
          advice: `If you mean “has any”, write ${ev.token}>0.`,
        }),
      ];
    case "op-ignored": {
      // A comparison on an unknown item code is already reported as that.
      if (all.some((e) => e.kind === "item-unknown" && e.token === ev.token)) return [];
      const m = ev.token.match(/^(.+?)([<>=~])(.*)$/);
      if (!m) return [];
      const [, k, op, val] = m;
      const isItem = !/[A-Z]/.test(k.slice(0, 3));
      const what = isItem ? `${k} is an item code` : `${k} is a yes/no condition`;
      const meantNot = (op === "=" && val === "0") || (op === "<" && val === "1");
      return [
        issue(
          "cond.op-ignored",
          l,
          i,
          meantNot ? `“${tk}” still means ${k}: ${what}, so the “${op}${val}” is ignored${from}.` : `The “${op}${val}” in “${tk}” is ignored — ${what}${from}.`,
          meantNot ? fixTok(`!${k}`, `Change to !${k}`) : safe(fixTok(k, `Change to ${k} (same meaning)`)),
          ev.token,
          {
            detail: `Yes/no conditions and item codes don't take comparisons; PD2 reads “${ev.token}” as just “${k}”.`,
            advice: meantNot ? `To match items that are not ${k}, write !${k}.` : `Write ${k} on its own — it behaves exactly the same.`,
          }
        ),
      ];
    }
    case "dropped-param":
      return [issue("cond.param", l, i, `“${tk}”: ${ev.detail}, so PD2 drops it${from}.`, drop(), ev.token, { detail: "A dropped condition is skipped entirely, so the rule matches more than written." })];
    case "dropped-formula": {
      const up = ev.token.replace(/^[!(]*/, "").replace(/[)!]*$/, "").toUpperCase();
      return [issue("cond.formula-ref", l, i, `“${tk}” is dropped: ${ev.detail}${from}.`, ev.detail?.startsWith("references are case") ? safe(fixTok(ev.token.replace(/formula\w*/i, (x) => x.toUpperCase()), `Change to ${up}`)) : [], ev.token)];
    }
    case "range-no-dash": {
      const n = ev.token.split("~")[1]?.match(/^\d+/)?.[0];
      return [issue("cond.range", l, i, `“${tk}” has no second number, so it means ${n}–0 and never matches${from}.`, [], ev.token, { advice: `Write a range as KEY~low-high, e.g. ${ev.token.split("~")[0]}~${n}-${n}.` })];
    }
    case "range-inverted":
      return [issue("cond.range", l, i, `“${tk}”: the first number is larger than the second, so it never matches${from}.`, [], ev.token)];
    case "add-range":
      return [issue("cond.range", l, i, `“${tk}”: this kind of condition only keeps the first number, so a ~ range never matches${from}.`, [], ev.token)];
    case "add-part-skipped":
      return []; // grouped per token in addPartIssues
    case "mid-token-paren":
      return [
        issue("cond.paren-mid", l, i, `“${tk}” has !, ( or ) in the middle of a word${from}.`, /\)\(/.test(ev.token) ? fixTok(ev.token.replace(/\)\(/g, ") ("), "Add the missing space before (") : [], ev.token, {
          detail: "PD2 only treats !, ( and ) as operators at the start or end of a word. In the middle they're part of the word, which PD2 then misreads.",
        }),
      ];
    case "stray-close":
      return [
        issue("cond.stray-close", l, i, "An extra ) makes PD2 stop reading the conditions.", [], ")", {
          detail: ev.detail ? `Everything after it is ignored: ${short(ev.detail, 120)}.` : "Everything after it is ignored.",
        }),
      ];
    case "unclosed-open":
      return [issue("cond.unclosed", l, i, "A ( is never closed.", [], "(", { detail: ev.detail ? `PD2 ${ev.detail}.` : "PD2 closes it at the end of the line." })];
    case "never-matches": {
      const dropped = [...new Set(all.filter((e) => DROPPED.includes(e.kind)).map((e) => `“${short(e.token, 24)}”`))];
      return [
        issue("cond.never", l, i, "This rule can never match.", [], undefined, {
          detail: dropped.length
            ? `PD2 dropped ${list(dropped)}. What's left isn't a valid condition — an !, AND or OR ended up with nothing next to it — so PD2 disables the whole rule.`
            : "The conditions don't form a valid expression (an !, AND or OR has nothing next to it), so PD2 disables the whole rule.",
        }),
      ];
    }
    case "matches-everything": {
      const dropped = [...new Set(all.filter((e) => DROPPED.includes(e.kind)).map((e) => `“${short(e.token, 24)}”`))];
      return [issue("cond.match-all", l, i, "This rule matches every item.", [], undefined, { detail: `PD2 dropped every condition${dropped.length ? ` (${list(dropped)})` : ""}, and a rule with no conditions applies to everything.` })];
    }
    case "island-failed":
      return [issue("cond.island", l, i, `${tk} doesn't compile: ${ev.detail}.`, [], ev.token, { detail: "A failed $f(…) stays as raw text, which PD2 then reads as junk words and a stray )." })];
    case "value-out-of-domain":
      return [issue("cond.byte", l, i, `“${tk}”: ${ev.detail}${from}.`, [], ev.token)];
  }
  return [];
}

/** "A+B>n" sums with parts PD2 doesn't add: one problem per sum, and one fix that turns every such sum on the line into a formula. */
function addPartIssues(l: Line, i: number, cond: string, events: BhEvent[], defs: Definitions): Issue[] {
  const byToken = new Map<string, string[]>();
  for (const e of events) if (e.kind === "add-part-skipped") (byToken.get(e.token) ?? byToken.set(e.token, []).get(e.token)!).push(e.detail ?? "");
  if (!byToken.size) return [];
  let next = cond;
  for (const tok of byToken.keys()) {
    const m = tok.match(/^(.*?)([<>=~].*)$/);
    const r = m ? replaceToken(next, tok, `$f(${m[1]})${m[2]}`) : undefined;
    if (r != null) next = r;
  }
  const ok = next !== cond && !compileCondition(next, defs).bh.events.some((e) => e.kind === "add-part-skipped" || e.kind === "island-failed" || DROPPED.includes(e.kind));
  const fix: Fix[] = ok ? [{ label: byToken.size > 1 ? "Turn these sums into formulas" : "Turn the sum into a formula", key: next }] : [];
  return [...byToken.entries()].map(([tok, parts]) => {
    const uniq = [...new Set(parts)];
    return issue("cond.add-part", l, i, `${list(uniq.map((p) => `“${p}”`))} ${uniq.length > 1 ? "aren't" : "isn't"} added in this sum — ${uniq.length > 1 ? "they count" : "it counts"} as 0.`, fix, tok, {
      detail: `In “${short(tok, 60)}”, PD2 only adds LIFE, MANA, STR, DEX, CRES, FRES, LRES, PRES, MINDMG, MAXDMG, EDEF, EDAM, FCR, AR, REPLIFE, STATn, MULTIa,b and formulas. Anything else contributes nothing, so the total is lower than you expect.`,
      advice: "Inline formulas understand every stat: wrap the sum in $f( … ) and keep the comparison outside.",
    });
  });
}

function flagHolds(leaf: BhLeaf, code: string): boolean | null {
  // Item-independent checks of a group/tier flag against a specific base code.
  if (leaf.cls !== "flag" || !leaf.kw) return null;
  const k = leaf.kw.code;
  if (QUALITY.includes(k) || ["ID", "ETH", "RW", "SUP", "INF", "GEMMED", "FOOLS", "TRUE", "FALSE"].includes(k)) return null;
  if (leaf.kw.mutable) return null;
  return evalLeaf({ ...leaf, cls: "flag" } as never, { item: makeItem(code), ctx: DEFAULT_CTX, defs: { aliases: new Map(), formulas: new Map(), levels: [] } });
}

function semanticIssues(l: Line, i: number, r: CompiledRule, levelCount: number): Issue[] {
  const out: Issue[] = [];
  const req = requiredLeaves(r.bh.tree);
  if (!req.length) return out;
  const flags = req.filter((x) => x.cls === "flag").map((x) => x.kw!.code);
  const q = [...new Set(flags.filter((f) => QUALITY.includes(f)))];
  if (q.length > 1) out.push(issue("sem.conflict", l, i, `An item can't be ${q.join(" and ")} at the same time.`));
  const t = [...new Set(flags.filter((f) => TIERS.includes(f)))];
  if (t.length > 1) out.push(issue("sem.conflict", l, i, `A base can't be ${t.join(" and ")} at the same time.`));
  if (flags.includes("SUP") && flags.includes("INF")) out.push(issue("sem.conflict", l, i, "An item can't be both superior and inferior."));
  const codes = [...new Set(req.filter((x) => x.cls === "item" && x.base).map((x) => x.code!))];
  if (codes.length > 1) out.push(issue("sem.conflict", l, i, `An item can't have two codes (${codes.join(", ")}) at once.`));
  if (codes.length === 1) {
    const code = codes[0];
    const base = ITEM_BY_CODE.get(code)!;
    for (const leaf of req) {
      const holds = flagHolds(leaf, code);
      if (holds === false) out.push(issue("sem.conflict", l, i, `${base.n} (${code}) is never ${leaf.kw!.label.toLowerCase()} (${leaf.kw!.code}).`));
    }
    const kinds: [string, boolean, string][] = [
      ["GOLD", code !== "gld", "only gold piles have GOLD"],
      ["RUNE", !/^r\d\ds?$/.test(code), "RUNE is only true for runes"],
      ["GEMLEVEL", !base.tc.some((t) => /^gem[a-z]$|^gg[34][a-z]$/.test(t)), "only gems have a gem level"],
      ["GEMTYPE", !base.tc.some((t) => /^gem[a-z]$|^gg[34][a-z]$/.test(t)), "only gems have a gem type"],
    ];
    for (const [k, bad, why] of kinds) if (bad && req.some((x) => x.kw?.code === k)) out.push(issue(k === "GOLD" ? "sem.gold" : "sem.conflict", l, i, `${base.n}: ${why}.`));
    if (base.cat === "misc" && flags.includes("ETH")) out.push(issue("sem.conflict", l, i, `${base.n} can't be ethereal.`));
  }
  if (req.some((x) => x.kw?.code === "GOLD") && (codes.length || flags.some((f) => ["WEAPON", "ARMOR"].includes(f)))) out.push(issue("sem.gold", l, i, "GOLD is only true for gold piles, so combining it with other items never matches."));

  // Contradictory ranges and impossible values on the same key.
  const DOMAIN: Record<string, [number, number]> = {
    CLVL: [1, 99], DIFF: [0, 2], FILTLVL: [0, Math.max(1, Math.min(12, levelCount))], ILVL: [1, 99], ALVL: [0, 99], CRAFTALVL: [0, 99], REROLLALVL: [0, 99],
    SOCKETS: [0, 6], SOCK: [0, 6], MAXSOCKETS: [0, 6], RUNE: [1, 33], GEMLEVEL: [1, 5], GEM: [1, 5], GEMTYPE: [1, 7], MAPTIER: [-1, 5], WIDTH: [1, 2], HEIGHT: [1, 4], AREA: [1, 8],
  };
  const bounds = new Map<string, [number, number]>();
  for (const leaf of req) {
    if (leaf.cls !== "value" || !leaf.op || !leaf.kw) continue;
    const k = leaf.kw.code;
    let lo = -Infinity;
    let hi = Infinity;
    if (leaf.op === ">") lo = leaf.v + 1;
    else if (leaf.op === "<") hi = leaf.v - 1;
    else if (leaf.op === "=") lo = hi = leaf.v;
    else {
      lo = leaf.v;
      hi = leaf.v2;
    }
    if (k !== "PREFIX" && k !== "SUFFIX" && k !== "RES") {
      const cur = bounds.get(k) ?? [-Infinity, Infinity];
      const next: [number, number] = [Math.max(cur[0], lo), Math.min(cur[1], hi)];
      if (next[0] > next[1] && cur[0] <= cur[1]) out.push(issue("sem.range-conflict", l, i, `${k} can't satisfy all of its conditions at once.`));
      bounds.set(k, next);
    }
    const dom = DOMAIN[k];
    if (dom && (lo > dom[1] || hi < dom[0])) {
      if (k === "FILTLVL")
        out.push(issue("sem.domain", l, i, `${leaf.text} is never true: the highest filter level in this file is ${dom[1]}.`, [], leaf.text, {
          detail: `Level 0 is “Show All Items”, and each ItemDisplayFilterName line adds one more (this file has ${levelCount}), so FILTLVL goes from 0 to ${dom[1]}.`,
        }));
      else out.push(issue("sem.domain", l, i, `${leaf.text} is never true: ${k} only goes from ${dom[0]} to ${dom[1]}.`, [], leaf.text));
    }
    if ((k === "PREFIX" || k === "SUFFIX") && (leaf.op === "<" || leaf.op === ">")) out.push(issue("sem.affix-op", l, i, `${leaf.text} is always false: use = or ~ with affix ids.`, [], leaf.text));
    if ((k === "PREFIX" || k === "SUFFIX") && (flags.includes("UNI") || flags.includes("SET"))) out.push(issue("sem.affix-op", l, i, `${k} is always false on uniques and sets.`, [], leaf.text));
    if (k === "RES" && leaf.op !== ">") {
      const n = leaf.v;
      const meaning = leaf.op === "<" ? `every resistance is below ${n}` : leaf.op === "=" ? `all four resistances are exactly ${n}` : `every resistance is between ${leaf.v} and ${leaf.v2}`;
      out.push(issue("sem.res", l, i, `${leaf.text} is only true when ${meaning}.`, [], leaf.text, {
        detail: `RES isn't one number: PD2 runs the comparison on fire, cold, lightning and poison resistance separately and needs all four to pass. For all-resist items that's what you'd expect; for an item with ${leaf.op === "<" ? `${n + 10} fire resist and nothing else, ${leaf.text} is false` : `only one resistance, ${leaf.text} is false`}.`,
      }));
    }
    if (k === "MAPTIER" && leaf.op === "<" && !flags.includes("MISC") && !codesIn(r.bh.tree!).length)
      out.push(issue("sem.maptier", l, i, `${leaf.text} is also true for every item that isn't a map.`, [], leaf.text, { detail: "Items that aren't maps have map tier −1, which is below any number you compare against." }));
  }
  // Unstacked runes/gems without their stacked twin.
  const allCodes = new Set(r.bh.tree ? codesIn(r.bh.tree) : []);
  for (const c of allCodes) {
    const stacked = `${c}s`;
    if (/^r\d\d$/.test(c) && !allCodes.has(stacked) && ITEM_BY_CODE.has(stacked)) {
      out.push(issue("sem.stacked", l, i, `${ITEM_BY_CODE.get(c)?.n} drops as ${stacked} (stacked) too; this rule only matches ${c}.`, safe(replaceInRaw(l, c, `(${c} OR ${stacked})`, `Also match ${stacked}`)), c));
      break;
    }
  }
  return out;
}

/** True when every way the tree can match requires a leaf that satisfies `pred` (or the negation of one satisfying `negPred`). */
function everywhere(n: BhNode, pred: (x: BhLeaf) => boolean, negPred: (x: BhLeaf) => boolean = () => false): boolean {
  if (n.t === "leaf") return pred(n.leaf);
  if (n.t === "not") return n.a.t === "leaf" && negPred(n.a.leaf);
  if (n.t === "and") return everywhere(n.a, pred, negPred) || everywhere(n.b, pred, negPred);
  return everywhere(n.a, pred, negPred) && everywhere(n.b, pred, negPred);
}

function codesIn(n: import("./bh").BhNode): string[] {
  if (n.t === "leaf") return n.leaf.cls === "item" && n.leaf.code ? [n.leaf.code] : [];
  if (n.t === "not") return [];
  return [...codesIn(n.a), ...codesIn(n.b)];
}

function replaceInRaw(l: Line, token: string, next: string, label: string): Fix[] {
  const k = replaceToken(l.key ?? "", token, next);
  return k != null ? [{ label, key: k }] : [];
}

function outputIssues(l: Line, i: number, r: CompiledRule | undefined, defs: Definitions): Issue[] {
  const out: Issue[] = [];
  const value = l.value ?? "";
  const segs = segmentOutput(value, defs);
  const action = r?.action ?? buildAction(value, defs);
  const fixVal = (from: string, to: string, label: string): Fix[] => (value.includes(from) ? [{ label, value: value.replace(from, to) }] : []);

  // PD2 pairs % signs left to right and only upper-cases a %word% that opens on an even one.
  // A lowercase keyword sitting between an odd and even % is never upper-cased, so it prints.
  const pcts = [...value].flatMap((ch, k) => (ch === "%" ? [k] : []));
  let at = 0;
  for (const s of segs) {
    const start = value.indexOf(s.raw, at);
    at = start >= 0 ? start + s.raw.length : at;
    const inner = s.raw.slice(1, -1);
    if (start < 0 || !s.raw.startsWith("%") || !/[a-z]/.test(inner) || classifyKeywordSafe(inner) === "unknown") continue;
    const before = pcts.filter((p) => p < start).length;
    if (before % 2 === 1)
      out.push(issue("out.lowercase", l, i, `${s.raw} comes after an unpaired % sign, so PD2 doesn't upper-case it and it prints literally.`, safe(fixVal(s.raw, s.raw.toUpperCase(), `Write ${s.raw.toUpperCase()}`))));
  }
  if (pcts.length % 2 === 1 && pcts.length > 1 && /%[a-z_]+%/.test(value))
    out.push(issue("out.percent", l, i, `This output has an odd number of % signs (${pcts.length}), so one of them isn't part of a keyword.`, percentFix(value, defs), value.match(/\d%(?=\s|$)/)?.[0], {
      detail: "PD2 pairs % signs from left to right. A lone % shifts every pair after it, so keywords later in the output can print as plain text.",
    }));

  for (const s of segs) {
    if (s.kind === "unknown") {
      const code = s.code ?? "";
      const n = code.match(/^(BORDER|MAP|DOT|PX|LINE|NOTIFY|SOUNDID|TIER)-(.+)$/);
      if (n) {
        const msg = n[1] === "TIER" && /^\d+$/.test(n[2]) ? `${s.raw}: TIER is read as a single digit (0–9), so this prints as text.` : `${s.raw}: “${n[2]}” isn't a valid value for ${n[1]}.`;
        out.push(issue("out.notify-syntax", l, i, msg, n[1] === "TIER" && Number(n[2]) > 9 ? fixVal(s.raw, "%TIER-9%", "Use %TIER-9%") : []));
        continue;
      }
      const lowerAlias = [...defs.aliases.keys()].find((a) => a.toUpperCase() === code && s.raw !== `%${a.toUpperCase()}%`);
      if (lowerAlias) {
        out.push(issue("alias.output-case", l, i, `${s.raw} must be written %${lowerAlias.toUpperCase()}% to expand the alias.`, safe(fixVal(s.raw, `%${lowerAlias.toUpperCase()}%`, `Write %${lowerAlias.toUpperCase()}%`))));
        continue;
      }
      const pm = code.match(/^([A-Z_]+?)(\d+)?(?:,(\d+))?$/);
      if (pm && ["STAT", "SK", "OS", "CLSK", "TABSK", "CHARSTAT", "MULTI", "NAME", "ILVL"].includes(pm[1]) && (pm[2] != null || ["STAT", "MULTI", "SK", "OS"].includes(pm[1]))) {
        out.push(issue("out.params", l, i, `${s.raw} has the wrong number of parameters and prints literally.`));
        continue;
      }
      // Usually not a misspelt keyword at all but a % used as text: "10%pdr" or a stray "%Tombsong".
      const at = value.indexOf(s.raw);
      const prev = at > 0 ? value[at - 1] : "";
      const inner = s.raw.slice(1, -1);
      const literal = /[\d\])]/.test(prev) || /^\s/.test(inner) || /\s$/.test(inner);
      const tryFix = (next: string, label: string): Fix[] => {
        const v = value.slice(0, at) + next + value.slice(at + s.raw.length);
        const before = segs.filter((x) => x.kind === "unknown").length;
        const after = segmentOutput(v, defs).filter((x) => x.kind === "unknown").length;
        return at >= 0 && after < before ? [{ label, value: v }] : [];
      };
      if (at >= 0 && (literal || /^[A-Za-z][a-z]/.test(inner))) {
        const fixes = literal ? tryFix(`%PERCENT%${s.raw.slice(1)}`, "Write this % as %PERCENT%") : tryFix(s.raw.slice(1), `Remove the stray % before “${short(inner, 16)}”`);
        if (fixes.length || literal) {
          out.push(issue("out.unknown", l, i, literal ? `The % in “${value.slice(0, at).match(/[^\s%{}]{0,8}$/)?.[0] ?? ""}%${short(inner.trim(), 12)}” is meant as a percent sign, but PD2 reads it as the start of a keyword.` : `The % before “${short(inner, 20)}” looks like a typo: PD2 reads “${short(s.raw, 24)}” as a keyword.`, fixes, s.raw, {
            detail: `PD2 pairs up % signs from left to right. “${short(s.raw, 24)}” isn't a keyword, so it prints as text — and every % after it is paired with the wrong partner, so keywords later in the output can print literally too.`,
            advice: literal ? "Write %PERCENT% for a literal percent sign." : undefined,
          }));
          continue;
        }
      }
      const sugg = suggestOutputKeyword(code, defs);
      out.push(issue("out.unknown", l, i, `${short(s.raw, 30)} isn't a keyword PD2 knows, so it prints as text.`, sugg.flatMap((x) => fixVal(s.raw, x.text, `Use ${x.text}`)), s.raw, {
        advice: sugg.length ? `Did you mean ${sugg.map((x) => `${x.text} (${x.why})`).join(" or ")}?` : undefined,
      }));
    }
    if ((s.kind === "notify" || (s.kind === "special" && s.code === "CONTINUE")) && !s.used) {
      if (s.kind === "special" && s.inDesc) out.push(issue("out.continue-desc", l, i, "%CONTINUE% is inside the { } description, so it prints there and the rule stops.", fixVal(s.raw, "", "Move it out of the braces").map((f) => ({ ...f, value: f.value + "%CONTINUE%" }))));
      else if (s.inDesc && (s.code === "SOUNDID" || s.code === "MAP")) out.push(issue("out.duplicate", l, i, `${s.raw} inside { } isn't read and prints in the description.`));
      else out.push(issue("out.duplicate", l, i, `${s.raw} is a second ${s.code} keyword; only the first counts, this one prints literally.`, safe(fixVal(s.raw, "", "Remove the duplicate"))));
    }
    if (s.kind === "formula" && !action.name.includes("ISLAND") && !defs.formulas.has(s.code!)) out.push(issue("out.formula", l, i, `${s.raw}: no Formula[${s.code}] is defined.`));
    if (s.kind === "island") {
      const c = tryCompile(expandAliases(s.code ?? "", defs.aliases, "out"));
      if (c.error) out.push(issue("out.island", l, i, `${s.raw}: ${c.error.message}`));
    }
  }
  // Braces beyond the description span.
  const span = descSpan(value);
  const extra = [...value].filter((ch, k) => (ch === "{" || ch === "}") && (!span || (k !== span.open && k !== span.close))).length;
  if (extra) out.push(issue("out.braces", l, i, `${extra} brace${extra > 1 ? "s" : ""} outside the description will print literally.`));

  const e = action.effects;
  const hasIcon = ICON_KINDS.some((k) => e[k]);
  const rawOf = (code: string) => segs.find((s) => s.used && s.code === code)?.raw;
  if (e.tier != null && !action.isMap) {
    const raw = rawOf("TIER");
    out.push(issue("out.tier-no-effect", l, i, `${raw ?? "%TIER%"} does nothing here: this rule has no minimap icon or sound.`, raw ? safe(fixVal(raw, "", `Remove ${raw}`)) : [], raw, {
      detail: "TIER only decides whether a rule's icon/sound notification fires at the current filter level. Without %MAP%, %DOT%, %BORDER% or %SOUNDID% on the same rule there's nothing for it to silence.",
    }));
  }
  if (e.notify) {
    const raw = rawOf("NOTIFY");
    out.push(issue("out.notify-noop", l, i, `${raw ?? "%NOTIFY-…%"} has no effect in PD2.`, raw ? safe(fixVal(raw, "", `Remove ${raw}`)) : [], raw, {
      detail: "PD2 reads %NOTIFY-x% (so it doesn't print) but never uses it. Icons and sounds come from %MAP%, %DOT%, %BORDER% and %SOUNDID%.",
    }));
  }
  const soundSeg = segs.find((s) => s.used && s.code === "SOUNDID");
  if (soundSeg) {
    const id = Number(soundSeg.param);
    if (id === 0 || id >= DATA.meta.soundRecs) out.push(issue("out.sound", l, i, `Sound ${id} doesn't exist, so the rule plays nothing${hasIcon ? "" : " and doesn't notify"}.`));
    else if (!SOUND_BY_ID.has(id)) out.push(issue("out.sound", l, i, `Sound ${id} is a looping/music sound, which PD2 won't play.`));
  }
  const nameText = action.name.replace(/%[A-Z_]+\d*(?:,\d+)?%/g, (m) => (/%(NAME|BASENAME)%/.test(m) ? "Xxxxxxxxxxxxxxx" : COLOR_LIKE.test(m) ? "" : "xxxx"));
  if (action.name.trim() === "" && action.isMap) out.push(issue("out.hide-with-icon", l, i, "This rule hides the label but has an icon or sound: the item still notifies (with an empty name) and its sprite stays visible."));
  else if (action.name !== "" && nameText.replace(/[\s]/g, "") === "" && !/%(NL|CL|CS)%/.test(action.name)) out.push(issue("out.blank-label", l, i, "Only colors or spaces: PD2 shows an empty label instead of hiding the item. Leave the output empty to hide it."));
  const literalLen = segs.filter((s) => s.kind === "text" && !s.inDesc).reduce((n, s) => n + s.raw.length, 0);
  const shopOnly = !!r && requiredLeaves(r.bh.tree).some((x) => x.kw?.code === "SHOP");
  if (literalLen > NAME_DISPLAY_LIMIT && !shopOnly) out.push(issue("out.name-length", l, i, `The literal text alone is ${literalLen} characters; PD2 cuts names at ${NAME_DISPLAY_LIMIT}.`));
  // A lone % already pinned to a specific spot doesn't need the general warning too.
  if (out.some((x) => x.check === "out.unknown" && x.advice?.includes("%PERCENT%"))) return out.filter((x) => x.check !== "out.percent");
  return out;
}
/** "20% Damage": a number followed by % and a space is a percent sign. Offered only if it leaves an even, keyword-clean output. */
function percentFix(value: string, defs: Definitions): Fix[] {
  const next = value.replace(/(\d)%(?=\s|$)/g, "$1%PERCENT%");
  if (next === value || (next.match(/%/g) ?? []).length % 2) return [];
  const unknown = (v: string) => segmentOutput(v, defs).filter((s) => s.kind === "unknown").length;
  return unknown(next) <= unknown(value) ? [{ label: "Write the percent sign as %PERCENT%", value: next }] : [];
}
const COLOR_LIKE = /^%(WHITE|RED|GREEN|BLUE|GOLD|GRAY|BLACK|TAN|ORANGE|YELLOW|PURPLE|DARK_GREEN|CORAL|SAGE|TEAL|LIGHT_GRAY|\w+_TRANS)%$/;

function outputContextIssues(l: Line, i: number, r: CompiledRule): Issue[] {
  const out: Issue[] = [];
  const req = requiredLeaves(r.bh.tree);
  const codes = req.filter((x) => x.cls === "item" && x.base).map((x) => x.code!);
  const name = r.action.name;
  // %NL% in names only works for some items.
  const breaks = (name.match(/%(NL|CL)%/g) ?? []).length;
  if (breaks && r.bh.tree) {
    const magicPlus = (x: BhLeaf) => x.cls === "flag" && ["MAG", "RARE", "SET", "UNI", "CRAFT", "RW", "SHOP"].includes(x.kw!.code);
    const staffmod = (x: BhLeaf) => x.cls === "param" && ["SK", "OS", "CLSK", "TABSK", "CHSK"].includes(x.prefix ?? "") && (x.op === ">" || (x.op === "=" && x.v > 0));
    const always = everywhere(r.bh.tree, magicPlus, (x) => x.cls === "flag" && x.kw?.code === "NMAG");
    const skills = !always && everywhere(r.bh.tree, (x) => magicPlus(x) || staffmod(x), (x) => x.cls === "flag" && x.kw?.code === "NMAG");
    if (!always && !(skills && breaks === 1))
      out.push(issue("out.newline", l, i, skills ? "Only the first line break in this name works on the normal items this rule can match." : "Line breaks in the name don't work on the normal-quality items this rule can match.", [], undefined, {
        detail: "In item names, %NL% and %CL% only work for magic, rare, set, unique and crafted items, runewords and items in a shop. Normal and superior items with skills allow just the first one; on other items the lines run together.",
        advice: "Move the extra lines into the { } description, or limit the rule to MAG, RARE, SET, UNI, CRAFT or RW items.",
      }));
  }
  // Item-specific keywords.
  const onlyItemKw = name.replace(/%(RUNENAME|RUNENUM|GEMLEVEL|GEMTYPE|WHITE|RED|GREEN|BLUE|GOLD|GRAY|TAN|ORANGE|YELLOW|PURPLE|DARK_GREEN|CORAL|SAGE|TEAL|LIGHT_GRAY)%/g, "").trim() === "" && /%(RUNENAME|GEMLEVEL|GEMTYPE)%/.test(name);
  const tree = r.bh.tree;
  const runeOnly = !!tree && everywhere(tree, (x) => x.kw?.code === "RUNE" || (x.cls === "item" && /^r\d\ds?$/.test(x.code ?? "")));
  const gemOnly = !!tree && everywhere(tree, (x) => ["GEMLEVEL", "GEMTYPE", "GEM"].includes(x.kw?.code ?? "") || (x.cls === "item" && !!x.base?.tc.some((t) => /^gem[a-z]$|^gg[34][a-z]$/.test(t))));
  if (onlyItemKw && ((/RUNENAME/.test(name) && !runeOnly) || (/GEM(LEVEL|TYPE)/.test(name) && !gemOnly)))
    out.push(issue("out.item-keyword", l, i, "This output only has rune/gem keywords, but the rule can also match other items — which it then hides.", [], undefined, {
      detail: "%RUNENAME%, %RUNENUM%, %GEMLEVEL% and %GEMTYPE% are empty for items that aren't runes or gems, and an output that comes out empty hides the item.",
    }));
  // Color before %NAME% on built-in-color items.
  // Only worth saying when the color asked for differs from the built-in one (%GOLD% on a gold orb changes nothing).
  const builtIn = codes.length === 1 ? ITEM_BY_CODE.get(codes[0])?.col : undefined;
  const asked = name.match(/%([A-Z_]+)%\s*%NAME%/)?.[1];
  if (builtIn && asked && asked !== builtIn && COLOR_LIKE.test(`%${asked}%`) && !name.includes("%BASENAME%")) {
    const item = ITEM_BY_CODE.get(codes[0])!.n;
    out.push(issue("out.builtin-color", l, i, `${item} shows in ${builtIn.toLowerCase().replace("_", " ")} no matter what: its color is built into %NAME%, so %${asked}% has no effect.`, (l.value ?? "").includes("%NAME%") ? [{ label: "Use %BASENAME% instead", value: (l.value ?? "").replace("%NAME%", "%BASENAME%") }] : [], undefined, {
      detail: `PD2 stores ${item}'s name with its own color code inside it, which overrides any color written before %NAME%. %BASENAME% is the same text without that color.`,
      advice: `If you want it ${asked.toLowerCase().replace("_", " ")}, use %BASENAME%; otherwise remove %${asked}%.`,
    }));
  }
  return out;
}

// ------------------------------------------------------------------ line & definition checks

const DIRECTIVE_NAMES = ["ItemDisplay", "Alias", "Formula", "ItemDisplayFilterName"];

function lineIssues(l: Line, i: number): Issue[] {
  const out: Issue[] = [];
  const raw = l.raw;
  if (l.kind === "other") {
    const body = raw.trim();
    const m = body.match(/^(\w+)\s*\[/);
    if (m) {
      const exact = DIRECTIVE_NAMES.includes(m[1]) && !/^\w+\s+\[/.test(body);
      if (!body.includes(":")) out.push(issue("line.no-colon", l, i, `No “:” — PD2 still reads this line${m[1] === "Alias" ? " and an alias like this hangs the game" : ", using the whole line as the output"}.`));
      else if (exact) out.push(issue("line.bracket", l, i, "The part before “:” doesn't end with ] — PD2 cuts off its last character, usually leaving a rule that matches every item."));
      else if (DIRECTIVE_NAMES.some((d) => d.toLowerCase() === m[1].toLowerCase())) out.push(issue("line.directive-case", l, i, `“${m[1]}” must be written exactly ${DIRECTIVE_NAMES.find((d) => d.toLowerCase() === m[1].toLowerCase())}[ — this line is ignored.`));
      else out.push(issue("line.unknown-directive", l, i, `“${m[1]}” isn't a directive PD2 reads; this line is ignored.`));
    }
  }
  if ((l.kind === "rule" || l.kind === "alias" || l.kind === "formula") && !l.disabled) {
    if (/^\t +/.test(raw)) out.push(issue("line.indent", l, i, "Starts with a tab then spaces, so PD2 doesn't recognise the directive."));
    const colon = raw.indexOf(":");
    const cm = raw.indexOf("//");
    if (cm >= 0 && colon >= 0 && cm < colon) out.push(issue("line.comment-cut", l, i, "“//” appears before the “:” — PD2 cuts the line there."));
    if (l.note && /https?:$/.test(l.value ?? "")) out.push(issue("line.comment-cut", l, i, "A URL's // starts a comment, cutting the rest of the line."));
  }
  return out;
}

function aliasIssues(doc: FilterDoc, defs: Definitions, ctx: LintCtx): Issue[] {
  const out: Issue[] = [];
  const aliasLines = doc.lines.map((l, i) => [l, i] as const).filter(([l]) => l.kind === "alias" && !l.disabled);
  const seen = new Map<string, number>();
  const ruleText = doc.lines.filter((l) => l.kind === "rule" && !l.disabled).map((l) => l.key ?? "");
  const keywordCodes = [...COND_BY_CODE.keys()].filter((k) => /^[A-Z]/.test(k));
  // An alias is used when a rule names it as a whole word (or %NAME% in output), or when an alias
  // that is used contains it. Plain substring counting would call NOSTARUNIQUE "used" just because
  // NOSTARUNIQUEETH exists.
  const ruleWords = new Set(doc.lines.filter((l) => l.kind === "rule" && !l.disabled).flatMap((l) => `${l.key ?? ""} ${l.value ?? ""}`.match(/[A-Za-z0-9_]+/g) ?? []));
  const defsList = aliasList(doc.lines);
  const used = new Set<string>();
  const queue = defsList.filter((a) => ruleWords.has(a.name) || ruleWords.has(a.name.toUpperCase())).map((a) => a.name);
  while (queue.length) {
    const n = queue.pop()!;
    if (used.has(n)) continue;
    used.add(n);
    const val = defsList.find((a) => a.name === n)?.value ?? "";
    for (const b of defsList) if (!used.has(b.name) && containsWord(val, b.name)) queue.push(b.name);
  }
  aliasLines.forEach(([l, i], order) => {
    const rawKey = (l.key ?? "").trim();
    const name = rawKey.split(" ")[0];
    if (!name) return;
    if (rawKey !== name) out.push(issue("alias.space", l, i, `The name stops at the first space, so this defines “${name}”.`));
    if (seen.has(name)) out.push(issue("alias.dup", l, i, `${name} is already defined on line ${seen.get(name)! + 1}.`));
    else seen.set(name, i);
    // Self reference, following aliases defined later (which do expand inside this value).
    let v = l.value ?? "";
    for (const [l2] of aliasLines.slice(order + 1)) {
      const n2 = (l2.key ?? "").trim().split(" ")[0];
      if (n2 && v.includes(n2) && !(l2.value ?? "").includes(n2)) v = v.split(n2).join(l2.value ?? "");
    }
    if (v.includes(name) || v.includes(`%${name.toUpperCase()}%`)) out.push(issue("alias.self", l, i, `The value contains “${name}” itself, so PD2's replace loop never ends and the game hangs while loading.`));
    // Earlier aliases inside this value aren't expanded.
    const inner = [...ctx.orderPairs].filter((p) => p.startsWith(`${name}>`)).map((p) => p.slice(name.length + 1));
    // Only matters when some rule actually uses this alias.
    if (inner.length && ctx.aliasAt.get(name) === i && used.has(name)) {
      const where = inner.map((n0) => `${n0} (line ${ctx.aliasAt.get(n0)! + 1})`);
      out.push(issue("alias.order", l, i, `${list(inner)} ${inner.length > 1 ? "are" : "is"} used inside this alias but defined above it, so PD2 never expands ${inner.length > 1 ? "them" : "it"} here.`, inner.flatMap((n0) => aliasMoveFix(ctx, n0, name)), inner[0], {
        detail: `PD2 expands each alias once, top to bottom. ${list(where)} ${inner.length > 1 ? "are" : "is"} expanded before this alias inserts ${inner.length > 1 ? "them" : "it"}, so rules using ${name} end up with the plain word${inner.length > 1 ? "s" : ""} ${list(inner.map((x) => `“${x}”`))}, which PD2 drops as unknown.`,
        advice: moveAdvice(inner.flatMap((n0) => aliasMoveFix(ctx, n0, name)), `Each alias used inside ${name} must be defined below it.`),
      }));
    }
    if (COND_BY_CODE.has(name)) out.push(issue("alias.shadow", l, i, `${name} is a built-in keyword; the alias replaces it everywhere.`));
    // Clobbering: the alias name appears inside a longer word.
    const inKeyword = keywordCodes.find((k) => k !== name && k.includes(name));
    const re = new RegExp(`[A-Za-z0-9_]${name}|${name}[A-Za-z0-9_]`);
    const inRule = ruleText.find((t) => re.test(t) && !defs.aliases.has(t.match(new RegExp(`[A-Za-z0-9_]*${name}[A-Za-z0-9_]*`))?.[0] ?? ""));
    if (inKeyword || inRule) out.push(issue("alias.clobber", l, i, `“${name}” is also part of ${inKeyword ? `the keyword ${inKeyword}` : `“${inRule!.match(new RegExp(`[A-Za-z0-9_]*${name}[A-Za-z0-9_]*`))?.[0]}”`}, which gets rewritten too.`));
    if (!used.has(name)) {
      const inUnused = defsList.filter((a) => a.name !== name && containsWord(a.value, name)).map((a) => a.name);
      out.push(issue("alias.unused", l, i, `${name} isn't used by any rule.`, [{ label: "Delete this alias", remove: true }], undefined, {
        detail: inUnused.length
          ? `It only appears inside ${list(inUnused.slice(0, 3))}${inUnused.length > 3 ? " and others" : ""}, which no rule uses either.`
          : "No rule (and no alias a rule uses) mentions it, so it has no effect on the filter.",
      }));
    }
  });
  return out;
}

function formulaIssues(doc: FilterDoc): Issue[] {
  const out: Issue[] = [];
  const seen = new Map<string, number>();
  const text = doc.lines.filter((l) => l.kind === "rule" && !l.disabled).map((l) => `${l.key} ${l.value}`).join("\n").toUpperCase();
  doc.lines.forEach((l, i) => {
    if (l.kind !== "formula" || l.disabled) return;
    const key = l.key ?? "";
    const up = key.toUpperCase();
    const c = tryCompile(l.value ?? "");
    if (c.error) out.push(issue("formula.compile", l, i, `${c.error.message}.`));
    if (/\s/.test(key)) out.push(issue("formula.key", l, i, "The name contains spaces, so nothing can ever reference it."));
    else if (/\d/.test(key)) out.push(issue("formula.key", l, i, `The name contains digits: FORMULA${up} works in conditions, but %FORMULA${up}% prints literally and sums can't use it.`));
    if (seen.has(up)) out.push(issue("formula.dup", l, i, `FORMULA${up} is also defined on line ${seen.get(up)! + 1}; the last one that compiles wins.`));
    seen.set(up, i);
    if (c.node && hasChainedComparison(c.node)) out.push(issue("formula.chain", l, i, "A comparison is compared again (like 1<X<5), which is always 0 or 1. Use AND(X>1, X<5)."));
    if (!text.includes(`FORMULA${up}`)) out.push(issue("formula.unused", l, i, `FORMULA${up} isn't used by any rule.`));
  });
  return out;
}

function hasChainedComparison(n: FNode): boolean {
  const cmp = (x: FNode) => x.t === "bin" && ["==", "!=", ">", "<", ">=", "<="].includes(x.op);
  if (n.t === "bin") return (cmp(n) && (cmp(n.a) || cmp(n.b))) || hasChainedComparison(n.a) || hasChainedComparison(n.b);
  if (n.t === "un") return hasChainedComparison(n.a);
  if (n.t === "call") return n.args.some(hasChainedComparison);
  return false;
}

// ------------------------------------------------------------------ entry point

export interface LintOptions {
  /** File-level facts from loading (see platform.decodeFilter). */
  bom?: boolean;
  nonUtf8?: boolean;
  /** Check ids the user switched off. */
  disabled?: Set<string>;
}

export function lintDoc(doc: FilterDoc, compiled?: Compiled, opts: LintOptions = {}): Issue[] {
  const defs = compiled?.defs ?? collectDefinitions(doc.lines);
  const ctx = makeCtx(doc, defs);
  const out: Issue[] = [];
  const byIndex = new Map((compiled?.rules ?? []).map((r) => [r.index, r]));
  const first = doc.lines.findIndex((l) => l.kind !== "blank");
  if (opts.bom && first >= 0 && doc.lines[first].kind !== "comment") out.push(issue("file.bom", doc.lines[first], first, "The file starts with a byte-order mark and line 1 is a directive, so PD2 ignores it. Saving from Filter Forge removes the mark."));
  if (opts.nonUtf8 && first >= 0) out.push(issue("file.encoding", doc.lines[first], first, "This file isn't valid UTF-8. PD2 reads UTF-8 since Season 13, so special characters will show as �. Save it as UTF-8 (Settings → Save encoding)."));

  let catchAll = -1;
  const seenCond = new Map<string, number>();
  const levelCount = defs.levels.length;
  doc.lines.forEach((l, i) => {
    out.push(...lineIssues(l, i));
    if (l.kind !== "rule" || l.disabled) return;
    const r = byIndex.get(i) ?? compileRuleStandalone(l, i, defs);
    const cond = l.key ?? "";
    for (const ev of r.bh.events) out.push(...eventIssues(l, i, ev, cond, ctx, r.bh.events));
    out.push(...addPartIssues(l, i, cond, r.bh.events, defs));
    // AND/OR mixing is about how the text reads, so use the text as written.
    const { tree, error, mixed } = buildTree(tokenize(cond, defs).filter((t) => t.t !== "leaf" || t.leaf.cls !== "unknown"));
    if (!error && mixed) {
      const fixed = serializeTree(tree);
      out.push(issue("cond.mixed", l, i, "AND and OR are mixed without parentheses. PD2 reads them left to right with equal priority.", fixed !== cond ? [{ label: "Add parentheses showing how PD2 reads it", key: fixed, safe: true }] : []));
    }
    // Spaces around a comparison: a value keyword followed by an operator token.
    const sp = cond.match(/\b([A-Z][A-Z0-9_]*)\s+([<>=~])\s*(-?\d+(?:-\d+)?)/);
    if (sp && COND_BY_CODE.get(sp[1])?.kind === "value") out.push(issue("cond.spaces-op", l, i, `“${sp[0]}” has spaces around the comparison.`, [{ label: `Change to ${sp[1]}${sp[2]}${sp[3]}`, key: cond.replace(sp[0], `${sp[1]}${sp[2]}${sp[3]}`), safe: true }]));
    if (!r.error) out.push(...semanticIssues(l, i, r, levelCount), ...oddCodeIssues(l, i, r.bh.tree));
    out.push(...outputIssues(l, i, r, defs));
    if (!r.error) out.push(...outputContextIssues(l, i, r));

    const norm = cond.trim().replace(/\s+/g, " ");
    const cont = r.effects.cont;
    if (catchAll >= 0 && !cont) out.push(issue("flow.unreachable", l, i, `The rule on line ${catchAll + 1} matches every item and stops, so this one is never reached.`));
    if (!cont && !r.error) {
      if (r.tree == null && catchAll < 0) catchAll = i;
      const prev = seenCond.get(norm);
      if (prev != null && norm !== "") out.push(issue("flow.duplicate", l, i, `This rule is never used: line ${prev + 1} has exactly the same conditions and stops first.`, [{ label: "Delete this rule", remove: true }], undefined, {
          detail: `PD2 uses the first matching rule that doesn't end in %CONTINUE%. Every item this rule matches has already been decided by line ${prev + 1}, so this line's output never shows.`,
          advice: `If the two were meant to differ, fix the conditions here; otherwise delete it or merge its output into line ${prev + 1}.`,
        }));
      else if (norm !== "") seenCond.set(norm, i);
    }
  });
  out.push(...aliasIssues(doc, defs, ctx), ...formulaIssues(doc));
  if (defs.levels.length > MAX_FILTER_LEVELS) {
    const l = defs.levels[MAX_FILTER_LEVELS];
    const idx = doc.lines.findIndex((x) => x.id === l.id);
    out.push(issue("levels.max", doc.lines[idx], idx, `Only ${MAX_FILTER_LEVELS} filter levels are used; this and later ones are ignored.`));
  } else if (defs.levels.length > 9) {
    const l = defs.levels[9];
    const idx = doc.lines.findIndex((x) => x.id === l.id);
    out.push(issue("levels.hotkey", doc.lines[idx], idx, "Levels 10–12 can't be reached with the Ctrl+Numpad hotkeys."));
  }
  const filtered = opts.disabled?.size ? out.filter((x) => !opts.disabled!.has(x.check)) : out;
  for (const x of filtered) {
    const f = x.fixes.find((y) => y.key != null);
    if (f) {
      x.fixCond = f.key;
      x.fixLabel = f.label;
    }
  }
  return filtered.sort((a, b) => a.line - b.line);
}

function compileRuleStandalone(l: Line, index: number, defs: Definitions): CompiledRule {
  const c = compileCondition(l.key ?? "", defs);
  const action = buildAction(l.value ?? "", defs);
  return { index, id: l.id, tree: c.tree, error: c.error, bh: c.bh, out: l.value ?? "", action, effects: action.effects, notifies: action.isMap };
}

function classifyKeywordSafe(inner: string) {
  return classifyKeyword(inner).kind;
}

function moveAdvice(fixes: Fix[], why: string): string {
  const ok = fixes.find((f) => f.safe);
  return ok ? `${why} The fix below does that without affecting any other alias.` : `${why} Each possible move would also break another alias, so pick one and fix that too (expand for the options).`;
}

// ------------------------------------------------------------------ the user's own code

export interface CodeTry {
  /** The code as PD2 will read it (lowercased). */
  code: string;
  /** The item it names. */
  item?: string;
  fix?: Fix;
  /** Why it can't be used, or the new problems it would cause. Empty = safe to apply. */
  problems: string[];
}

/**
 * Check a code the user typed to replace an unknown item code: that an item has it, and that using it
 * doesn't cause a new problem on this rule (or make it a duplicate of another). Accepts an item name too.
 */
export function tryItemCode(lines: Line[], found: Issue, typed: string): CodeTry {
  const raw = typed.trim();
  const byName = DATA.items.find((it) => it.n.toLowerCase() === raw.toLowerCase());
  const code = byName ? byName.c : raw.toLowerCase();
  const sw = found.swap;
  const l = lines.find((x) => x.id === found.id);
  if (!sw || !l || !code) return { code, problems: [] };
  const it = ITEM_BY_CODE.get(code);
  if (!it) {
    const near = suggestItemCode(code).slice(0, 3).map((x) => `${x.text} (${x.why})`);
    return { code, problems: [`No item has the code “${code}” either.${near.length ? ` Did you mean ${list(near)}?` : ""}`] };
  }
  const cond = l.key ?? "";
  const key = replaceToken(cond, sw.token, sw.token.replace(sw.code, code));
  if (key == null) return { code, item: it.n, problems: ["This part of the rule has changed since the check ran."] };
  const fix: Fix = { label: `Use ${code} — ${it.n}`, key };
  const problems: string[] = [];
  const codes = [...cond.matchAll(/(?:^|[\s(!])([a-z0-9]{3,4})(?=$|[\s)!])/g)].map((m) => m[1]);
  if (codes.includes(code)) problems.push(`${code} (${it.n}) is already in this rule.`);

  // Lint just this rule, with the file's aliases, formulas and levels, before and after the change.
  const defsLines = lines.filter((x) => x.kind === "alias" || x.kind === "formula" || x.kind === "level");
  const lintOne = (k: string) => lintDoc({ lines: [...defsLines, editLine(l, { key: k })], eol: "\n" }).filter((x) => x.id === l.id);
  const before = new Map<string, number>();
  for (const x of lintOne(cond)) before.set(`${x.check}|${x.msg}`, (before.get(`${x.check}|${x.msg}`) ?? 0) + 1);
  for (const x of lintOne(key)) {
    const k = `${x.check}|${x.msg}`;
    if (before.get(k)) before.set(k, before.get(k)! - 1);
    else problems.push(x.msg);
  }

  // A rule that stops (no %CONTINUE%) with the same conditions as another: one of them is never used.
  if (!l.disabled) {
    const norm = (c: string) => c.trim().replace(/\s+/g, " ");
    const stops = (x: Line) => !/%CONTINUE%/i.test(x.value ?? "");
    const target = norm(key);
    const at = lines.indexOf(l);
    lines.forEach((x, j) => {
      if (j === at || x.kind !== "rule" || x.disabled || norm(x.key ?? "") !== target) return;
      if (j < at && stops(x)) problems.push(`Line ${j + 1} already has exactly these conditions and stops first, so this rule would never be used.`);
      else if (j > at && stops(l)) problems.push(`Line ${j + 1} has exactly these conditions, so it would never be used after this rule.`);
    });
  }
  return { code, item: it.n, fix, problems };
}
