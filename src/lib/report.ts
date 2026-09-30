// A plain-text Problems report, written to be pasted into an AI assistant as a prompt.
import { editLine, type Line } from "./document";
import { CHECK_BY_ID, IMPACTS, type Impact, type Issue } from "./lint";

const IMPACT_ORDER: Impact[] = ["breaks", "broadens", "misleads", "display", "tidy"];

/** Engine facts an assistant needs to judge the fixes; all from docs/PD2-Filter-Engine-Reference.md. */
const PRIMER = [
  "Rules are `ItemDisplay[conditions]: output` and run top to bottom. The first matching rule without %CONTINUE% decides how an item looks.",
  "AND and OR have equal priority and are read left to right (A OR B C means (A OR B) AND C). Use parentheses.",
  "Only one-character comparisons exist: > < = and ~a-b ranges. >=, <=, == and != make PD2 drop the whole condition.",
  "Unknown words are silently dropped, so the rule matches more than written. Keywords are case-sensitive, and a lowercase word is read as an item code.",
  "Aliases are plain text replacement, applied once each in file order. An alias used inside another alias must be defined BELOW the alias that uses it.",
  "`//` starts a comment anywhere on a line. The description is the text between the first { and the first }.",
  "Names are cut at 56 visible characters (512 in shops). Only an exactly empty output hides an item.",
  "%TIER-n% is one digit (0-9) and only affects rules that have a minimap icon or sound.",
];

export interface ReportOptions {
  fileName?: string;
  /** Whether the list is filtered (by impact or search) rather than everything. */
  filtered?: string;
}

function fixPreview(l: Line, f: Issue["fixes"][number], lines: Line[]): string {
  if (f.remove) return "delete this line";
  if (f.move) {
    const from = lines.findIndex((x) => x.id === f.move!.id);
    const to = lines.findIndex((x) => x.id === (f.move!.after ?? f.move!.before));
    return `move line ${from + 1} to just ${f.move.after ? "below" : "above"} line ${to + 1}`;
  }
  return editLine(l, { ...(f.key != null ? { key: f.key } : {}), ...(f.value != null ? { value: f.value } : {}) }).raw.trim();
}

export function problemsReport(issues: Issue[], lines: Line[], opts: ReportOptions = {}): string {
  const out: string[] = [];
  const name = opts.fileName ?? "my loot filter";
  out.push(`I'm working on a Project Diablo 2 (PD2) loot filter, "${name}". PD2 Filter Forge found the problems below.`);
  out.push("Please help me fix them. For each one, explain what's wrong in plain words and give me the corrected line(s) exactly as they should appear in the filter file.");
  out.push("If a suggested fix is only a guess, check whether it matches what the rule is clearly meant to do, and ask me if it's ambiguous. Don't change the meaning of rules that aren't listed.");
  out.push("");
  out.push("How PD2's filter engine reads filters (important for judging fixes):");
  for (const p of PRIMER) out.push(`- ${p}`);
  out.push("");
  const counts = IMPACT_ORDER.map((k) => [k, issues.filter((i) => CHECK_BY_ID.get(i.check)?.impact === k).length] as const).filter(([, n]) => n);
  out.push(`${issues.length} problem${issues.length === 1 ? "" : "s"}${opts.filtered ? ` (${opts.filtered})` : ""}: ${counts.map(([k, n]) => `${n} ${IMPACTS[k].label.toLowerCase()}`).join(", ")}.`);

  let n = 0;
  for (const impact of IMPACT_ORDER) {
    const group = issues.filter((i) => CHECK_BY_ID.get(i.check)?.impact === impact).sort((a, b) => a.line - b.line);
    if (!group.length) continue;
    out.push("");
    out.push(`==================== ${IMPACTS[impact].label.toUpperCase()} (${group.length}) ====================`);
    out.push(IMPACTS[impact].blurb);
    for (const i of group) {
      const def = CHECK_BY_ID.get(i.check)!;
      const l = lines[i.line];
      n++;
      out.push("");
      out.push(`#${n}  Line ${i.line + 1} — ${def.title}`);
      if (l) out.push(`  Line:        ${l.raw.trim()}`);
      if (i.token && l && !l.raw.includes(i.token)) out.push(`  Part:        ${i.token} (comes from an alias)`);
      else if (i.token) out.push(`  Part:        ${i.token}`);
      out.push(`  Problem:     ${i.msg}`);
      out.push(`  PD2 does:    ${i.detail ?? def.why}`);
      const advice = i.advice ?? def.advice;
      if (advice) out.push(`  Suggestion:  ${advice}`);
      if (l)
        i.fixes.forEach((f, k) => {
          out.push(`  Fix ${i.fixes.length > 1 ? `${k + 1} ` : ""}(${f.safe ? "certain" : "guess"}): ${f.label}`);
          out.push(`    -> ${fixPreview(l, f, lines)}`);
        });
    }
  }
  out.push("");
  return out.join("\n");
}
