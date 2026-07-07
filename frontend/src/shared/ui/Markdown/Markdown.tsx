import { createElement, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import styles from './Markdown.module.css';

interface MarkdownProps {
  source: string;
}

// Lightweight Markdown -> React renderer (ChatGPT-style), ported from the
// Popvich Chat design. No dependency: the app ships only react + react-router,
// and assistant replies are trusted, small, and need just the common subset
// (headings, lists, tables, code, quotes, task lists, inline emphasis, links).
// Order matters in the inline pass: code / escapes win before emphasis so a
// backtick span or an escaped char is never re-parsed.

interface ListItem {
  indent: number;
  ordered: boolean;
  checked: boolean | null;
  text: string;
}

interface Cursor {
  i: number;
}

const INLINE_RE =
  /(\\[`*_~{}[\]()#+\-.!>])|(`+)([^`]*?)\2|(\*\*\*(?=\S)([\s\S]+?)\*\*\*|___(?=\S)([\s\S]+?)___)|(\*\*(?=\S)([\s\S]+?)\*\*|__(?=\S)([\s\S]+?)__)|(\*(?=\S)([^*]+?)\*|_(?=\S)([^_]+?)_)|(~~(?=\S)([\s\S]+?)~~)|(\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\))|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?])/g;

const HEADING_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;

function renderInline(text: string | null | undefined, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  if (text == null) return nodes;
  const re = new RegExp(INLINE_RE.source, 'g');
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  const push = (n: ReactNode): void => {
    if (n !== '' && n != null) nodes.push(n);
  };
  while ((m = re.exec(text)) !== null) {
    if (re.lastIndex === m.index) {
      re.lastIndex++;
      continue;
    }
    if (m.index > last) push(text.slice(last, m.index));
    const key = `${keyPrefix}-${i++}`;
    if (m[1] !== undefined) {
      push(m[1].slice(1)); // escaped char
    } else if (m[2] !== undefined) {
      push(
        <code key={key} className={styles.inlineCode}>
          {m[3]}
        </code>,
      );
    } else if (m[4] !== undefined) {
      push(
        <strong key={key} style={{ fontStyle: 'italic' }}>
          {renderInline(m[5] ?? m[6], key)}
        </strong>,
      );
    } else if (m[7] !== undefined) {
      push(<strong key={key}>{renderInline(m[8] ?? m[9], key)}</strong>);
    } else if (m[10] !== undefined) {
      push(<em key={key}>{renderInline(m[11] ?? m[12], key)}</em>);
    } else if (m[13] !== undefined) {
      push(<del key={key}>{renderInline(m[14], key)}</del>);
    } else if (m[15] !== undefined) {
      push(
        <a key={key} href={m[17]} target="_blank" rel="noreferrer noopener">
          {renderInline(m[16] || m[17], key)}
        </a>,
      );
    } else if (m[18] !== undefined) {
      push(
        <a key={key} href={m[18]} target="_blank" rel="noreferrer noopener">
          {m[18]}
        </a>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) push(text.slice(last));
  return nodes;
}

// Honor hard line breaks (two trailing spaces, or a backslash at EOL) inside a
// paragraph while collapsing soft wraps.
function renderInlineWithBreaks(text: string, keyPrefix: string): ReactNode[] {
  const segments = String(text).split(/(?: {2,}|\\)\n/);
  const out: ReactNode[] = [];
  segments.forEach((seg, idx) => {
    if (idx > 0) out.push(<br key={`${keyPrefix}-br${idx}`} />);
    renderInline(seg.replace(/\n/g, ' '), `${keyPrefix}-s${idx}`).forEach((n) => out.push(n));
  });
  return out;
}

// Split a table row on unescaped pipes, dropping one optional leading/trailing pipe.
function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  return s.split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, '|').trim());
}

// Parse one line as a list item, or null. Handles -, *, +, ordered (1. / 1)),
// and task-list checkboxes. Indent measured in spaces (tab = 2).
function listMarker(line: string): ListItem | null {
  const mm = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/.exec(line);
  if (!mm) return null;
  const indent = mm[1]!.replace(/\t/g, '  ').length;
  let text = mm[3]!;
  let checked: boolean | null = null;
  const task = /^\[([ xX])\]\s+(.*)$/.exec(text);
  if (task) {
    checked = task[1]!.toLowerCase() === 'x';
    text = task[2]!;
  }
  return { indent, ordered: /\d/.test(mm[2]!), checked, text };
}

const CheckIcon = (): ReactElement => (
  <svg
    width={10}
    height={10}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={3.5}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M20 6L9 17l-5-5" />
  </svg>
);

// Build a nested list from flat items using a shared cursor. Consumes one run of
// siblings at the current indent; recurses for deeper-indented children.
function renderList(items: ListItem[], cur: Cursor, key: string): ReactElement {
  const first = items[cur.i]!;
  const indent = first.indent;
  const ordered = first.ordered;
  const isTask = first.checked !== null;
  const lis: ReactElement[] = [];
  let n = 0;
  while (cur.i < items.length && items[cur.i]!.indent === indent) {
    const it = items[cur.i]!;
    cur.i++;
    const kids: ReactElement[] = [];
    while (cur.i < items.length && items[cur.i]!.indent > indent) {
      kids.push(renderList(items, cur, `${key}-n${n++}`));
    }
    const liKids: ReactNode[] = [
      it.checked !== null ? (
        <span
          key="cb"
          className={`${styles.checkbox}${it.checked ? ` ${styles.checkboxOn}` : ''}`}
        >
          {it.checked ? <CheckIcon /> : null}
        </span>
      ) : null,
      <span key="tx">{renderInline(it.text, `${key}-t${n}`)}</span>,
      ...kids,
    ];
    lis.push(
      <li key={n++} className={isTask ? styles.taskItem : undefined}>
        {liKids}
      </li>,
    );
  }
  const Tag = ordered ? 'ol' : 'ul';
  return createElement(Tag, { key, className: isTask ? styles.taskList : undefined }, lis);
}

const CopyIcon = (): ReactElement => (
  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <rect x={9} y={9} width={13} height={13} rx={2} />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

function CodeBlock({ code, lang }: { code: string; lang: string }): ReactElement {
  const [copied, setCopied] = useState(false);
  const onCopy = (): void => {
    void navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div className={styles.codeBlock}>
      <div className={styles.codeHead}>
        <span>{lang || 'code'}</span>
        <button type="button" className={styles.copyBtn} onClick={onCopy}>
          <CopyIcon />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}

function renderTable(
  header: string[],
  rows: string[][],
  aligns: Array<'left' | 'center' | 'right'>,
  key: string,
): ReactElement {
  const cols = header.length;
  const al = (ci: number): 'left' | 'center' | 'right' => aligns[ci] ?? 'left';
  const pad = (r: string[]): string[] => {
    const c = r.slice(0, cols);
    while (c.length < cols) c.push('');
    return c;
  };
  return (
    <div key={key} className={styles.tableWrap}>
      <table>
        <thead>
          <tr>
            {pad(header).map((c, idx) => (
              <th key={idx} style={{ textAlign: al(idx) }}>
                {renderInline(c, `${key}-th${idx}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri}>
              {pad(r).map((c, ci) => (
                <td key={ci} style={{ textAlign: al(ci) }}>
                  {renderInline(c, `${key}-td${ri}-${ci}`)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderMarkdown(src: string, keyPrefix: string): ReactElement[] {
  const lines = String(src).replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactElement[] = [];
  let i = 0;
  let k = 0;
  const nextKey = (): string => `${keyPrefix}-b${k++}`;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.trim() === '') {
      i++;
      continue;
    }
    // fenced code (``` or ~~~; tolerates an unclosed fence at EOF)
    const fence = /^(```+|~~~+)(.*)$/.exec(line.trim());
    if (fence) {
      const marker = fence[1]![0]!;
      const lang = fence[2]!.trim().split(/\s+/)[0] || '';
      const buf: string[] = [];
      i++;
      while (i < lines.length && lines[i]!.trim().charAt(0) !== marker) {
        buf.push(lines[i]!);
        i++;
      }
      i++;
      blocks.push(<CodeBlock key={nextKey()} code={buf.join('\n').replace(/\s+$/, '')} lang={lang} />);
      continue;
    }
    // heading
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (h) {
      const lvl = h[1]!.length;
      blocks.push(createElement(HEADING_TAGS[lvl - 1]!, { key: nextKey() }, renderInline(h[2], nextKey())));
      i++;
      continue;
    }
    // hr
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      blocks.push(<hr key={nextKey()} />);
      i++;
      continue;
    }
    // blockquote
    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i]!)) {
        buf.push(lines[i]!.replace(/^>\s?/, ''));
        i++;
      }
      blocks.push(<blockquote key={nextKey()}>{renderInline(buf.join(' '), nextKey())}</blockquote>);
      continue;
    }
    // table (GitHub-style; leading pipe optional, alignment row parsed)
    if (
      line.includes('|') &&
      i + 1 < lines.length &&
      /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1]!) &&
      lines[i + 1]!.includes('-') &&
      /[|:-]/.test(lines[i + 1]!)
    ) {
      const header = splitRow(line);
      const aligns = splitRow(lines[i + 1]!).map((c): 'left' | 'center' | 'right' => {
        const l = c.startsWith(':');
        const r = c.endsWith(':');
        return l && r ? 'center' : r ? 'right' : 'left';
      });
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i]!.includes('|') && lines[i]!.trim() !== '') {
        rows.push(splitRow(lines[i]!));
        i++;
      }
      blocks.push(renderTable(header, rows, aligns, nextKey()));
      continue;
    }
    // list (unordered / ordered / task) — collect the whole block, allowing
    // blank lines between items (loose lists) and indented continuation lines.
    if (listMarker(line)) {
      const items: ListItem[] = [];
      while (i < lines.length) {
        const cur = lines[i]!;
        const mk = listMarker(cur);
        if (mk) {
          items.push(mk);
          i++;
        } else if (cur.trim() === '' && i + 1 < lines.length && listMarker(lines[i + 1]!)) {
          i++; // blank line inside a loose list
        } else if (/^\s{2,}\S/.test(cur) && items.length) {
          items[items.length - 1]!.text += ` ${cur.trim()}`; // wrapped continuation
          i++;
        } else {
          break;
        }
      }
      blocks.push(renderList(items, { i: 0 }, nextKey()));
      continue;
    }
    // paragraph (gather consecutive plain lines; honor hard line breaks)
    const buf: string[] = [];
    while (
      i < lines.length &&
      lines[i]!.trim() !== '' &&
      !/^(#{1,6}\s|>|```|~~~)/.test(lines[i]!) &&
      !listMarker(lines[i]!) &&
      !/^(-{3,}|\*{3,}|_{3,})$/.test(lines[i]!.trim())
    ) {
      buf.push(lines[i]!);
      i++;
    }
    blocks.push(<p key={nextKey()}>{renderInlineWithBreaks(buf.join('\n'), nextKey())}</p>);
  }
  return blocks;
}

export function Markdown({ source }: MarkdownProps): ReactElement {
  return <div className={styles.markdown}>{renderMarkdown(source, 'md')}</div>;
}
