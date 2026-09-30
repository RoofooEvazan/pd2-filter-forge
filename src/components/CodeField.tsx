// Single-line code input with autocomplete for filter keywords, aliases and item names.
import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { CONDITIONS, OUTPUTS } from "../lib/spec";
import { DATA } from "../lib/data";
import type { Definitions } from "../lib/document";

export interface CodeFieldHandle {
  insert: (text: string) => void;
  focus: () => void;
}

interface Suggestion {
  label: string;
  insert: string;
  detail: string;
}

function condSuggestions(word: string, defs: Definitions): Suggestion[] {
  if (word.length < 1) return [];
  const w = word.toLowerCase();
  const out: Suggestion[] = [];
  for (const k of CONDITIONS) {
    if (k.kind === "logic" && k.code === "!") continue;
    for (const c of [k.code, ...(k.alt ?? [])]) if (c.toLowerCase().startsWith(w)) out.push({ label: c, insert: c, detail: k.label });
  }
  for (const a of defs.aliases.keys()) if (a.toLowerCase().startsWith(w)) out.push({ label: a, insert: a, detail: "alias" });
  for (const f of defs.formulas.keys()) if (`formula${f}`.toLowerCase().startsWith(w)) out.push({ label: `FORMULA${f}`, insert: `FORMULA${f}`, detail: "formula" });
  if (w.length >= 2) {
    for (const i of DATA.items) {
      if (i.c.startsWith(w) || i.n.toLowerCase().startsWith(w)) out.push({ label: `${i.c}`, insert: i.c, detail: i.n });
      if (out.length > 60) break;
    }
  }
  return out.slice(0, 40);
}

function outSuggestions(word: string, defs: Definitions): Suggestion[] {
  const w = word.toUpperCase();
  const out: Suggestion[] = [];
  for (const k of OUTPUTS) {
    if (!k.code.startsWith(w)) continue;
    const ins = k.param === "hex" ? `%${k.code}-0A%` : k.param === "int" ? `%${k.code}-4714%` : k.param === "tier" ? `%${k.code}-1%` : k.param === "notify" ? `%${k.code}-DEAD%` : `%${k.code}%`;
    out.push({ label: ins, insert: ins, detail: k.label });
  }
  for (const a of defs.aliases.keys()) if (a.toUpperCase().startsWith(w)) out.push({ label: `%${a.toUpperCase()}%`, insert: `%${a.toUpperCase()}%`, detail: "alias" });
  for (const f of defs.formulas.keys()) if (`FORMULA${f}`.startsWith(w)) out.push({ label: `%FORMULA${f}%`, insert: `%FORMULA${f}%`, detail: "formula value" });
  return out.slice(0, 40);
}

export const CodeField = forwardRef<CodeFieldHandle, { value: string; onChange: (v: string) => void; mode: "cond" | "out"; defs: Definitions; placeholder?: string }>(
  function CodeField({ value, onChange, mode, defs, placeholder }, ref) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [draft, setDraft] = useState<string | null>(null);
    const [caret, setCaret] = useState(0);
    const [open, setOpen] = useState(false);
    const [cur, setCur] = useState(0);
    const text = draft ?? value;

    const word = useMemo(() => {
      const before = text.slice(0, caret);
      if (mode === "out") {
        const pct = before.lastIndexOf("%");
        const count = (before.match(/%/g) ?? []).length;
        if (pct >= 0 && count % 2 === 1 && /^[A-Za-z0-9_-]*$/.test(before.slice(pct + 1))) return { start: pct, text: before.slice(pct + 1) };
        return null;
      }
      const m = before.match(/[A-Za-z0-9_]+$/);
      return m ? { start: caret - m[0].length, text: m[0] } : null;
    }, [text, caret, mode]);

    const sugg = useMemo(() => (word ? (mode === "out" ? outSuggestions(word.text, defs) : condSuggestions(word.text, defs)) : []), [word, mode, defs]);

    const commit = (v: string) => {
      setDraft(null);
      if (v !== value) onChange(v);
    };
    const apply = (s: Suggestion) => {
      if (!word) return;
      const end = mode === "out" && text[caret] === "%" ? caret + 1 : caret;
      const next = text.slice(0, word.start) + s.insert + text.slice(end);
      const pos = word.start + s.insert.length;
      commit(next);
      setOpen(false);
      requestAnimationFrame(() => {
        inputRef.current?.setSelectionRange(pos, pos);
        setCaret(pos);
      });
    };

    useImperativeHandle(ref, () => ({
      insert(t: string) {
        const el = inputRef.current;
        const s = el?.selectionStart ?? text.length;
        const e = el?.selectionEnd ?? text.length;
        const next = text.slice(0, s) + t + text.slice(e);
        commit(next);
        requestAnimationFrame(() => {
          el?.focus();
          el?.setSelectionRange(s + t.length, s + t.length);
        });
      },
      focus() {
        inputRef.current?.focus();
      },
    }));

    return (
      <div style={{ position: "relative" }}>
        <input
          ref={inputRef}
          className="input mono"
          style={{ width: "100%" }}
          spellCheck={false}
          placeholder={placeholder}
          value={text}
          onChange={(e) => {
            setDraft(e.target.value);
            setCaret(e.target.selectionStart ?? 0);
            setOpen(true);
            setCur(0);
          }}
          onSelect={(e) => setCaret((e.target as HTMLInputElement).selectionStart ?? 0)}
          onBlur={() => {
            setTimeout(() => setOpen(false), 150);
            if (draft != null) commit(draft);
          }}
          onKeyDown={(e) => {
            if (open && sugg.length) {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setCur((c) => Math.min(sugg.length - 1, c + 1));
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setCur((c) => Math.max(0, c - 1));
                return;
              }
              if (e.key === "Tab" || (e.key === "Enter" && word && word.text.length > 0)) {
                e.preventDefault();
                apply(sugg[cur]);
                return;
              }
              if (e.key === "Escape") {
                setOpen(false);
                return;
              }
            }
            if (e.key === "Enter") commit(text);
          }}
        />
        {open && sugg.length > 0 && word && (
          <div className="ac" style={{ top: 36, left: 0 }}>
            {sugg.map((s, i) => (
              <div key={s.label + i} className={`pitem ${i === cur ? "on" : ""}`} onMouseDown={(e) => { e.preventDefault(); apply(s); }}>
                <span className="mono small main-t">{s.label}</span>
                <span className="sub ellipsis" style={{ maxWidth: 170 }}>{s.detail}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
);
