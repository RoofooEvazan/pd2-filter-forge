// Derived data for the open filter (compiled rules, problems, sections), computed once per
// document version and shared by every component that asks.
import { useDeferredValue, useMemo } from "react";
import { collectDefinitions, computeSections, type Line, type Section, type Definitions } from "../lib/document";
import { compileDoc, runFilter, type Compiled, type CompiledRule, type FilterResult } from "../lib/engine";
import { lintDoc, type Issue } from "../lib/lint";
import { getState, useStore } from "./store";

export interface Analysis {
  lines: Line[];
  compiled: Compiled;
  defs: Definitions;
  issues: Issue[];
  issuesById: Map<string, Issue[]>;
  sections: Section[];
  /** Line id -> index. */
  indexOf: Map<string, number>;
  ruleById: Map<string, CompiledRule>;
  counts: { error: number; warn: number; info: number };
}

let last: { lines: Line[]; a: Analysis } | null = null;

export function analyse(lines: Line[]): Analysis {
  if (last && last.lines === lines) return last.a;
  const doc = { lines, eol: "\n" as const };
  const compiled = compileDoc(doc);
  const s = getState();
  const issues = lintDoc(doc, compiled, { bom: s.fileFacts.bom, nonUtf8: s.fileFacts.nonUtf8, disabled: new Set(s.settings.disabledChecks) });
  const issuesById = new Map<string, Issue[]>();
  const counts = { error: 0, warn: 0, info: 0 };
  for (const i of issues) {
    (issuesById.get(i.id) ?? issuesById.set(i.id, []).get(i.id)!).push(i);
    counts[i.sev === "error" ? "error" : i.sev]++;
  }
  const a: Analysis = {
    lines,
    compiled,
    defs: compiled.defs ?? collectDefinitions(lines),
    issues,
    issuesById,
    sections: computeSections(lines),
    indexOf: new Map(lines.map((l, i) => [l.id, i])),
    ruleById: new Map(compiled.rules.map((r) => [r.id, r])),
    counts,
  };
  last = { lines, a };
  return a;
}

const EMPTY: Line[] = [];

/** Analysis of the current document. Deferred so typing stays responsive on huge filters. */
export function useAnalysis(): Analysis {
  const lines = useStore((s) => s.doc?.lines ?? EMPTY);
  const deferred = useDeferredValue(lines);
  return useMemo(() => analyse(deferred), [deferred]);
}

/** Result of running the whole filter on the current test item and context. */
export function useTestResult(): FilterResult | null {
  const a = useAnalysis();
  const item = useStore((s) => s.testItem);
  const ctx = useStore((s) => s.ctx);
  return useMemo(() => (a.lines.length ? runFilter(a.compiled, item, ctx) : null), [a, item, ctx]);
}
