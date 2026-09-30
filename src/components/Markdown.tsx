// Minimal Markdown renderer for the bundled engine reference: headings, paragraphs, nested lists,
// tables, code, bold/italic, links and <a id="…"> anchors. No other HTML is rendered.
import { useEffect, useMemo, type ReactNode } from "react";
import { openExternal } from "../lib/platform";

function inline(text: string, key = 0): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = key;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith("`")) out.push(<code key={k++}>{t.slice(1, -1)}</code>);
    else if (t.startsWith("**")) out.push(<b key={k++}>{inline(t.slice(2, -2), k * 100)}</b>);
    else if (t.startsWith("*")) out.push(<i key={k++}>{inline(t.slice(1, -1), k * 100)}</i>);
    else {
      const lm = t.match(/^\[([^\]]+)\]\(([^)]+)\)$/)!;
      const href = lm[2];
      out.push(
        <a
          key={k++}
          href={href}
          onClick={(e) => {
            e.preventDefault();
            if (href.startsWith("#")) document.getElementById(`ref-${href.slice(1)}`)?.scrollIntoView({ behavior: "smooth" });
            else openExternal(href);
          }}
        >
          {inline(lm[1], k * 100)}
        </a>
      );
    }
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Block =
  | { kind: "list"; ordered: boolean; items: { text: string; children: Block[] }[] }
  | { kind: "table"; rows: string[][] }
  | { kind: "para"; text: string };

const LIST_RE = /^(\s*)(-|\d+\.)\s+(.*)$/;
const indentOf = (s: string) => s.match(/^(\s*)/)![1].length;

function splitRow(line: string): string[] {
  const PIPE = "\u0000";
  return line
    .trim()
    .split("\\|")
    .join(PIPE)
    .split("|")
    .slice(1, -1)
    .map((c) => c.split(PIPE).join("|").trim());
}

function tableRows(lines: string[], i: number): [string[][], number] {
  const rows: string[][] = [];
  while (i < lines.length && lines[i].trim().startsWith("|")) {
    const r = splitRow(lines[i]);
    if (!r.every((c) => /^:?-+:?$/.test(c))) rows.push(r);
    i++;
  }
  return [rows, i];
}

/** Parse a list starting at line i with the given indent; deeper items and tables become children. */
function parseList(lines: string[], i: number, indent: number): [Block, number] {
  const first = lines[i].match(LIST_RE)!;
  const list: { kind: "list"; ordered: boolean; items: { text: string; children: Block[] }[] } = { kind: "list", ordered: /\d/.test(first[2]), items: [] };
  while (i < lines.length) {
    const line = lines[i];
    const m = line.match(LIST_RE);
    const cur = list.items[list.items.length - 1];
    if (m && m[1].length === indent) {
      list.items.push({ text: m[3], children: [] });
      i++;
      continue;
    }
    if (m && m[1].length > indent && cur) {
      const [child, next] = parseList(lines, i, m[1].length);
      cur.children.push(child);
      i = next;
      continue;
    }
    if (cur && line.trim() && indentOf(line) > indent) {
      if (line.trim().startsWith("|")) {
        const [rows, next] = tableRows(lines, i);
        cur.children.push({ kind: "table", rows });
        i = next;
      } else {
        if (cur.children.length) cur.children.push({ kind: "para", text: line.trim() });
        else cur.text += " " + line.trim();
        i++;
      }
      continue;
    }
    // A blank line inside a list continues it when the next line is still indented.
    if (cur && !line.trim() && i + 1 < lines.length && lines[i + 1].trim() && indentOf(lines[i + 1]) > indent) {
      i++;
      continue;
    }
    break;
  }
  return [list, i];
}

function MdTable({ rows }: { rows: string[][] }) {
  const [head, ...body] = rows;
  return (
    <table className="table md-table">
      <thead>
        <tr>
          {head.map((c, j) => (
            <th key={j}>{inline(c)}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {body.map((r, ri) => (
          <tr key={ri}>
            {r.map((c, j) => (
              <td key={j}>{inline(c)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function renderBlock(b: Block, key: number): ReactNode {
  if (b.kind === "para") return <p key={key}>{inline(b.text)}</p>;
  if (b.kind === "table") return <MdTable key={key} rows={b.rows} />;
  const L = b.ordered ? "ol" : "ul";
  return (
    <L key={key}>
      {b.items.map((it, j) => (
        <li key={j}>
          {inline(it.text)}
          {it.children.map((c, k) => renderBlock(c, k))}
        </li>
      ))}
    </L>
  );
}

function parse(md: string): ReactNode[] {
  const lines = md.split(/\r?\n/);
  const out: ReactNode[] = [];
  let i = 0;
  let key = 0;
  let pendingAnchor: string | null = null;
  while (i < lines.length) {
    const line = lines[i];
    const anchor = line.match(/^<a id="([^"]+)"><\/a>$/);
    if (anchor) {
      pendingAnchor = anchor[1];
      i++;
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const Tag = `h${Math.min(4, h[1].length + 1)}` as "h2";
      out.push(
        <Tag key={key++} id={pendingAnchor ? `ref-${pendingAnchor}` : undefined}>
          {inline(h[2])}
        </Tag>
      );
      pendingAnchor = null;
      i++;
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      out.push(<hr key={key++} />);
      i++;
      continue;
    }
    if (line.trim().startsWith("|")) {
      const [rows, next] = tableRows(lines, i);
      out.push(<MdTable key={key++} rows={rows} />);
      i = next;
      continue;
    }
    const lm = line.match(LIST_RE);
    if (lm) {
      const [block, next] = parseList(lines, i, lm[1].length);
      out.push(renderBlock(block, key++));
      i = next;
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    let para = line;
    i++;
    while (i < lines.length && lines[i].trim() && !/^(#|\||<a |\s*(-|\d+\.)\s|---)/.test(lines[i])) para += " " + lines[i++];
    out.push(<p key={key++}>{inline(para)}</p>);
  }
  return out;
}

export function Markdown({ source, anchor }: { source: string; anchor?: { id: string; n: number } | null }) {
  const nodes = useMemo(() => parse(source), [source]);
  useEffect(() => {
    if (!anchor) return;
    const el = document.getElementById(`ref-${anchor.id}`);
    if (el) {
      el.scrollIntoView({ block: "start" });
      el.classList.add("flash");
      setTimeout(() => el.classList.remove("flash"), 1600);
    }
  }, [anchor]);
  return <div className="md">{nodes}</div>;
}
